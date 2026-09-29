'use strict';

/**
 * Testy funkcji z trzeciej wersji: regulamin i treści, szybki kreator, wczytywanie projektu,
 * cofanie budowy, własne kanały w istniejących sekcjach, nazwy ról, filtr profili w AutoMod.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { createAnswers, applyDefaults } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { executeBlueprint } = require('../src/builder/executor');
const { SessionStore } = require('../src/wizard/sessions');
const { createWizard } = require('../src/wizard/router');
const { parseFaq } = require('../src/wizard/steps');
const { sanitizeAnswers } = require('../src/wizard/project');
const undo = require('../src/wizard/undo');
const { FakeGuild } = require('./helpers/fakeDiscord');
const { createInteraction } = require('./helpers/fakeInteraction');

const config = { sessionTimeoutMinutes: 30, ownerOnly: false };

async function buildOn(guild, answers) {
  const blueprint = buildBlueprint(answers);
  assert.deepEqual(blueprint.errors, []);
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '2' });
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  return { blueprint, result };
}

const embedsText = (messages) => messages.flatMap((m) => m.embeds.map((e) => JSON.stringify(e.toJSON()))).join('\n');

test('regulamin: własne zasady, wybrane paragrafy i system punktowy trafiają do regulaminu', async () => {
  const guild = new FakeGuild();
  const answers = createAnswers('gaming');
  answers.texts.customRules = ['Zakaz rozmów o polityce', 'Na #memy tylko memy'];
  answers.texts.ruleSections = ['general', 'punishments'];
  answers.texts.punishments = 'points';
  const { result } = await buildOn(guild, answers);
  const text = embedsText(guild.channels.cache.get(result.channels.rules).messages);
  assert.match(text, /Zakaz rozmów o polityce/);
  assert.match(text, /Zasady dodatkowe/);
  assert.match(text, /Postanowienia ogólne/);
  assert.doesNotMatch(text, /Kultura i zachowanie/, 'odznaczony paragraf nie trafia do regulaminu');
  assert.match(text, /10 pkt/, 'system punktowy');
});

test('regulamin: bardzo długi regulamin dzieli się na kilka wiadomości w limitach Discorda', async () => {
  const guild = new FakeGuild();
  const answers = createAnswers('fivem');
  answers.texts.customRules = Array.from({ length: 20 }, (_, i) => `Zasada numer ${i + 1}: ${'bardzo długi opis zasady '.repeat(18)}`);
  const { result } = await buildOn(guild, answers);
  assert.ok(guild.channels.cache.get(result.channels.rules).messages.length >= 2);
});

test('FAQ: własne pytania (z domyślnymi i bez) oraz parsowanie formatu „pytanie | odpowiedź”', async () => {
  assert.deepEqual(parseFaq('Kiedy eventy? | W piątki\nJak zostać VIP? Pomagaj innym\nbez separatora'), [
    { q: 'Kiedy eventy?', a: ' W piątki'.trim() },
    { q: 'Jak zostać VIP?', a: 'Pomagaj innym' },
  ]);
  const guild = new FakeGuild();
  const answers = createAnswers('community');
  answers.modules.push('faq');
  answers.texts.customFaq = [{ q: 'Kiedy są eventy?', a: 'W każdy piątek o 20:00' }];
  answers.texts.faqDefaults = false;
  const { result } = await buildOn(guild, answers);
  const text = embedsText(guild.channels.cache.get(result.channels.faq).messages);
  assert.match(text, /Kiedy są eventy/);
  assert.doesNotMatch(text, /Jak zdobyć rolę/, 'standardowe pytania ukryte');
});

test('pierwsze ogłoszenie: publikowane na #ogłoszenia z oznaczeniem roli „Ogłoszenia”', async () => {
  const guild = new FakeGuild();
  const answers = createAnswers('gaming');
  answers.texts.announcement = { title: '🎉 Startujemy!', text: 'Serwer oficjalnie otwarty.', ping: 'role' };
  const { result } = await buildOn(guild, answers);
  const msg = guild.channels.cache.get(result.channels.announcements).messages.at(-1);
  assert.match(JSON.stringify(msg.embeds[0].toJSON()), /Serwer oficjalnie otwarty/);
  assert.equal(msg.content, `<@&${result.roles.n_announcements}>`);
});

test('własne kanały: do istniejącej sekcji z wybranym dostępem i do nowej kategorii', () => {
  const answers = createAnswers('gaming');
  answers.customCategories = [
    { target: 'community', name: '', text: ['pomysły'], voice: ['Nocne rozmowy'], access: 'public', emoji: '📁' },
    { target: 'staff', name: '', text: ['rekrutacja'], voice: [], access: 'staff', emoji: '📁' },
    { target: 'new', name: 'Turnieje', text: ['zapisy'], voice: [], access: 'readonly', emoji: '🏆' },
  ];
  const bp = buildBlueprint(answers);
  const catOf = (key) => bp.categories.find((c) => c.channels.some((ch) => ch.key === key));
  assert.equal(catOf('custom0t0').section, 'community');
  assert.equal(catOf('custom0v0').section, 'community');
  assert.equal(catOf('custom1t0').section, 'staff');
  assert.equal(catOf('custom2t0').name.includes('TURNIEJE'), true);
  assert.equal(catOf('custom2t0').channels[0].access.write, 'readonly');
});

test('nazwy ról: własne nazwy dla Właściciela, Moderatora i roli członka', () => {
  const answers = createAnswers('gaming');
  answers.roleNames = { owner: 'CEO', mod: 'Strażnik', member: 'Obywatel' };
  const bp = buildBlueprint(answers);
  const label = (key) => bp.roles.find((r) => r.key === key).label;
  assert.equal(label('owner'), 'CEO');
  assert.equal(label('mod'), 'Strażnik');
  assert.equal(label('member'), 'Obywatel');
  assert.equal(label('admin'), 'Administrator', 'niezmienione role mają domyślne nazwy');
});

test('AutoMod: filtr nicków i profili tworzony jako reguła MemberProfile (zdarzenie MemberUpdate)', async () => {
  const guild = new FakeGuild();
  const answers = createAnswers('community');
  answers.size = 'huge';
  applyDefaults(answers);
  assert.ok(answers.security.automod.includes('profiles'));
  await buildOn(guild, answers);
  const rule = [...guild.autoModerationRules.cache.values()].find((r) => r.triggerType === 6);
  assert.ok(rule, 'reguła profili utworzona');
  assert.equal(rule.data.eventType, 2);
});

test('cofnij budowę: usuwa wszystko, co utworzył kreator, i przywraca ustawienia (także Społeczność)', async () => {
  const guild = new FakeGuild({ name: 'Przed', ownerId: '1' });
  const before = { channels: guild.channels.cache.size, roles: guild.roles.cache.size };
  const answers = createAnswers('community');
  answers.basics.name = 'Po';
  const { result } = await buildOn(guild, answers);
  assert.ok(guild.features.includes('COMMUNITY'));
  undo.remember(guild.id, result, { userId: '2', wipe: false });

  const ask = createInteraction({ guild, customId: `wzu:ask:${guild.id}` });
  await undo.handleUndo(ask);
  assert.match(ask.state.updates[0].embeds[0].data.title, /Cofnąć budowę/);
  const yes = createInteraction({ guild, customId: `wzu:yes:${guild.id}` });
  await undo.handleUndo(yes);
  assert.equal(guild.name, 'Przed');
  assert.equal(guild.channels.cache.size, before.channels);
  assert.equal(guild.roles.cache.size, before.roles);
  assert.ok(!guild.features.includes('COMMUNITY'), 'Społeczność wyłączona, bo włączył ją kreator');
  assert.equal(guild.autoModerationRules.cache.size, 0);
  assert.equal(undo.get(guild.id), null, 'cofnięcie można wykonać tylko raz');

  const again = createInteraction({ guild, customId: `wzu:ask:${guild.id}` });
  await undo.handleUndo(again);
  assert.match(again.state.updates[0].embeds[0].data.title, /niedostępne/);
});

test('cofnij budowę: bez uprawnień administratora – odmowa', async () => {
  const guild = new FakeGuild();
  const i = createInteraction({ guild, customId: `wzu:yes:${guild.id}`, permissions: 0n });
  await undo.handleUndo(i);
  assert.match(i.state.replies[0].content, /Brak uprawnień/);
});

test('szybki kreator: 4 kroki (typ, nazwa, profil, sekcje) i od razu podsumowanie', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  const store = new SessionStore();
  const wizard = createWizard({ store, config, runBuild: async () => {} });
  await wizard.start(createInteraction({ guild, kind: 'command' }));
  const s = store.get(guild.id);
  const go = async (id, extra) => {
    const i = createInteraction({ guild, customId: `wz:${s.id}:${id}`, ...extra });
    await wizard.handle(i);
    return i.state.updates.at(-1);
  };
  await go('n:quick');
  const first = await go('s:type', { values: ['shop'] });
  assert.match(first.embeds[0].data.title, /⚡ Krok 1\/4/);
  const visited = [s.step];
  for (let n = 0; n < 4; n += 1) {
    await go('n:next');
    visited.push(s.step);
  }
  assert.deepEqual(visited, ['type', 'basics', 'profile', 'modules', 'summary']);
  await go('n:back');
  assert.equal(s.step, 'modules', 'wstecz z podsumowania wraca do ostatniego szybkiego kroku');
});

test('wczytanie projektu: /stworz projekt:<plik> otwiera podsumowanie z odpowiedziami z pliku', async () => {
  const saved = createAnswers('minecraft');
  saved.basics.name = 'Mój MC';
  saved.size = 'large';
  saved.mode.type = 'wipe';
  saved.texts.customRules = ['Zakaz X-raya'];
  const json = JSON.stringify({ answers: saved, blueprint: buildBlueprint(saved) });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => json });
  try {
    const guild = new FakeGuild({ ownerId: '1' });
    const store = new SessionStore();
    const wizard = createWizard({ store, config, runBuild: async () => {} });
    const i = createInteraction({ guild, kind: 'command' });
    i.options = { getAttachment: () => ({ name: 'projekt.json', size: json.length, url: 'https://cdn.example/projekt.json', contentType: 'application/json' }) };
    i.deferReply = async () => { i.deferred = true; };
    await wizard.start(i);
    const s = store.get(guild.id);
    assert.equal(s.step, 'summary');
    assert.equal(s.answers.type, 'minecraft');
    assert.equal(s.answers.size, 'large');
    assert.equal(s.answers.mode.type, 'append', 'czyszczenie nigdy nie jest wczytywane z pliku');
    assert.deepEqual(s.answers.texts.customRules, ['Zakaz X-raya']);
    assert.match(i.state.edits[0].embeds[0].data.title, /Podsumowanie/);

    const bad = createInteraction({ guild: new FakeGuild(), kind: 'command' });
    bad.options = { getAttachment: () => ({ name: 'zdjecie.png', size: 10, url: 'x', contentType: 'image/png' }) };
    bad.deferReply = async () => {};
    await wizard.start(bad);
    assert.match(bad.state.edits[0].embeds[0].data.title, /Nie udało się wczytać/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('wczytanie projektu: plik od użytkownika jest dokładnie sprawdzany', () => {
  assert.throws(() => sanitizeAnswers({ hello: 'world' }), /typu serwera/);
  const a = sanitizeAnswers({
    type: 'gaming',
    modules: ['general', '__proto__', 'nieznany'],
    basics: { name: 'A'.repeat(500), iconUrl: 'javascript:alert(1)' },
    security: { verificationLevel: 99, automod: ['spam', 'zły'] },
    customStaff: [{ name: 'Szef', level: 'owner' }],
    channelAccess: { community: { view: 'staff', write: 'hack' }, '<script>': { view: 'staff' } },
    customCategories: [{ target: 'nowhere', name: 'Kat', text: ['a'], access: 'root' }],
  });
  assert.deepEqual(a.modules, ['general']);
  assert.equal(a.basics.name.length, 100);
  assert.equal(a.basics.iconUrl, '');
  assert.equal(a.security.verificationLevel, 4);
  assert.deepEqual(a.security.automod, ['spam']);
  assert.equal(a.customStaff[0].level, 'none', 'plik nie nada własnej roli uprawnień Administratora');
  assert.deepEqual(a.channelAccess, { community: { view: 'staff', write: 'default' } });
  assert.equal(a.customCategories[0].target, 'new');
  assert.equal(a.customCategories[0].access, 'public');
  const bp = buildBlueprint(a);
  assert.deepEqual(bp.errors, []);
});

test('nowe typy serwerów (sport, filmy, inwestycje, wydarzenie) budują się bez błędów', async () => {
  for (const type of ['sport', 'movies', 'trading', 'event']) {
    const guild = new FakeGuild();
    const answers = createAnswers(type);
    for (const f of require('../src/data/serverTypes').SERVER_TYPES[type].infoFields || []) answers.special.info[f.key] = `Wartość ${f.key}`;
    const { result, blueprint } = await buildOn(guild, answers);
    assert.equal(result.created.channels, blueprint.stats.channels, type);
  }
  const guild = new FakeGuild();
  const answers = createAnswers('event');
  answers.special.info.date = '12 października 2026';
  const { result } = await buildOn(guild, answers);
  const info = guild.channels.cache.get(result.channels.eventInfo);
  assert.equal(info.type, ChannelType.GuildText);
  assert.match(embedsText(info.messages), /12 października 2026/);
});
