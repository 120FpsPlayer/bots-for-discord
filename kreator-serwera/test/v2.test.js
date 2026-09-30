'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType } = require('discord.js');
const E = require('../src/graphics/engine');
const { renderPreview } = require('../src/graphics/preview');
const { renderBanner, renderIcon, renderEmojiPack, BANNERS } = require('../src/graphics/art');
const { createAnswers } = require('../src/wizard/defaults');
const { buildBlueprint, ONBOARDING_LIMITS } = require('../src/builder/blueprint');
const { executeBlueprint } = require('../src/builder/executor');
const { performCleanup, DEFAULT_TARGETS } = require('../src/cleanup/cleaner');
const { BOTS, inviteUrl, permissionBits, fillSetup } = require('../src/data/bots');
const { MODULES } = require('../src/data/modules');
const { SERVER_TYPES } = require('../src/data/serverTypes');
const { PACKAGES, packageOf, applyPackage } = require('../src/access/packages');
const { CodeStore, formatCode } = require('../src/access/codes');
const { TemplateStore, slugify } = require('../src/access/templates');
const { Notifier } = require('../src/access/notify');
const { runCommand } = require('../src/access/console');
const { LeaveScheduler } = require('../src/wizard/leave');
const { buildGuide } = require('../src/wizard/guide');
const { SessionStore } = require('../src/wizard/sessions');
const { createWizard } = require('../src/wizard/router');
const { runBuild } = require('../src/wizard/build');
const undo = require('../src/wizard/undo');
const { sanitizeAnswers } = require('../src/wizard/project');
const { FakeGuild, FakeChannel } = require('./helpers/fakeDiscord');
const { createInteraction, componentsOf } = require('./helpers/fakeInteraction');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const isPng = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, 4).equals(PNG);
const isJpeg = (buf) => Buffer.isBuffer(buf) && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
const isImage = (buf) => isPng(buf) || isJpeg(buf);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kreator-'));

/** Serwer „na sprzedaż” z wszystkimi dodatkami: onboarding, boty, grafiki, wiadomości jako serwer. */
function fullAnswers(type = 'gaming') {
  const a = createAnswers(type);
  a.basics.name = 'Kraina Graczy';
  a.modules = a.modules.filter((m) => m !== 'verification');
  a.content.community = 'full';
  a.communityRoles = [...new Set([...a.communityRoles, 'colors', 'notifications', 'platform'])];
  a.onboarding = { enabled: true, groups: [], required: false };
  a.bots = ['mee6', 'tickettool', 'disboard', 'dankmemer', 'dyno'];
  a.graphics = { banners: true, icon: true, emojiPack: true };
  a.content.sender = 'server';
  return a;
}

async function buildFull(type = 'gaming', guildOpts = {}, tweak = null) {
  const guild = new FakeGuild({ name: 'Stary', ownerId: '1', ...guildOpts });
  const answers = fullAnswers(type);
  if (tweak) tweak(answers);
  const blueprint = buildBlueprint(answers, { existingChannels: guild.channels.cache.size, existingRoles: guild.roles.cache.size });
  assert.deepEqual(blueprint.errors, []);
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', keepChannelIds: [] });
  return { guild, blueprint, result, answers };
}

// ───────────── Grafika ─────────────

test('grafika: podgląd PNG dla każdego typu serwera, banery, ikona, paczka emoji', async () => {
  assert.equal(E.available(), true, E.unavailableReason());
  for (const type of Object.keys(SERVER_TYPES)) {
    const png = await renderPreview(buildBlueprint(fullAnswers(type)), { guildName: 'Test' });
    assert.ok(isPng(png) && png.length > 20_000, `${type}: podgląd`);
  }
  for (const [kind, [emoji, title]] of Object.entries(BANNERS)) {
    const png = await renderBanner({ title, subtitle: 'Bardzo długa nazwa serwera, która musi się zmieścić na banerze bez wychodzenia poza krawędź', emoji, color: 0x1abc9c });
    assert.ok(isImage(png), `baner ${kind}`);
  }
  assert.ok(isPng(await renderIcon({ name: '⛏️ CraftLand', color: 0xe67e22 })));
  assert.ok(isPng(await renderIcon({ name: '🎮🎮', color: 0xe67e22, emoji: '🎮' })), 'ikona bez liter – z emoji');
  for (const type of Object.keys(SERVER_TYPES)) {
    const pack = await renderEmojiPack({ type, color: 0x5865f2 });
    assert.ok(pack.length >= 14, `${type}: paczka emoji`);
    assert.equal(new Set(pack.map((e) => e.name)).size, pack.length, `${type}: unikalne nazwy`);
    for (const e of pack) {
      assert.match(e.name, /^\w{2,32}$/);
      assert.ok(isPng(e.buffer) && e.buffer.length < 256 * 1024);
    }
  }
});

test('grafika: nazwy plików Twemoji, inicjały, podmiana znaków spoza czcionki', () => {
  assert.equal(E.emojiFileName('🛡️'), '1f6e1.svg', 'bez FE0F');
  assert.equal(E.emojiFileName('1️⃣'), '31-20e3.svg');
  assert.equal(E.emojiFileName('🏳️‍🌈'), '1f3f3-fe0f-200d-1f308.svg', 'sekwencja ZWJ zostaje z FE0F');
  assert.deepEqual(['⛏️ CraftLand', 'Kraina Graczy PL', 'serwer', '🎮'].map(E.initials), ['CL', 'KG', 'SE', '']);
  assert.deepEqual(E.runsOf('💬・ogólny').map((r) => r.emoji || r.text), ['💬', '·ogólny']);
  for (const k of ['levelup', 'bump'].map((key) => Object.values(MODULES).flatMap((m) => m.channels).find((c) => c.key === key))) {
    assert.ok(k, 'kanał botów zdefiniowany');
  }
});

// ───────────── Blueprint: onboarding i boty ─────────────

test('onboarding: pytania z grup ról, kanały opt-in dla gier, wymagania Discorda', () => {
  const bp = buildBlueprint(fullAnswers('gaming'));
  const ob = bp.onboarding;
  assert.ok(ob, bp.warnings.join('\n'));
  const keys = ob.prompts.map((p) => p.key);
  assert.deepEqual(keys.slice(0, 2), ['items', 'notifications']);
  assert.ok(keys.includes('colors') && keys.includes('platform'));
  const items = ob.prompts[0];
  assert.equal(items.options[0].roles[0], 'item0');
  assert.ok(items.options[0].channels.includes('item0t'), 'wybór gry dodaje jej kanał');
  assert.ok(!ob.defaultChannels.includes('item0t'), 'kanały gier nie są domyślne (opt-in)');
  const colors = ob.prompts.find((p) => p.key === 'colors');
  assert.equal(colors.single, true);
  assert.equal(colors.dropdown, true);
  const channels = bp.categories.flatMap((c) => c.channels);
  const writable = ob.defaultChannels.map((k) => channels.find((c) => c.key === k)).filter((c) => ['text', 'forum'].includes(c.kind) && c.access.write === 'all');
  assert.ok(ob.defaultChannels.length >= ONBOARDING_LIMITS.minDefault && writable.length >= ONBOARDING_LIMITS.minWritable);
  for (const p of ob.prompts) {
    assert.ok(p.title.length <= 100 && p.options.length >= 1 && p.options.length <= 25);
    for (const o of p.options) assert.ok(o.title.length <= 50 && (o.roles.length || o.channels.length));
  }
});

test('onboarding: pomijany z weryfikacją, bez Społeczności i bez ról do wyboru – z wyjaśnieniem', () => {
  const gate = fullAnswers();
  gate.modules.push('verification');
  const a = buildBlueprint(gate);
  assert.equal(a.onboarding, null);
  assert.ok(a.warnings.some((w) => w.includes('Onboarding pominięty') && w.includes('Weryfikacja')));

  const noCommunity = fullAnswers();
  noCommunity.content.community = 'off';
  assert.ok(buildBlueprint(noCommunity).warnings.some((w) => w.includes('Społeczności')));

  const noRoles = fullAnswers();
  noRoles.communityRoles = ['member'];
  noRoles.onboarding.groups = ['colors', 'region'];
  assert.ok(buildBlueprint(noRoles).warnings.some((w) => w.includes('brak ról do wyboru')));
});

test('boty: kanały pod boty, rola Boty, sekcje ukryte nie do wybrania ręcznie, linki zaproszeń', () => {
  const a = createAnswers('community');
  a.communityRoles = a.communityRoles.filter((r) => r !== 'bots');
  a.modules = a.modules.filter((m) => !['logs', 'giveaways'].includes(m));
  a.modules.push('botLevelup');
  const noBots = buildBlueprint(a);
  assert.ok(!noBots.categories.flatMap((c) => c.channels).some((c) => c.key === 'levelup'), 'sekcji ukrytej nie da się włączyć bez bota');

  a.bots = ['mee6', 'tickettool', 'disboard', 'dankmemer', 'dyno', 'giveawaybot', 'nieistniejacy'];
  const bp = buildBlueprint(a);
  const byKey = Object.fromEntries(bp.categories.flatMap((c) => c.channels).map((c) => [c.key, c]));
  assert.deepEqual(bp.bots, ['mee6', 'tickettool', 'disboard', 'dankmemer', 'dyno', 'giveawaybot']);
  assert.equal(byKey.levelup.access.write, 'readonly');
  assert.ok(byKey.levelup.overwrites.some((o) => o.target === 'bots' && o.allow.includes('SendMessages')), 'bot poziomów pisze w #awanse');
  assert.equal(byKey.tickets.access.write, 'readonly');
  assert.equal(byKey.ticketLogs.access.view, 'mods');
  assert.ok(byKey.bump && byKey.botGames && byKey.botLogs && byKey.giveaways);
  assert.ok(bp.roles.some((r) => r.key === 'bots'), 'rola Boty dodana automatycznie');
  assert.ok(bp.warnings.some((w) => w.includes('GiveawayBot') && w.includes('Konkursy')));

  for (const b of Object.values(BOTS)) {
    assert.match(b.id, /^\d{17,20}$/, b.name);
    const url = new URL(inviteUrl(b, '123456789012345678'));
    assert.equal(url.searchParams.get('client_id'), b.id);
    assert.equal(url.searchParams.get('guild_id'), '123456789012345678');
    assert.equal(url.searchParams.get('scope'), 'bot applications.commands');
    assert.equal(url.searchParams.get('permissions'), String(permissionBits(b)));
    assert.ok(b.description.length <= 100 && b.site.startsWith('https://'));
    for (const need of b.needs) assert.ok(MODULES[need.module], `${b.name}: sekcja ${need.module}`);
  }
  assert.equal(fillSetup('kanał {logMod|botLogs}', (k) => (k === 'botLogs' ? '<#1>' : null)), 'kanał <#1>');
});

// ───────────── Budowa z dodatkami ─────────────

test('budowa: onboarding, wiadomości jako serwer (webhooki), banery, ikona z inicjałów, paczka emoji', async () => {
  const { guild, result, blueprint } = await buildFull();
  assert.equal(result.fatal, undefined, result.fatal);
  assert.deepEqual(result.errors, []);

  // Onboarding z prawdziwymi ID ról i kanałów
  assert.equal(guild.onboarding.enabled, true);
  assert.equal(result.created.onboarding, blueprint.onboarding.prompts.length);
  const opt = guild.onboarding.prompts[0].options[0];
  assert.ok(guild.roles.cache.has(opt.roles[0]) && guild.channels.cache.has(opt.channels[0]));

  // Webhooki: wiadomości od „serwera”, webhooki usunięte po publikacji
  assert.equal(result.sender, 'server');
  assert.ok(guild.webhooks.length > 0 && guild.webhooks.every((h) => h.deleted), 'webhooki posprzątane');
  assert.ok(guild.webhooks.every((h) => h.name === 'Kraina Graczy' && isPng(h.avatar)), 'nazwa i ikona serwera');
  const rules = guild.channels.cache.get(result.channels.rules).messages;
  assert.ok(rules.every((m) => m.author.webhook), 'regulamin wysłany jako serwer');
  assert.ok(isImage(rules[0].files[0].attachment) && !rules[0].embeds.length, 'najpierw baner, potem treść');
  assert.match(rules[0].files[0].name, /^baner-rules\.jpg$/, 'styl esport → JPEG');
  assert.ok(rules[1].embeds.length);
  const forum = guild.channels.cache.get(result.channels.suggestions);
  assert.ok(forum.threadsCreated[0].pinned && forum.threadsCreated[0].message.files.length === 1, 'forum: baner w pierwszym poście');
  assert.ok(result.created.banners >= 4);

  // Ikona z inicjałów i paczka emoji
  assert.ok(result.created.icon && isPng(guild.iconSet));
  assert.ok(result.created.emojis >= 14 && guild.emojis.cache.size === result.created.emojis);
  assert.ok(result.emojis[0].startsWith('<:online:'));
});

test('budowa: bez nadpisywania istniejącej ikony, wiadomości jako bot, limit emoji', async () => {
  const guild = new FakeGuild({ name: 'X', ownerId: '1' }).seedExtras({ emojis: 45 });
  await guild.setIcon('https://cdn.discordapp.com/icons/1/stara.png');
  const answers = fullAnswers();
  answers.content.sender = 'bot';
  const blueprint = buildBlueprint(answers);
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', keepChannelIds: [] });
  assert.equal(result.created.icon, false);
  assert.equal(guild.iconSet, 'https://cdn.discordapp.com/icons/1/stara.png');
  assert.equal(guild.webhooks.length, 0);
  assert.equal(result.sender, 'bot');
  assert.equal(result.created.emojis, 5, 'tylko wolne miejsca (50 - 45)');
  assert.ok(result.warnings.some((w) => w.includes('brak miejsca')));
});

test('cofnięcie budowy: wyłącza onboarding, usuwa emoji i ikonę z inicjałów', async () => {
  const { guild, result } = await buildFull();
  undo.remember(guild.id, result, { userId: '1', wipe: false });
  const out = await undo.performUndo(guild, undo.get(guild.id));
  assert.deepEqual(out.problems, []);
  assert.equal(guild.onboarding.enabled, false);
  assert.equal(guild.emojis.cache.size, 0);
  assert.equal(out.deleted.emojis, result.created.emojis);
  assert.equal(guild.iconSet, null);
  assert.ok(out.deleted.channels >= result.created.channels);
});

test('/usun i tryb „wyczyść”: najpierw wyłączają onboarding (Discord blokuje usuwanie jego kanałów)', async () => {
  const first = await buildFull();
  const R = await performCleanup(first.guild, { targets: DEFAULT_TARGETS, invokerId: '1' });
  assert.deepEqual(R.warnings, []);
  assert.equal(first.guild.onboarding.enabled, false);

  const second = await buildFull();
  const answers = fullAnswers('minecraft');
  answers.mode.type = 'wipe';
  const bp = buildBlueprint(answers);
  const again = await executeBlueprint({ guild: second.guild, blueprint: bp, answers, invokerId: '1', keepChannelIds: [] });
  assert.deepEqual(again.errors, []);
  assert.ok(!again.warnings.some((w) => w.includes('Nie usunięto')), again.warnings.join('\n'));
});

// ───────────── Pakiety ─────────────

test('pakiety: basic = szybki kreator bez dodatków, standard = boty i ikona, premium = wszystko', () => {
  const a = fullAnswers();
  const removed = applyPackage(a, PACKAGES.basic);
  assert.equal(removed.length, 5);
  assert.equal(a.onboarding.enabled, false);
  assert.deepEqual(a.bots, []);
  assert.deepEqual(a.graphics, { banners: false, icon: false, emojiPack: false });

  const b = fullAnswers();
  applyPackage(b, PACKAGES.standard);
  assert.ok(b.bots.length && b.graphics.icon && !b.graphics.banners && !b.onboarding.enabled);
  const c = fullAnswers();
  assert.deepEqual(applyPackage(c, PACKAGES.premium), []);
  assert.deepEqual(applyPackage(c, null), []);
  assert.equal(packageOf(null).key, 'premium');
});

// ───────────── /stworz: pakiety, szablony, sprzedawca ─────────────

function wizardSetup({ seller = null, build } = {}) {
  const dir = tmp();
  const codes = new CodeStore({ file: path.join(dir, 'kody.json') });
  const templates = new TemplateStore({ dir: path.join(dir, 'szablony') });
  const notifier = new Notifier();
  const leaver = new LeaveScheduler({ file: path.join(dir, 'wyjscia.json') });
  const store = new SessionStore({ timeoutMinutes: 30 });
  const builds = [];
  const wizard = createWizard({
    store,
    config: { sessionTimeoutMinutes: 30, ownerOnly: false, requireCode: true },
    runBuild: build || (async (p) => { builds.push(p); return { ids: { roles: ['1'], categories: [], channels: [], automod: [] }, created: {}, errors: [], warnings: [], duration: 1000 }; }),
    codes, templates, notifier, leaver,
    isSeller: (id) => id === seller,
  });
  return { dir, codes, templates, notifier, leaver, store, wizard, builds };
}

test('pakiet basic: tylko szybkie pytania + tryb budowy, bez importu projektu, dodatki wyłączone przy budowie', async () => {
  const { codes, wizard, store, builds } = wizardSetup();
  const [{ code }] = codes.generate({ pkg: 'basic' });
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } });
  await wizard.start(cmd);
  const intro = cmd.state.replies[0];
  assert.ok(intro.embeds[0].data.fields.some((f) => f.value.includes('Pakiet **Podstawowy**')));
  const full = componentsOf(intro).find((c) => c.custom_id.endsWith(':n:start'));
  assert.equal(full.disabled, true);

  const s = store.get(guild.id);
  await wizard.handle(createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:quick` }));
  assert.equal(s.step, 'type');
  s.typeChosen = true;
  s.step = 'summary';
  s.answers.onboarding.enabled = true;
  s.answers.bots = ['mee6'];
  const summary = wizard.render(s);
  const goto = componentsOf(summary).find((c) => c.custom_id.endsWith(':s:goto'));
  assert.deepEqual(goto.options.map((o) => o.value), ['type', 'basics', 'profile', 'modules', 'mode']);
  // Próba wejścia w krok spoza pakietu przez „goto” jest ignorowana
  await wizard.handle(createInteraction({ guild, userId: '1', customId: goto.custom_id, values: ['bots'] }));
  assert.equal(s.step, 'summary');

  await wizard.handle(createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:build` }));
  assert.equal(builds.length, 1);
  assert.equal(builds[0].blueprint.onboarding, null);
  assert.deepEqual(builds[0].blueprint.bots, []);
  assert.equal(builds[0].blueprint.meta.graphics.banners, false);
});

test('szablony: sprzedawca zapisuje szablon (bez kodu), klient z kodem szablonu buduje go jednym kliknięciem', async () => {
  const { codes, templates, wizard, store, builds, notifier } = wizardSetup({ seller: '99' });
  const sellerGuild = new FakeGuild({ name: 'Test sprzedawcy', ownerId: '99' });

  // Sprzedawca: bez kodu, przycisk „Zapisz jako szablon”
  const cmd = createInteraction({ guild: sellerGuild, userId: '99', kind: 'command' });
  await wizard.start(cmd);
  assert.match(cmd.state.replies[0].embeds[0].data.title, /Witaj/);
  const s = store.get(sellerGuild.id);
  Object.assign(s.answers, fullAnswers('minecraft'));
  s.typeChosen = true;
  s.step = 'summary';
  const btn = componentsOf(wizard.render(s)).find((c) => c.custom_id.endsWith(':n:tplsave'));
  assert.ok(btn, 'przycisk zapisu szablonu dla sprzedawcy');
  const open = createInteraction({ guild: sellerGuild, userId: '99', customId: btn.custom_id });
  await wizard.handle(open);
  assert.equal(open.state.modals[0].components[0].component.value, 'kraina-graczy');
  const save = createInteraction({ guild: sellerGuild, userId: '99', customId: `wz:${s.id}:m:tpl`, kind: 'modal', fields: { id: 'MC Premium!', name: 'Minecraft Premium', description: 'Pełny serwer MC' } });
  await wizard.handle(save);
  assert.match(save.state.edits[0].embeds[0].data.description, /kod szablon=mc-premium/);
  assert.equal(templates.get('mc-premium').name, 'Minecraft Premium');
  assert.deepEqual(templates.list().map((t) => t.id), ['mc-premium']);

  // Sprzedawca buduje bez zużywania kodu
  await wizard.handle(createInteraction({ guild: sellerGuild, userId: '99', customId: `wz:${s.id}:n:build` }));
  assert.equal(builds.length, 1);
  assert.equal(builds[0].session.ticket, null);

  // Klient z kodem szablonu
  const [{ code }] = codes.generate({ template: 'mc-premium', pkg: 'standard' });
  const buyerGuild = new FakeGuild({ name: 'Serwer Klienta', ownerId: '5' });
  const buy = createInteraction({ guild: buyerGuild, userId: '5', kind: 'command', stringOptions: { kod: code } });
  await wizard.start(buy);
  const frame = buy.state.replies[0];
  assert.match(frame.embeds[0].data.title, /Minecraft Premium – gotowy do budowy/);
  const bs = store.get(buyerGuild.id);
  assert.equal(bs.answers.type, 'minecraft');
  assert.equal(bs.answers.basics.name, 'Serwer Klienta', 'nazwa kupującego, nie z szablonu');
  const comps = componentsOf(frame);
  assert.ok(!componentsOf(frame).some((c) => c.custom_id?.endsWith(':n:tplsave')), 'klient nie zapisuje szablonów');
  assert.equal(comps.find((c) => c.custom_id?.endsWith(':n:export')).disabled, true, 'klient nie eksportuje szablonu');
  assert.ok(!comps.find((c) => c.custom_id?.endsWith(':s:goto')).options.some((o) => o.value === 'type'), 'bez zmiany typu');

  await wizard.handle(createInteraction({ guild: buyerGuild, userId: '5', customId: `wz:${bs.id}:n:build` }));
  assert.equal(builds.length, 2);
  assert.equal(builds[1].session.ticket.template, 'mc-premium');
  assert.equal(builds[1].blueprint.onboarding, null, 'pakiet standard – bez onboardingu');
  assert.ok(builds[1].blueprint.bots.length, 'pakiet standard – boty tak');
  assert.equal(templates.get('mc-premium').uses, 1);
  assert.ok(notifier.sent.some((n) => n.title === '🔑 Kod dostępu wpisany' && n.fields.some((f) => f.value.includes('mc-premium'))));
  assert.ok(notifier.sent.some((n) => n.title === '🏗️ Serwer zbudowany' && n.fields.some((f) => f.value.includes('Minecraft Premium'))));

  // Szablon usunięty – kod nie działa, ale nie jest zużyty
  templates.delete('mc-premium');
  const [{ code: code2 }] = codes.generate({ template: 'mc-premium' });
  const g3 = new FakeGuild({ name: 'C', ownerId: '6' });
  const c3 = createInteraction({ guild: g3, userId: '6', kind: 'command', stringOptions: { kod: code2 } });
  await wizard.start(c3);
  assert.match(c3.state.replies[0].embeds[0].data.title, /Brak szablonu/);
  assert.equal(codes.find(code2).used, 0);
});

test('logo wgrane w formularzu „Nazwa i opis” zostaje ikoną; zły plik jest odrzucany', async () => {
  const { wizard, store } = wizardSetup({ seller: '1' });
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command' }));
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'basics';
  const good = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:m:basics`, kind: 'modal', fields: {
    name: 'Nowy', description: '', audience: '', icon: '',
    logo: [{ url: 'https://cdn.discordapp.com/attachments/1/2/logo.png', name: 'logo.png', contentType: 'image/png', size: 5000 }],
  } });
  await wizard.handle(good);
  assert.equal(s.answers.basics.iconUrl, 'https://cdn.discordapp.com/attachments/1/2/logo.png');
  assert.equal(s.answers.basics.iconName, 'logo.png');
  const bad = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:m:basics`, kind: 'modal', fields: {
    name: 'Nowy', description: '', audience: '', icon: '',
    logo: [{ url: 'https://x/y.exe', name: 'wirus.exe', contentType: 'application/octet-stream', size: 5000 }],
  } });
  await wizard.handle(bad);
  assert.match(bad.state.edits[0].embeds[0].data.description, /Logo musi być obrazkiem/);
  assert.equal(s.answers.basics.iconName, 'logo.png', 'poprzednie logo zostaje');
});

test('podgląd obrazkiem i przykładowy baner z podsumowania / kroku „Grafika”', async () => {
  const { wizard, store } = wizardSetup({ seller: '1' });
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command' }));
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'summary';
  const p = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:pimg` });
  await wizard.handle(p);
  assert.ok(isPng(p.state.edits[0].files[0].attachment));
  const b = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:pban` });
  await wizard.handle(b);
  assert.ok(isImage(b.state.edits[0].files[0].attachment));
});

// ───────────── Po budowie: przewodnik, wyjście bota ─────────────

test('prawdziwa budowa: przewodnik w DM (z linkami botów i podglądem) i na kanale ekipy, wyjście bota zaplanowane', async () => {
  const { codes, wizard, store, leaver } = wizardSetup({ build: runBuild });
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'Klient', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } }));
  const s = store.get(guild.id);
  Object.assign(s.answers, fullAnswers('gaming'));
  s.answers.mode.leave = 'after';
  s.typeChosen = true;
  s.step = 'summary';
  const b = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:build` });
  await wizard.handle(b);

  const done = b.state.edits.at(-1);
  assert.match(done.embeds[0].data.title, /Serwer gotowy/);
  const extras = done.embeds[0].data.fields.find((f) => f.name === '🎨 Wygląd i dodatki').value;
  assert.match(extras, /jako \*\*serwer/);
  assert.match(extras, /Bot opuści serwer/);
  const links = componentsOf(done).filter((c) => c.url?.includes('oauth2/authorize'));
  assert.ok(links.length >= 3 && links[0].url.includes(`guild_id=${guild.id}`), 'przyciski „Dodaj bota”');

  const dm = b.state.dms[0];
  assert.match(dm.embeds[0].data.title, /Przewodnik/);
  assert.ok(dm.embeds[0].data.fields.some((f) => f.name.includes('MEE6') && f.value.includes('client_id=159985870458322944')));
  assert.ok(isPng(dm.files[0].attachment), 'podgląd serwera w DM');
  const staff = [...guild.channels.cache.values()].find((c) => c.messages.some((m) => m.embeds[0]?.data?.title?.includes('Przewodnik')));
  assert.ok(staff, 'przewodnik na kanale ekipy');
  assert.ok(!staff.messages.find((m) => m.embeds[0]?.data?.title?.includes('Przewodnik')).components.length, 'na serwerze bez przycisków');

  const planned = leaver.get(guild.id);
  assert.ok(planned && planned.at > Date.now() + 60 * 60_000, 'wyjście za ~2 h');
  // Cofnięcie odwołuje wyjście
  const undoBtn = componentsOf(done).find((c) => c.custom_id?.startsWith('wzu:ask:'));
  await undo.handleUndo(createInteraction({ guild, userId: '1', customId: undoBtn.custom_id.replace('ask', 'yes') }), store, codes, { leaver });
  assert.equal(leaver.get(guild.id), null);
});

test('wyjście bota: plan w pliku, przesuwanie gdy serwer zajęty, wznowienie po restarcie', async () => {
  const dir = tmp();
  const left = [];
  const guild = { id: '111', name: 'S', leave: async () => left.push('111') };
  const client = { guilds: { cache: new Map([['111', guild]]) } };
  const store = new SessionStore();
  const leaver = new LeaveScheduler({ file: path.join(dir, 'w.json'), client, store });
  leaver.schedule('111', Date.now() + 3_600_000, { guildName: 'S' });
  assert.equal(new LeaveScheduler({ file: path.join(dir, 'w.json') }).list().length, 1, 'plan przetrwa restart');
  store.lock('111', 'czyszczenie serwera');
  assert.equal(await leaver.run('111'), false);
  assert.ok(leaver.get('111').at > Date.now() + 9 * 60_000, 'przesunięte o 10 min');
  store.unlock('111');
  assert.equal(await leaver.run('111'), true);
  assert.deepEqual(left, ['111']);
  assert.equal(leaver.get('111'), null);
  leaver.schedule('222', Date.now() + 1000);
  assert.equal(leaver.cancel('222'), true);
  for (const t of leaver.timers.values()) clearTimeout(t);
});

test('przewodnik: weryfikacja, onboarding, boty z instrukcją i kanałami, emoji', () => {
  const answers = fullAnswers();
  answers.bots = ['mee6', 'tickettool'];
  const bp = buildBlueprint(answers);
  const result = { channels: { levelup: '11', tickets: '12', ticketLogs: '13', rules: '14' }, roles: { owner: '21', bots: '22' }, created: { onboarding: 4 }, emojis: ['<:online:1>'] };
  const guide = buildGuide({ bp, result, guild: { id: '999999999999999999', name: 'G' }, leaveAt: Date.now() + 1000 });
  const fields = guide.embeds[0].toJSON().fields;
  assert.ok(fields.find((f) => f.name.includes('MEE6')).value.includes('<#11>'));
  assert.ok(fields.find((f) => f.name.includes('Ticket Tool')).value.includes('<#12>'));
  assert.ok(fields.some((f) => f.name.includes('Onboarding')));
  assert.ok(fields.some((f) => f.name.includes('Emoji')));
  assert.equal(guide.components[0].toJSON().components.length, 2);
  assert.ok(JSON.stringify(guide.embeds[0].toJSON()).length < 6000);
});

// ───────────── Kody: ważność, konsola, powiadomienia ─────────────

test('kody: termin ważności, pakiet i szablon w kodzie', () => {
  let now = Date.parse('2026-01-01T12:00:00Z');
  const codes = new CodeStore({ file: path.join(tmp(), 'k.json'), now: () => now });
  const [r] = codes.generate({ pkg: 'standard', template: 'mc', days: 7 });
  assert.equal(r.expiresAt, '2026-01-08T12:00:00.000Z');
  assert.equal(codes.redeem(r.code, { guildId: 'g' }).package, 'standard');
  assert.equal(codes.grantFor('g').template, 'mc');
  now += 8 * 86_400_000;
  assert.equal(codes.grantFor('g'), null, 'po terminie kod nie działa');
  assert.equal(codes.consume('g').ok, false);
  assert.equal(codes.redeem(r.code, { guildId: 'h' }).reason, 'expired');
  assert.equal(codes.find(r.code).status, 'wygasły');
  codes.setExpiry(r.code, null);
  assert.ok(codes.grantFor('g'), 'przedłużenie przywraca kod');
});

test('konsola: kod z pakietem/szablonem/ważnością, pakiety, szablony, ważność, wyjścia', async () => {
  const dir = tmp();
  const codes = new CodeStore({ file: path.join(dir, 'k.json') });
  const templates = new TemplateStore({ dir: path.join(dir, 't') });
  const leaver = new LeaveScheduler({ file: path.join(dir, 'w.json') });
  templates.save({ id: 'mc-premium', name: 'Minecraft Premium', answers: sanitizeAnswers({ answers: createAnswers('minecraft') }), stats: { roles: 10, channels: 20, categories: 5 } });
  const run = (line) => runCommand(line, { codes, templates, leaver, client: null, store: null });

  const out = (await run('kod 2 1 pakiet=standard szablon=mc-premium dni=14 Jan #12')).lines.join('\n');
  assert.match(out, /Pakiet: Standard/);
  assert.match(out, /Szablon: mc-premium/);
  assert.match(out, /Ważny do:/);
  const last = codes.list().at(-1);
  assert.deepEqual([last.package, last.template, last.note], ['standard', 'mc-premium', 'Jan #12']);
  assert.match((await run('kod pakiet=gold')).lines[0], /Nie ma pakietu/);
  assert.match((await run('kod szablon=brak')).lines[0], /Nie ma szablonu/);
  assert.match((await run('kod dni=0')).lines[0], /1–3650/);
  assert.match((await run('kody')).lines.join('\n'), /pakiet standard • szablon mc-premium • do/);
  assert.match((await run(`info ${formatCode(last.code)}`)).lines.join('\n'), /Pakiet:\s+Standard/);
  assert.match((await run(`waznosc ${last.code} bez`)).lines[0], /bez terminu/);
  assert.match((await run(`waznosc ${last.code} 30`)).lines[0], /ważny do/);
  assert.match((await run('pakiety')).lines.join('\n'), /basic.*Podstawowy[\s\S]*premium/);
  assert.match((await run('szablony')).lines.join('\n'), /mc-premium\s+Minecraft Premium/);
  assert.match((await run('szablon info mc-premium')).lines.join('\n'), /kod szablon=mc-premium/);
  assert.match((await run('szablon usuń mc-premium')).lines[0], /usunięty/);
  assert.equal(templates.list().length, 0);
  leaver.schedule('555555555555555555', Date.now() + 3_600_000, { guildName: 'Serwer X' });
  assert.match((await run('wyjścia')).lines.join('\n'), /Serwer X/);
  assert.match((await run('zostań 555555555555555555')).lines[0], /odwołane/);
  for (const t of leaver.timers.values()) clearTimeout(t);
});

test('szablony: ID z nazwy, walidacja, licznik budów', () => {
  const t = new TemplateStore({ dir: path.join(tmp(), 't') });
  assert.equal(slugify('Minecraft Premium ✨ Łódź'), 'minecraft-premium-lodz');
  assert.throws(() => t.save({ id: 'Zły ID!', answers: {} }), /ID szablonu/);
  t.save({ id: 'abc', name: 'ABC', answers: createAnswers('gaming') });
  t.countUse('abc');
  t.countUse('abc');
  assert.equal(t.get('abc').uses, 2);
  assert.equal(t.save({ id: 'abc', name: 'Nowa', answers: createAnswers('gaming') }).updated, true);
  assert.equal(t.get('abc').uses, 2, 'aktualizacja zachowuje statystyki');
  assert.equal(t.get('../../etc/passwd'), null, 'bez wychodzenia poza folder');
});

test('powiadomienia: bez adresu zapisują się lokalnie; zły URL jest ignorowany', async () => {
  const n = new Notifier({ webhookUrl: 'https://evil.example.com/hook' });
  assert.equal(n.enabled, false);
  assert.equal(await n.send({ title: 'Test', fields: [{ name: 'A', value: 'b' }, null, { name: 'C', value: '' }] }), false);
  assert.equal(n.sent[0].fields.length, 1);
  assert.equal(new Notifier({ webhookUrl: `https://discord.com/api/webhooks/123456789012345678/${'a'.repeat(68)}` }).enabled, true);
  assert.equal(new Notifier({ webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/za-krotki-token-123456' }).enabled, false, 'zły token nie wywraca bota');
});

test('webhook: nazwa bez „discord”/„clyde”, kanał bez webhooków → wiadomości jako bot', async () => {
  const guild = new FakeGuild({ name: 'Discord Clyde Fan', ownerId: '1' });
  const answers = fullAnswers();
  answers.basics.name = 'Discord Clyde Fan';
  const bp = buildBlueprint(answers);
  const r = await executeBlueprint({ guild, blueprint: bp, answers, invokerId: '1' });
  assert.ok(guild.webhooks.every((h) => h.name === 'Fan'));
  assert.equal(r.sender, 'server');

  const g2 = new FakeGuild({ name: 'X', ownerId: '1' });
  FakeChannel.prototype.createWebhookOriginal = FakeChannel.prototype.createWebhook;
  FakeChannel.prototype.createWebhook = async () => { const e = new Error('Missing Permissions'); e.code = 50013; throw e; };
  try {
    const r2 = await executeBlueprint({ guild: g2, blueprint: buildBlueprint(fullAnswers()), answers, invokerId: '1' });
    assert.equal(r2.sender, 'bot');
    assert.ok(r2.warnings.some((w) => w.includes('jako bot')));
    assert.ok(r2.created.messages > 3);
  } finally {
    FakeChannel.prototype.createWebhook = FakeChannel.prototype.createWebhookOriginal;
  }
  assert.ok(ChannelType.GuildText !== undefined);
});

// ───────────── Style banerów ─────────────

const { BANNER_STYLES, TYPE_BANNER_STYLES, renderStyledBanner, renderBannerGallery, bannerExt } = require('../src/graphics/banners');

test('style banerów: każdy styl × kolory × długie/krótkie tytuły, emoji w nazwie, powtarzalność', async () => {
  const cases = [
    { title: 'FAQ', subtitle: '', emoji: '❓', color: 0x99aab5 },
    { title: 'Poradnik ekipy', subtitle: '⛏️ Bardzo długa nazwa serwera ╭ z ozdobnikami ・ i emoji 🎮 która musi się zmieścić', emoji: '🛡️', color: 0xe91e63 },
    { title: 'Ogłoszenie', subtitle: 'Żółć Łódź', emoji: '📢', color: 0x000000 },
  ];
  for (const style of Object.keys(BANNER_STYLES)) {
    for (const c of cases) {
      const buf = await renderStyledBanner({ style, ...c });
      assert.ok(bannerExt(style) === 'png' ? isPng(buf) : isJpeg(buf), `${style}: format`);
      assert.ok(buf.length > 10_000 && buf.length < 1_500_000, `${style}: rozmiar ${buf.length}`);
    }
    const a = await renderStyledBanner({ style, title: 'Regulamin', subtitle: 'X', color: 0x123456 });
    const b = await renderStyledBanner({ style, title: 'Regulamin', subtitle: 'X', color: 0x123456 });
    assert.ok(a.equals(b), `${style}: ten sam baner przy tych samych danych`);
  }
  const small = await renderStyledBanner({ style: 'kosmos', title: 'Info', width: 600 });
  assert.ok(isJpeg(small));
  for (const [type, style] of Object.entries(TYPE_BANNER_STYLES)) {
    assert.ok(SERVER_TYPES[type], `typ ${type} istnieje`);
    assert.ok(BANNER_STYLES[style], `${type}: styl ${style}`);
  }
  assert.equal(bannerExt('pixel'), 'png');
  assert.equal(bannerExt('neon'), 'jpg');
  const gallery = await renderBannerGallery({ title: 'Regulamin', subtitle: 'Test', emoji: '📜', color: 0x2ecc71, selected: 'neon' });
  assert.ok(isJpeg(gallery) && gallery.length < 3_000_000);
});

test('krok „Grafika”: wybór stylu, podgląd baneru w embedzie, galeria stylów; styl trafia do budowy', async () => {
  const { wizard, store } = wizardSetup({ seller: '1' });
  const guild = new FakeGuild({ name: 'Arena', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command' }));
  const s = store.get(guild.id);
  s.answers = createAnswers('minecraft');
  assert.equal(s.answers.graphics.bannerStyle, 'pixel', 'Minecraft → styl pikselowy domyślnie');
  s.typeChosen = true;
  s.step = 'graphics';

  const frame = await wizard.view(s);
  assert.equal(frame.embeds[0].data.image.url, 'attachment://podglad-baneru.png');
  assert.equal(frame.files[0].name, 'podglad-baneru.png');
  assert.deepEqual(frame.attachments, [], 'stary podgląd jest usuwany');
  const select = componentsOf(frame).find((c) => c.custom_id?.endsWith(':s:bstyle'));
  assert.equal(select.options.length, Object.keys(BANNER_STYLES).length);
  assert.equal(select.options.find((o) => o.default).value, 'pixel');

  const pick = createInteraction({ guild, userId: '1', customId: select.custom_id, values: ['futurystyczny'] });
  await wizard.handle(pick);
  // Nowy obrazek trzeba narysować – najpierw potwierdzenie kliknięcia (limit 3 s), potem podmiana panelu.
  assert.deepEqual(pick.state.order, ['deferred', 'edits']);
  const updated = pick.state.edits[0];
  assert.equal(s.answers.graphics.bannerStyle, 'futurystyczny');
  assert.equal(updated.embeds[0].data.image.url, 'attachment://podglad-baneru.jpg');
  assert.ok(isJpeg(updated.files[0].attachment));
  assert.ok(updated.embeds[0].data.fields.some((f) => f.value.includes('Futurystyczny')));

  // Obrazek już narysowany (w pamięci) – zwykła, pojedyncza odpowiedź.
  const again = createInteraction({ guild, userId: '1', customId: select.custom_id, values: ['futurystyczny'] });
  await wizard.handle(again);
  assert.deepEqual(again.state.order, ['updates']);
  assert.equal(again.state.updates[0].embeds[0].data.image.url, 'attachment://podglad-baneru.jpg');

  // Przejście do innego kroku usuwa obrazek z wiadomości
  const next = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:next` });
  await wizard.handle(next);
  assert.deepEqual(next.state.updates[0].attachments, []);
  assert.equal(next.state.updates[0].files, undefined);
  assert.equal(next.state.updates[0].embeds[0].data.image, undefined);

  // Galeria wszystkich stylów
  const gal = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:pgal` });
  await wizard.handle(gal);
  assert.ok(isJpeg(gal.state.edits[0].files[0].attachment));
  assert.match(gal.state.edits[0].content, /Wszystkie style banerów/);

  // Wyłączone banery → bez obrazka i z zablokowanym menu stylu
  s.step = 'graphics';
  s.answers.graphics.banners = false;
  const off = await wizard.view(s);
  assert.equal(off.files, undefined);
  assert.equal(componentsOf(off).find((c) => c.custom_id?.endsWith(':s:bstyle')).disabled, true);

  // Styl trafia do blueprintu i projekt z plikiem go zachowuje
  s.answers.graphics.banners = true;
  s.step = 'summary';
  assert.equal(wizard.render(s) && s.blueprint.meta.graphics.bannerStyle, 'futurystyczny');
  assert.equal(sanitizeAnswers({ answers: s.answers }).graphics.bannerStyle, 'futurystyczny');
  assert.equal(sanitizeAnswers({ answers: { ...s.answers, graphics: { bannerStyle: 'zly-styl' } } }).graphics.bannerStyle, 'pixel');
});

test('pakiet bez banerów: menu stylu zablokowane, bez podglądu', async () => {
  const { codes, wizard, store } = wizardSetup();
  const [{ code }] = codes.generate({ pkg: 'standard' });
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } }));
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'graphics';
  const frame = await wizard.view(s);
  assert.equal(frame.files, undefined);
  assert.equal(componentsOf(frame).find((c) => c.custom_id?.endsWith(':s:bstyle')).disabled, true);
  assert.equal(componentsOf(frame).find((c) => c.custom_id?.endsWith(':n:pgal')).disabled, true);
});
