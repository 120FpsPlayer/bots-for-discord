'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { createAnswers, applyDefaults } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { SERVER_TYPES } = require('../src/data/serverTypes');
const { CHANNEL_STYLES, CATEGORY_STYLES, PALETTES } = require('../src/data/styles');
const { MODULES } = require('../src/data/modules');
const { ROLE_GROUP_OPTIONS, STAFF_ROLES } = require('../src/data/roles');
const { MEMBER_TOGGLES, VIEW_OPTIONS, WRITE_OPTIONS, VIEW_LABELS, WRITE_LABELS } = require('../src/builder/permissions');
const { AUTOMOD_OPTIONS } = require('../src/data/security');

const TYPES = Object.keys(SERVER_TYPES);
const SIZES = ['small', 'medium', 'large', 'huge'];

function assertValidBlueprint(bp, label) {
  const ctx = (msg) => `${label}: ${msg}`;
  assert.deepEqual(bp.errors, [], ctx(`nieoczekiwane błędy: ${bp.errors.join('; ')}`));

  // Role
  const roleKeys = new Set();
  assert.ok(bp.roles.length <= 250, ctx('za dużo ról'));
  for (const role of bp.roles) {
    assert.ok(!roleKeys.has(role.key), ctx(`zduplikowany klucz roli ${role.key}`));
    roleKeys.add(role.key);
    assert.ok(role.name && Array.from(role.name).length <= 100, ctx(`zła nazwa roli ${role.name}`));
    assert.ok(Number.isInteger(role.color) && role.color >= 0 && role.color <= 0xffffff, ctx(`zły kolor ${role.name}`));
    for (const p of role.permissions) assert.ok(PermissionFlagsBits[p] !== undefined, ctx(`nieznane uprawnienie ${p}`));
    if (role.self) {
      assert.ok(!role.staff, ctx('rola ekipy nie może być do wyboru'));
      assert.equal(role.permissions.length, 0, ctx(`rola do wyboru ${role.name} nie może mieć uprawnień`));
    }
  }
  const owner = bp.roles.find((r) => r.key === 'owner');
  if (owner) assert.deepEqual(owner.permissions, ['Administrator'], ctx('właściciel musi mieć Administrator'));
  for (const p of bp.everyone) assert.ok(PermissionFlagsBits[p] !== undefined, ctx(`@everyone: nieznane ${p}`));

  // Kanały
  const channelKeys = new Set();
  let total = 0;
  for (const cat of bp.categories) {
    total += 1 + cat.channels.length;
    assert.ok(cat.name && Array.from(cat.name).length <= 100, ctx(`zła nazwa kategorii ${cat.name}`));
    assert.ok(cat.channels.length > 0 && cat.channels.length <= 50, ctx(`kategoria ${cat.name} ma ${cat.channels.length} kanałów`));
    const checkOverwrites = (list, where) => {
      for (const o of list) {
        assert.ok(o.target === '@everyone' || o.target === '@booster' || roleKeys.has(o.target), ctx(`${where}: nieznany cel ${o.target}`));
        for (const p of [...o.allow, ...o.deny]) assert.ok(PermissionFlagsBits[p] !== undefined, ctx(`${where}: nieznane ${p}`));
        assert.ok(!o.allow.some((p) => o.deny.includes(p)), ctx(`${where}: allow i deny jednocześnie`));
      }
      assert.ok(list.length <= 100, ctx(`${where}: za dużo nadpisań`));
    };
    checkOverwrites(cat.overwrites, cat.name);
    let seenVoice = false;
    for (const ch of cat.channels) {
      assert.ok(!channelKeys.has(ch.key), ctx(`zduplikowany klucz kanału ${ch.key}`));
      channelKeys.add(ch.key);
      assert.ok(ch.name && Array.from(ch.name).length <= 100, ctx(`zła nazwa kanału ${ch.name}`));
      if (['text', 'announcement', 'forum'].includes(ch.kind)) {
        assert.ok(!/\s/.test(ch.name), ctx(`kanał tekstowy ze spacją: "${ch.name}"`));
        assert.ok(!seenVoice, ctx(`kanał tekstowy ${ch.name} po głosowym`));
        assert.ok(!ch.topic || ch.topic.length <= (ch.kind === 'forum' ? 4096 : 1024), ctx('za długi temat'));
      } else {
        seenVoice = true;
      }
      assert.ok(ch.slowmode >= 0 && ch.slowmode <= 21600, ctx('slowmode poza zakresem'));
      assert.ok(ch.userLimit >= 0 && ch.userLimit <= 99, ctx('limit osób poza zakresem'));
      if (ch.tags) {
        assert.ok(ch.tags.length <= 20, ctx('za dużo tagów forum'));
        for (const t of ch.tags) assert.ok(t.name.length >= 1 && t.name.length <= 20, ctx(`zła nazwa tagu ${t.name}`));
      }
      checkOverwrites(ch.overwrites, ch.name);
      assert.ok(VIEW_LABELS[ch.access?.view], ctx(`kanał ${ch.name} bez opisu „kto widzi”`));
      assert.ok(WRITE_LABELS[ch.access?.write], ctx(`kanał ${ch.name} bez opisu „kto pisze”`));
    }
  }
  assert.ok(total <= 500, ctx('za dużo kanałów'));
  assert.equal(bp.stats.channels, channelKeys.size, ctx('statystyki kanałów'));

  // Wiadomości, AutoMod, ustawienia
  for (const m of bp.messages) assert.ok(channelKeys.has(m.channel), ctx(`wiadomość do nieistniejącego kanału ${m.channel}`));
  for (const rule of bp.automod) {
    assert.ok(rule.name.length <= 100, ctx('nazwa reguły AutoMod'));
    assert.ok(rule.exemptRoles.length <= 20, ctx('za dużo ról wyłączonych z AutoMod'));
    for (const k of rule.exemptRoles) assert.ok(roleKeys.has(k), ctx('zła rola wyłączona z AutoMod'));
    for (const k of rule.metadata.keywordFilter || []) assert.ok(k.length <= 60, ctx('za długie słowo kluczowe'));
    for (const a of rule.actions) {
      if (a.type === 'alert') assert.ok(channelKeys.has(a.channel), ctx('alert do nieistniejącego kanału'));
      if (a.type === 'block') assert.ok(a.message.length <= 150, ctx('za długi komunikat blokady'));
      if (a.type === 'timeout') assert.ok(['Keyword', 'MentionSpam'].includes(rule.trigger), ctx('timeout niedozwolony'));
    }
  }
  const triggers = bp.automod.map((r) => r.trigger).filter((t) => t !== 'Keyword');
  assert.equal(new Set(triggers).size, triggers.length, ctx('zduplikowane reguły AutoMod jednego typu'));
  assert.ok(bp.automod.filter((r) => r.trigger === 'Keyword').length <= 6, ctx('za dużo reguł słów kluczowych'));
  const g = bp.guild;
  for (const key of [g.systemChannel, g.afkChannel, g.community?.rulesChannel, g.community?.updatesChannel]) {
    if (key) assert.ok(channelKeys.has(key), ctx(`ustawienie wskazuje nieistniejący kanał ${key}`));
  }
  if (g.community) {
    assert.ok(g.verificationLevel >= 1, ctx('Społeczność wymaga weryfikacji ≥ 1'));
    assert.equal(g.explicitContentFilter, 2, ctx('Społeczność wymaga filtra 2'));
    if (g.community.welcomeScreen) {
      assert.ok(g.community.welcomeScreen.channels.length <= 5, ctx('za dużo kanałów ekranu powitalnego'));
      assert.ok(g.community.welcomeScreen.description.length <= 140, ctx('za długi opis ekranu powitalnego'));
    }
  }
  if (bp.meta.gate) {
    assert.equal(bp.everyone.length, 0, ctx('przy weryfikacji @everyone nie ma uprawnień'));
    assert.ok(bp.messages.some((m) => m.kind === 'verify'), ctx('brak panelu weryfikacji'));
  }
  JSON.stringify(bp); // blueprint musi dać się wyeksportować
}

test('domyślne ustawienia każdego typu × rozmiaru × języka dają poprawny blueprint', () => {
  for (const type of TYPES) {
    for (const size of SIZES) {
      for (const language of ['pl', 'en']) {
        const a = createAnswers(type);
        a.size = size;
        a.language = language;
        applyDefaults(a);
        a.basics.name = 'Serwer Testowy';
        const bp = buildBlueprint(a);
        assertValidBlueprint(bp, `${type}/${size}/${language}`);
        assert.ok(bp.stats.channels > 5, `${type}/${size}: podejrzanie mało kanałów`);
      }
    }
  }
});

test('wszystkie style nazw i palety działają', () => {
  for (const channel of Object.keys(CHANNEL_STYLES)) {
    for (const category of Object.keys(CATEGORY_STYLES)) {
      const a = createAnswers('gaming');
      a.style.channel = channel;
      a.style.category = category;
      a.style.palette = Object.keys(PALETTES)[(channel.length + category.length) % Object.keys(PALETTES).length];
      assertValidBlueprint(buildBlueprint(a), `${channel}/${category}`);
    }
  }
});

test('maksymalna konfiguracja (wszystko włączone) mieści się w limitach Discorda', () => {
  for (const type of TYPES) {
    const a = createAnswers(type);
    a.size = 'huge';
    a.age = '18';
    applyDefaults(a);
    a.modules = Object.keys(MODULES);
    a.communityRoles = [...Object.keys(ROLE_GROUP_OPTIONS), ...(SERVER_TYPES[type].specials || []).map((s) => s.key)];
    a.staffRoles = [...Object.keys(STAFF_ROLES), ...(SERVER_TYPES[type].staffExtras || []).map((s) => s.key)];
    a.permissions.member = Object.keys(MEMBER_TOGGLES);
    a.security.automod = Object.keys(AUTOMOD_OPTIONS);
    a.channels.voiceCount = 10;
    a.channels.voiceLayout = 'big';
    a.special.items = Array.from({ length: 25 }, (_, i) => `Element numer ${i + 1} z bardzo długą nazwą testową`);
    a.special.options = ['text', 'extra', 'voice', 'role', 'private'];
    a.special.extras = (SERVER_TYPES[type].extras || []).map((e) => e.key);
    a.customStaff = Array.from({ length: 10 }, (_, i) => ({ name: `Ekipa ${i}`, color: 0x123456, level: 'mod' }));
    a.customRoles = [
      ...Array.from({ length: 10 }, (_, i) => ({ name: `Specjalna ${i}`, color: null, self: false })),
      ...Array.from({ length: 25 }, (_, i) => ({ name: `Do wyboru ${i}`, color: null, self: true })),
    ];
    a.customCategories = Array.from({ length: 10 }, (_, i) => ({
      name: `Własna ${i}`, emoji: '🏆', access: ['public', 'readonly', 'staff', 'vip'][i % 4],
      text: Array.from({ length: 5 }, (_, j) => `kanał ${j}`), voice: ['Głos 1'],
    }));
    for (const layout of ['shared', 'separate']) {
      a.special.layout = layout;
      const bp = buildBlueprint(a);
      if (bp.errors.length) {
        // Przy absurdalnie dużej konfiguracji kreator ma zgłosić przekroczenie limitu zamiast budować.
        assert.ok(bp.errors.every((e) => /Za dużo/.test(e)), `${type}/${layout}: ${bp.errors.join('; ')}`);
      } else {
        assertValidBlueprint(bp, `${type}/max/${layout}`);
      }
    }
  }
});

test('minimalna konfiguracja: brak modułów zgłasza błąd, jeden moduł działa', () => {
  const a = createAnswers('custom');
  a.modules = [];
  a.content.community = 'off';
  a.special.items = [];
  const empty = buildBlueprint(a);
  assert.ok(empty.errors.some((e) => /żadnych kanałów/.test(e)));
  a.modules = ['general'];
  a.staffRoles = [];
  a.communityRoles = [];
  const one = buildBlueprint(a);
  assertValidBlueprint(one, 'minimal');
  assert.equal(one.stats.channels, 1);
});

test('weryfikacja: @everyone bez uprawnień, rola członka z uprawnieniami, kanał weryfikacji ukryty po weryfikacji', () => {
  const a = createAnswers('gaming');
  a.modules = [...new Set([...a.modules, 'verification'])];
  const bp = buildBlueprint(a);
  const member = bp.roles.find((r) => r.key === 'member');
  assert.ok(member.permissions.includes('ViewChannel'));
  assert.deepEqual(bp.everyone, []);
  const verify = bp.categories.flatMap((c) => c.channels).find((c) => c.key === 'verify');
  const everyone = verify.overwrites.find((o) => o.target === '@everyone');
  assert.ok(everyone.allow.includes('ViewChannel'));
  assert.ok(everyone.deny.includes('SendMessages'));
  assert.ok(verify.overwrites.find((o) => o.target === 'member').deny.includes('ViewChannel'));
  const rules = bp.categories.flatMap((c) => c.channels).find((c) => c.key === 'rules');
  assert.ok(rules.overwrites.find((o) => o.target === '@everyone').allow.includes('ViewChannel'));
});

test('kanały ekipy są prywatne, zarząd tylko dla administracji, logi tylko do odczytu', () => {
  const a = createAnswers('community');
  a.size = 'large';
  applyDefaults(a);
  const bp = buildBlueprint(a);
  const all = bp.categories.flatMap((c) => c.channels);
  const staffChat = all.find((c) => c.key === 'staffChat');
  assert.ok(staffChat.overwrites.find((o) => o.target === '@everyone').deny.includes('ViewChannel'));
  assert.ok(staffChat.overwrites.some((o) => o.target === 'mod' && o.allow.includes('ViewChannel')));
  const mgmt = all.find((c) => c.key === 'management');
  assert.ok(!mgmt.overwrites.some((o) => o.target === 'mod'), 'moderator nie widzi zarządu');
  assert.ok(mgmt.overwrites.some((o) => o.target === 'admin' && o.allow.includes('ViewChannel')));
  const logs = all.find((c) => c.key === 'logMod');
  assert.ok(logs.overwrites.find((o) => o.target === '@everyone').deny.includes('SendMessages'));
  const announcements = all.find((c) => c.key === 'announcements');
  assert.ok(announcements.overwrites.find((o) => o.target === '@everyone').deny.includes('SendMessages'));
  assert.ok(announcements.overwrites.some((o) => o.target === 'admin' && o.allow.includes('SendMessages')));
  const events = all.find((c) => c.key === 'events');
  assert.ok(events.overwrites.some((o) => o.target === 'eventmgr' && o.allow.includes('SendMessages')), 'Event Manager pisze w #wydarzenia');
});

test('prywatne elementy listy (np. działy) są widoczne tylko z rolą i nie trafiają do panelu ról', () => {
  const a = createAnswers('business');
  const bp = buildBlueprint(a);
  const dept = bp.roles.find((r) => r.key === 'item0');
  assert.ok(dept, 'rola działu istnieje');
  assert.equal(dept.self, undefined, 'rola działu nie jest do samodzielnego wyboru');
  const cat = bp.categories.find((c) => c.key === 'item:0');
  assert.ok(cat.overwrites.find((o) => o.target === '@everyone').deny.includes('ViewChannel'));
  assert.ok(cat.overwrites.some((o) => o.target === 'item0' && o.allow.includes('ViewChannel')));
});

test('tryb Społeczności wymusza wymagania Discorda', () => {
  const a = createAnswers('gaming');
  a.security.verificationLevel = 0;
  a.security.contentFilter = 0;
  a.modules = a.modules.filter((m) => m !== 'rules' && m !== 'staff');
  a.content.community = 'full';
  const bp = buildBlueprint(a);
  assert.equal(bp.guild.verificationLevel, 1);
  assert.equal(bp.guild.explicitContentFilter, 2);
  assert.ok(bp.categories.flatMap((c) => c.channels).some((c) => c.key === 'rules'));
  assert.ok(bp.guild.community.updatesChannel);
  assert.ok(bp.warnings.length >= 3);
});

test('kanał 18+ tylko na serwerach 18+', () => {
  const a = createAnswers('community');
  a.modules.push('nsfw');
  assert.ok(!buildBlueprint(a).categories.flatMap((c) => c.channels).some((c) => c.nsfw));
  a.age = '18';
  applyDefaults(a);
  a.modules.push('nsfw');
  const channel = buildBlueprint(a).categories.flatMap((c) => c.channels).find((c) => c.key === 'nsfw');
  assert.ok(channel?.nsfw);
});

test('limit ról w trybie dodawania uwzględnia istniejące role', () => {
  const a = createAnswers('gaming');
  const bp = buildBlueprint(a, { existingRoles: 240, existingChannels: 10 });
  assert.ok(bp.errors.some((e) => /Za dużo ról/.test(e)));
  a.mode.type = 'wipe';
  assert.ok(!buildBlueprint(a, { existingRoles: 240 }).errors.length, 'w trybie czyszczenia istniejące role nie liczą się');
});

// ───────────── Dostęp do kanałów (krok „Dostęp do kanałów”) ─────────────

const everyoneOf = (ch) => ch.overwrites.find((o) => o.target === '@everyone') || { allow: [], deny: [] };
const channelsOf = (bp, section) => bp.categories.filter((c) => c.section === section).flatMap((c) => c.channels);

test('dostęp: „tylko odczyt” w społeczności blokuje pisanie wszystkim poza zarządem i botami', () => {
  const a = createAnswers('gaming');
  a.channelAccess = { community: { view: 'default', write: 'readonly' } };
  const bp = buildBlueprint(a);
  assertValidBlueprint(bp, 'community/readonly');
  for (const ch of channelsOf(bp, 'community')) {
    assert.ok(everyoneOf(ch).deny.includes('SendMessages'), `#${ch.name} nadal pozwala pisać`);
    assert.ok(ch.overwrites.some((o) => o.target === 'admin' && o.allow.includes('SendMessages')), `#${ch.name}: zarząd nie może pisać`);
    assert.equal(ch.access.write, 'readonly');
  }
});

test('dostęp: „tylko ekipa” ukrywa sekcję przed członkami, a weryfikacja i regulamin zostają widoczne', () => {
  const a = createAnswers('gaming');
  a.modules = [...new Set([...a.modules, 'verification'])];
  a.channelAccess = { info: { view: 'staff', write: 'default' }, voice: { view: 'staff', write: 'default' } };
  const bp = buildBlueprint(a);
  assertValidBlueprint(bp, 'info+voice/staff');
  for (const ch of channelsOf(bp, 'voice')) {
    assert.ok(everyoneOf(ch).deny.includes('ViewChannel'), `🔊 ${ch.name} widoczny dla wszystkich`);
    assert.ok(ch.overwrites.some((o) => o.target === 'mod' && o.allow.includes('ViewChannel')));
  }
  const info = channelsOf(bp, 'info');
  const verify = info.find((c) => c.key === 'verify');
  const rules = info.find((c) => c.key === 'rules');
  assert.ok(everyoneOf(verify).allow.includes('ViewChannel'), 'kanał weryfikacji musi zostać widoczny');
  assert.ok(everyoneOf(rules).allow.includes('ViewChannel'), 'regulamin musi zostać widoczny przed weryfikacją');
  assert.ok(everyoneOf(info.find((c) => c.key === 'info')).deny.includes('ViewChannel'));
  const cat = bp.categories.find((c) => c.section === 'voice');
  assert.ok(everyoneOf(cat).deny.includes('ViewChannel'), 'kategoria też ukryta – nowe kanały odziedziczą dostęp');
});

test('dostęp: kanały głosowe „tylko odczyt” = członkowie słuchają, zarząd mówi; AFK zostaje bez mówienia', () => {
  const a = createAnswers('community');
  a.channelAccess = { voice: { view: 'default', write: 'readonly' } };
  const bp = buildBlueprint(a);
  for (const ch of channelsOf(bp, 'voice')) {
    assert.ok(everyoneOf(ch).deny.includes('Speak'), `${ch.name}: członkowie nadal mówią`);
    if (ch.key !== 'afk') assert.ok(ch.overwrites.some((o) => o.target === 'admin' && o.allow.includes('Speak')));
  }
  assert.equal(channelsOf(bp, 'voice').find((c) => c.key === 'afk').access.write, 'listen');
});

test('dostęp: „także przed weryfikacją” pozwala niezweryfikowanym widzieć i pisać', () => {
  const a = createAnswers('gaming');
  a.modules = [...new Set([...a.modules, 'verification'])];
  a.channelAccess = { community: { view: 'unverified', write: 'all' } };
  const bp = buildBlueprint(a);
  const general = channelsOf(bp, 'community').find((c) => c.key === 'general');
  assert.ok(everyoneOf(general).allow.includes('ViewChannel'));
  assert.ok(everyoneOf(general).allow.includes('SendMessages'));
});

test('dostęp: kanał zarządu i prywatne kanały ról nie zmieniają się przy ustawieniach sekcji', () => {
  const a = createAnswers('business');
  const before = buildBlueprint(a);
  a.channelAccess = { staff: { view: 'members', write: 'all' }, items: { view: 'members', write: 'all' } };
  const after = buildBlueprint(a);
  const find = (bp, key) => bp.categories.flatMap((c) => c.channels).find((c) => c.key === key);
  assert.deepEqual(find(after, 'management').overwrites, find(before, 'management').overwrites);
  assert.deepEqual(find(after, 'item0t').overwrites, find(before, 'item0t').overwrites);
  assert.ok(!everyoneOf(find(after, 'staffChat')).deny.includes('ViewChannel'), 'czat ekipy stał się widoczny zgodnie z wyborem');
});

test('dostęp: wszystkie kombinacje dla każdej sekcji dają poprawny blueprint', () => {
  const views = ['default', ...Object.keys(VIEW_OPTIONS)];
  const writes = ['default', ...Object.keys(WRITE_OPTIONS)];
  const sections = ['info', 'news', 'special', 'community', 'items', 'voice', 'vip', 'staff', 'logs', 'archive'];
  for (const type of ['gaming', 'business', 'creator']) {
    for (let i = 0; i < views.length * writes.length; i += 1) {
      const a = createAnswers(type);
      a.size = 'huge';
      applyDefaults(a);
      a.modules = [...new Set([...a.modules, 'verification'])];
      a.channelAccess = Object.fromEntries(sections.map((sec, j) => [sec, { view: views[(i + j) % views.length], write: writes[Math.floor(i / views.length + j) % writes.length] }]));
      assertValidBlueprint(buildBlueprint(a), `${type}/combo${i}`);
    }
  }
});
