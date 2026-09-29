'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, OverwriteType, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { createAnswers } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { executeBlueprint } = require('../src/builder/executor');
const { performCleanup, TARGETS, DEFAULT_TARGETS, DEFAULT_EVERYONE } = require('../src/cleanup/cleaner');
const { snapshotGuild, sanitizeBackup, isBackup } = require('../src/cleanup/snapshot');
const { createCleanupPanel } = require('../src/cleanup/panel');
const { parseProjectFile } = require('../src/wizard/project');
const { SessionStore } = require('../src/wizard/sessions');
const { createWizard } = require('../src/wizard/router');
const { runBuild } = require('../src/wizard/build');
const { toBits } = require('../src/builder/permissions');
const { FakeGuild, FakeChannel, FakeRole } = require('./helpers/fakeDiscord');
const { createInteraction, componentsOf } = require('./helpers/fakeInteraction');

/** Buduje serwer kreatorem (Społeczność + AutoMod), żeby było co czyścić i co kopiować. */
async function builtGuild(type = 'gaming', opts = {}) {
  const guild = new FakeGuild({ name: 'Mój Serwer', ownerId: '1', ...opts });
  const answers = createAnswers(type);
  answers.basics.name = 'Mój Serwer';
  answers.content.community = 'full';
  const blueprint = buildBlueprint(answers, { existingChannels: guild.channels.cache.size, existingRoles: guild.roles.cache.size });
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', keepChannelIds: [] });
  assert.deepEqual(result.errors, []);
  return { guild, blueprint, result };
}

/** Kanał „wywołania” – z niego uruchomiono /usun, więc musi przetrwać czyszczenie. */
function addOrigin(guild) {
  const origin = new FakeChannel(guild, { name: 'tu-wpisano-usun', type: ChannelType.GuildText });
  guild.channels.cache.set(origin.id, origin);
  return origin;
}

const nonThread = (guild) => [...guild.channels.cache.values()];

test('/usun: domyślne czyszczenie – kanały, role, AutoMod; Społeczność wyłączona; kanały startowe', async () => {
  const { guild } = await builtGuild();
  const origin = addOrigin(guild);
  assert.ok(guild.features.includes('COMMUNITY'));
  assert.ok(guild.autoModerationRules.cache.size > 0);

  const progress = [];
  const R = await performCleanup(guild, { targets: DEFAULT_TARGETS, keepChannelIds: [origin.id], invokerId: '1', onProgress: (p) => progress.push(p) });

  assert.equal(R.fatal, undefined, R.fatal);
  assert.deepEqual(R.warnings, []);
  assert.equal(R.communityDisabled, true);
  assert.ok(!guild.features.includes('COMMUNITY'));
  assert.equal(guild.autoModerationRules.cache.size, 0, 'reguły AutoMod usunięte');

  // Zostaje tylko kanał wywołania + 4 kanały startowe (2 kategorie, #ogólny, 🔊 Ogólny).
  const left = nonThread(guild);
  assert.equal(left.length, 5, left.map((c) => c.name).join(', '));
  assert.ok(guild.channels.cache.has(origin.id), 'kanał wywołania zachowany');
  const general = left.find((c) => c.name === 'ogólny');
  assert.ok(general && general.parent?.name === 'Kanały tekstowe');
  assert.ok(left.some((c) => c.name === 'Ogólny' && c.type === ChannelType.GuildVoice && c.parent?.name === 'Kanały głosowe'));
  assert.equal(R.freshChannelId, general.id);
  assert.equal(guild.settings.systemChannel, general.id, 'kanał systemowy ustawiony na #ogólny');
  assert.equal(R.created.channels, 4);

  // Role: zostaje @everyone i rola bota (zarządzana).
  const roles = [...guild.roles.cache.values()];
  assert.deepEqual(roles.map((r) => r.name).sort(), ['@everyone', 'Kreator Serwera']);
  assert.equal(guild.roles.everyone.permissions.bitfield, toBits(DEFAULT_EVERYONE), '@everyone ma domyślne uprawnienia');
  assert.ok(guild.roles.everyone.permissions.has(PermissionFlagsBits.ViewChannel), 'członkowie znów widzą kanały');
  assert.ok(!guild.roles.everyone.permissions.has(PermissionFlagsBits.Administrator));

  assert.ok(R.deleted.channels > 10 && R.deleted.categories > 3 && R.deleted.roles > 5 && R.deleted.automod > 0);
  assert.ok(progress.length > 10);
  assert.ok(progress.every((p) => p.done <= p.total), 'postęp nie przekracza 100%');
  assert.ok(R.phases.includes('Usuwanie kanałów') && R.phases.includes('Usuwanie ról'));
});

test('/usun: tylko wybrane elementy – reszta nietknięta', async () => {
  const { guild } = await builtGuild();
  const channels = guild.channels.cache.size;
  const roles = guild.roles.cache.size;
  const R = await performCleanup(guild, { targets: ['automod'], invokerId: '1' });
  assert.equal(R.deleted.automod > 0, true);
  assert.equal(guild.autoModerationRules.cache.size, 0);
  assert.equal(guild.channels.cache.size, channels, 'kanały bez zmian');
  assert.equal(guild.roles.cache.size, roles, 'role bez zmian');
  assert.ok(guild.features.includes('COMMUNITY'), 'Społeczność bez zmian');
  assert.equal(R.freshChannelId, null, 'bez kanałów startowych, gdy kanały nie są czyszczone');
});

test('/usun: emoji, naklejki, zaproszenia, wydarzenia, bany i ustawienia', async () => {
  const guild = new FakeGuild({ name: 'X', ownerId: '1' }).seedExtras({ emojis: 3, managedEmojis: 2, stickers: 2, invites: 4, bans: 5, events: 2 });
  await guild.edit({ verificationLevel: 3, explicitContentFilter: 2, defaultMessageNotifications: 0, afkTimeout: 60 });
  const R = await performCleanup(guild, { targets: Object.keys(TARGETS), fresh: false, invokerId: '1' });
  assert.deepEqual(R.warnings, []);
  assert.equal(R.deleted.emojis, 3);
  assert.equal(guild.emojis.cache.size, 2, 'emoji integracji (np. Twitch) zostają');
  assert.equal(R.deleted.stickers, 2);
  assert.equal(R.deleted.invites, 4);
  assert.equal(R.deleted.events, 2);
  assert.equal(R.deleted.unbanned, 5);
  assert.equal(guild.bans.cache.size, 0);
  assert.equal(guild.verificationLevel, 0);
  assert.equal(guild.explicitContentFilter, 0);
  assert.equal(guild.defaultMessageNotifications, 1);
  assert.equal(guild.afkTimeout, 300);
  assert.equal(nonThread(guild).length, 0, 'bez kanałów startowych (fresh: false)');
});

test('/usun: role powyżej bota zostają (z ostrzeżeniem), przerwanie zatrzymuje czyszczenie', async () => {
  const guild = new FakeGuild({ name: 'X', ownerId: '1', existingRoles: 5, existingChannels: 30 });
  const above = new FakeRole(guild, { name: 'Właściciel', position: 5000 });
  guild.roles.cache.set(above.id, above);
  const R1 = await performCleanup(guild, { targets: ['roles'], invokerId: '1' });
  assert.ok(guild.roles.cache.has(above.id));
  assert.ok(R1.warnings.some((w) => w.includes('powyżej roli bota')));
  assert.equal(R1.deleted.roles, 5);

  let calls = 0;
  const R2 = await performCleanup(guild, { targets: ['channels'], invokerId: '1', shouldAbort: () => ++calls > 10 });
  assert.equal(R2.aborted, true);
  assert.ok(guild.channels.cache.size > 0 && guild.channels.cache.size < 30, `zostało ${guild.channels.cache.size}`);
});

test('kopia zapasowa: snapshot → JSON → przywrócenie na pustym serwerze odtwarza strukturę 1:1', async () => {
  const { guild } = await builtGuild('community');
  // Kanał bez kategorii i nadpisanie dla konkretnej osoby – też mają trafić do kopii.
  await guild.channels.create({
    name: 'luzem',
    type: ChannelType.GuildText,
    topic: 'kanał bez kategorii',
    permissionOverwrites: [{ id: '123456789012345678', type: OverwriteType.Member, allow: PermissionFlagsBits.ManageMessages, deny: 0n }],
  });
  const snap = await snapshotGuild(guild);
  const json = JSON.parse(JSON.stringify(snap));
  assert.ok(isBackup(json));
  const { blueprint } = sanitizeBackup(json);
  assert.equal(blueprint.meta.type, 'backup');
  assert.ok(blueprint.categories.some((c) => c.root && c.channels.some((ch) => ch.name === 'luzem')));

  const target = new FakeGuild({ name: 'Pusty', ownerId: '1', existingChannels: 0, existingRoles: 0 });
  const R = await executeBlueprint({ guild: target, blueprint, answers: createAnswers('community'), invokerId: '1' });
  assert.equal(R.fatal, undefined, R.fatal);
  assert.deepEqual(R.errors, []);

  const rolesBy = (g) => [...g.roles.cache.values()].filter((r) => r.id !== g.id && !r.managed).sort((a, b) => b.position - a.position);
  assert.deepEqual(rolesBy(target).map((r) => r.name), rolesBy(guild).map((r) => r.name), 'role w tej samej kolejności');
  for (const role of rolesBy(guild)) {
    const copy = rolesBy(target).find((r) => r.name === role.name);
    assert.equal(copy.permissions.bitfield, role.permissions.bitfield, `uprawnienia roli ${role.name}`);
    assert.equal(copy.color, role.color, `kolor roli ${role.name}`);
  }
  const structure = (g) => {
    const all = [...g.channels.cache.values()];
    return all.filter((c) => c.type === ChannelType.GuildCategory).map((cat) => `${cat.name}: ${all.filter((c) => c.parentId === cat.id).map((c) => c.name).sort().join(',')}`).sort();
  };
  assert.deepEqual(structure(target), structure(guild), 'kategorie i kanały');
  const overwriteCount = (g) => [...g.channels.cache.values()].reduce((n, c) => n + c.permissionOverwrites.length, 0);
  // Rola bota nie jest kopiowana (to rola integracji), więc jej nadpisania nie wracają.
  const botRoleId = [...guild.roles.cache.values()].find((r) => r.managed).id;
  const botOverwrites = [...guild.channels.cache.values()].reduce((n, c) => n + c.permissionOverwrites.filter((o) => o.id === botRoleId).length, 0);
  assert.equal(overwriteCount(target), overwriteCount(guild) - botOverwrites, 'nadpisania uprawnień');
  const luzem = [...target.channels.cache.values()].find((c) => c.name === 'luzem');
  assert.equal(luzem.parentId, null);
  assert.ok(luzem.permissionOverwrites.some((o) => o.id === '123456789012345678' && o.type === OverwriteType.Member));
  assert.equal(target.autoModerationRules.cache.size, guild.autoModerationRules.cache.size, 'reguły AutoMod');
  assert.ok(target.features.includes('COMMUNITY'), 'Społeczność przywrócona');
  assert.equal(target.name, 'Mój Serwer');
});

test('kopia zapasowa: plik od użytkownika jest sprawdzany (złe klucze, uprawnienia, linki)', () => {
  assert.throws(() => sanitizeBackup({ hello: 1 }), /kopia zapasowa/);
  assert.throws(() => sanitizeBackup({ kind: 'kreator-backup', blueprint: { roles: [], categories: [] } }), /pusta/);
  const { blueprint } = sanitizeBackup({
    kind: 'kreator-backup',
    guildName: 'X',
    blueprint: {
      roles: [
        { key: 'r1', name: 'Admin', permissions: ['Administrator', 'NieIstnieje'], color: 0xffffff + 5 },
        { key: 'zly-klucz', name: 'Zła' },
        { key: 'r1', name: 'Duplikat' },
      ],
      categories: [{
        key: 'c1',
        name: 'Kategoria',
        overwrites: [{ target: 'r999', allow: ['ViewChannel'] }, { target: '@everyone', deny: ['ViewChannel'] }],
        channels: [
          { key: 'c2', kind: 'text', name: 'ok', slowmode: 999999, overwrites: [{ target: 'user:1', allow: ['ViewChannel'] }, { target: 'r1', allow: ['SendMessages'], deny: ['SendMessages'] }] },
          { key: 'c3', kind: 'thread', name: 'zly-typ' },
          { key: 'c4', kind: 'voice', name: 'glos', userLimit: 500 },
        ],
      }],
      automod: [{ trigger: 'Keyword', metadata: { keywordFilter: ['a'.repeat(100)] }, actions: [{ type: 'alert', channel: 'c999' }, { type: 'block' }] }, { trigger: 'Zły', actions: [{ type: 'block' }] }],
      guild: { iconUrl: 'https://evil.example.com/x.png', verificationLevel: 99, afkTimeout: 7 },
    },
  });
  assert.deepEqual(blueprint.roles.map((r) => r.key), ['r1']);
  assert.deepEqual(blueprint.roles[0].permissions, ['Administrator']);
  assert.equal(blueprint.roles[0].color, 0);
  const cat = blueprint.categories[0];
  assert.deepEqual(cat.overwrites, [{ target: '@everyone', allow: [], deny: ['ViewChannel'] }], 'nadpisanie dla nieznanej roli pominięte');
  assert.deepEqual(cat.channels.map((c) => c.name), ['ok', 'glos']);
  assert.equal(cat.channels[0].slowmode, 21600);
  assert.equal(cat.channels[1].userLimit, 99);
  assert.deepEqual(cat.channels[0].overwrites, [{ target: 'r1', allow: ['SendMessages'], deny: [] }], 'zły user: i sprzeczne uprawnienia odfiltrowane');
  assert.equal(blueprint.automod.length, 1);
  assert.deepEqual(blueprint.automod[0].actions, [{ type: 'block', message: undefined }]);
  assert.equal(blueprint.automod[0].metadata.keywordFilter[0].length, 60);
  assert.equal(blueprint.guild.iconUrl, null, 'ikona tylko z CDN Discorda');
  assert.equal(blueprint.guild.verificationLevel, 4);
  assert.equal(blueprint.guild.afkTimeout, 300);
});

test('plik projektu vs kopia zapasowa – rozpoznawanie', async () => {
  const guild = new FakeGuild({ name: 'X', ownerId: '1' });
  const snap = JSON.parse(JSON.stringify(await snapshotGuild(guild)));
  assert.equal(parseProjectFile(snap).kind, 'backup');
  const project = parseProjectFile({ answers: createAnswers('gaming') });
  assert.equal(project.kind, 'project');
  assert.equal(project.answers.type, 'gaming');
});

// ───────────── Panel /usun ─────────────

function panelSetup() {
  const store = new SessionStore({ timeoutMinutes: 30 });
  const panel = createCleanupPanel({ store });
  return { store, panel };
}

test('panel /usun: tylko właściciel, bot musi mieć Administratora, blokada podczas budowy', async () => {
  const { store, panel } = panelSetup();
  const guild = new FakeGuild({ name: 'Serwer', ownerId: '1' });

  const admin = createInteraction({ guild, userId: '2', kind: 'command', commandName: 'usun' });
  await panel.start(admin);
  assert.match(admin.state.replies[0].embeds[0].data.title, /Tylko dla właściciela/);

  store.lock(guild.id, 'budowa serwera');
  const busy = createInteraction({ guild, userId: '1', kind: 'command', commandName: 'usun' });
  await panel.start(busy);
  assert.match(busy.state.replies[0].embeds[0].data.title, /zajęty/);
  store.unlock(guild.id);

  const botRole = [...guild.roles.cache.values()].find((r) => r.managed);
  botRole.permissions = new PermissionsBitField(PermissionFlagsBits.ManageChannels);
  const noAdmin = createInteraction({ guild, userId: '1', kind: 'command', commandName: 'usun' });
  await panel.start(noAdmin);
  assert.match(noAdmin.state.replies[0].embeds[0].data.title, /Administrator/);
});

test('panel /usun: wybór, zła nazwa nic nie usuwa, poprawna – kopia zapasowa, czyszczenie i raport', async () => {
  const { store, panel } = panelSetup();
  const { guild } = await builtGuild();
  guild.seedExtras({ invites: 2, bans: 3 });
  const origin = addOrigin(guild);
  const channelsBefore = guild.channels.cache.size;

  const cmd = createInteraction({ guild, userId: '1', kind: 'command', commandName: 'usun', channelId: origin.id });
  await panel.start(cmd);
  const frame = cmd.state.edits.at(-1);
  const embedData = frame.embeds[0].data;
  assert.match(embedData.title, /Czyszczenie serwera/);
  assert.ok(embedData.fields.some((f) => f.name.includes('Na serwerze jest') && f.value.includes('zaproszenia: **2**') && f.value.includes('bany: **3**')));
  const comps = componentsOf(frame);
  const what = comps.find((c) => c.custom_id.endsWith(':what'));
  const runBtn = comps.find((c) => c.custom_id.endsWith(':run'));
  assert.deepEqual(what.options.filter((o) => o.default).map((o) => o.value), DEFAULT_TARGETS);
  const sid = what.custom_id.split(':')[1];

  // Ktoś inny (nawet admin) nie może klikać w panel właściciela.
  const intruder = createInteraction({ guild, userId: '2', customId: `cl:${sid}:run` });
  await panel.handle(intruder);
  assert.match(intruder.state.replies[0].content, /właściciela/);

  // Zaznaczamy też zaproszenia.
  const sel = createInteraction({ guild, userId: '1', customId: what.custom_id, values: [...DEFAULT_TARGETS, 'invites'] });
  await panel.handle(sel);
  assert.ok(sel.state.updates[0].embeds[0].data.fields.some((f) => f.name.startsWith('🗑️ Zostanie usunięte (5)')));

  // Przycisk → modal z potwierdzeniem.
  const run = createInteraction({ guild, userId: '1', customId: runBtn.custom_id });
  await panel.handle(run);
  assert.equal(run.state.modals.length, 1);

  // Zła nazwa – nic nie zostaje usunięte.
  const wrong = createInteraction({ guild, userId: '1', customId: `cl:${sid}:confirm`, kind: 'modal', fields: { confirm: 'inna nazwa' }, channelId: origin.id });
  await panel.handle(wrong);
  assert.match(wrong.state.updates[0].embeds[0].data.description, /nie zgadza/);
  assert.equal(guild.channels.cache.size, channelsBefore);

  // Poprawna nazwa (wielkość liter bez znaczenia).
  const ok = createInteraction({ guild, userId: '1', customId: `cl:${sid}:confirm`, kind: 'modal', fields: { confirm: 'mój serwer' }, channelId: origin.id });
  await panel.handle(ok);
  // Najpierw kopia zapasowa (plik w odpowiedzi + wiadomość prywatna), dopiero potem usuwanie.
  const backupMsg = ok.state.replies.find((r) => r.files?.length);
  assert.ok(backupMsg, 'plik kopii wysłany');
  const file = JSON.parse(backupMsg.files[0].attachment.toString('utf8'));
  assert.ok(isBackup(file));
  assert.ok(file.blueprint.roles.length > 5 && file.blueprint.categories.length > 3, 'kopia zawiera strukturę sprzed czyszczenia');
  assert.equal(ok.state.dms.length, 1, 'kopia także w wiadomości prywatnej');

  const done = ok.state.edits.at(-1).embeds[0].data;
  assert.match(done.title, /Serwer wyczyszczony/);
  assert.ok(guild.channels.cache.has(origin.id));
  assert.equal(guild.invites.cache.size, 0);
  assert.equal(guild.bans.cache.size, 3, 'bany nie były zaznaczone');
  assert.equal(store.lockedBy(guild.id), null, 'blokada zdjęta po czyszczeniu');
  const doneButtons = componentsOf(ok.state.edits.at(-1));
  assert.ok(doneButtons.some((b) => b.url?.includes(guild.id)), 'link do #ogólny');
  assert.ok(doneButtons.some((b) => b.custom_id === `wzx:delorigin:${origin.id}`), 'przycisk usunięcia kanału');

  // Panel po zakończeniu wygasa.
  const late = createInteraction({ guild, userId: '1', customId: `cl:${sid}:run` });
  await panel.handle(late);
  assert.match(late.state.updates[0].embeds[0].data.title, /wygasł/);
});

test('panel /usun: przycisk „Tylko kopia zapasowa” niczego nie usuwa', async () => {
  const { panel } = panelSetup();
  const { guild } = await builtGuild();
  const before = guild.channels.cache.size;
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', commandName: 'usun' });
  await panel.start(cmd);
  const sid = componentsOf(cmd.state.edits.at(-1))[0].custom_id.split(':')[1];
  const b = createInteraction({ guild, userId: '1', customId: `cl:${sid}:backup` });
  await panel.handle(b);
  assert.equal(b.state.edits.at(-1).files.length, 1);
  assert.equal(guild.channels.cache.size, before);
});

// ───────────── Przywracanie przez /stworz projekt:<kopia> ─────────────

test('/stworz z plikiem kopii: ekran przywracania, tryb wyczyść (właściciel) i odtworzenie serwera', async (t) => {
  const { guild: source } = await builtGuild('community');
  const backupJson = JSON.stringify(await snapshotGuild(source));
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => backupJson });
  t.after(() => { global.fetch = originalFetch; });

  const store = new SessionStore({ timeoutMinutes: 30 });
  const wizard = createWizard({ store, config: { sessionTimeoutMinutes: 30, ownerOnly: false }, runBuild });
  const guild = new FakeGuild({ name: 'Nowy', ownerId: '1', existingChannels: 2, existingRoles: 2 });
  const origin = addOrigin(guild);
  const oldIds = [...guild.channels.cache.keys()].filter((id) => id !== origin.id);

  const attachment = { name: 'kopia.json', size: backupJson.length, url: 'https://cdn.discordapp.com/x/kopia.json', contentType: 'application/json' };
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', attachment, channelId: origin.id });
  await wizard.start(cmd);
  const frame = cmd.state.edits.at(-1);
  assert.match(frame.embeds[0].data.title, /Przywracanie kopii/);
  const comps = componentsOf(frame);
  const mode = comps.find((c) => c.custom_id.endsWith(':r:mode'));
  assert.ok(mode, 'wybór trybu');
  const build = comps.find((c) => c.custom_id.endsWith(':n:build'));
  assert.equal(build.disabled, false);

  // Podgląd kanałów działa na blueprincie kopii.
  const pv = createInteraction({ guild, userId: '1', customId: comps.find((c) => c.custom_id.endsWith(':n:pvc')).custom_id });
  await wizard.handle(pv);
  assert.match(pv.state.updates[0].embeds[0].data.title, /Podgląd struktury/);

  // Tryb „wyczyść i przywróć” – tylko właściciel, z potwierdzeniem nazwy.
  const selMode = createInteraction({ guild, userId: '1', customId: mode.custom_id, values: ['wipe'] });
  await wizard.handle(selMode);
  const buildBtn = createInteraction({ guild, userId: '1', customId: build.custom_id });
  await wizard.handle(buildBtn);
  assert.equal(buildBtn.state.modals.length, 1);
  const sid = build.custom_id.split(':')[1];
  const confirm = createInteraction({ guild, userId: '1', customId: `wz:${sid}:m:wipe`, kind: 'modal', fields: { confirm: 'Nowy' }, channelId: origin.id });
  await wizard.handle(confirm);

  const done = confirm.state.edits.at(-1).embeds[0].data;
  assert.match(done.title, /Kopia zapasowa przywrócona/);
  const names = (g) => [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory).map((c) => c.name).sort();
  assert.deepEqual(names(guild), names(source));
  assert.ok(guild.channels.cache.has(origin.id), 'kanał wywołania zachowany');
  assert.ok(oldIds.every((id) => !guild.channels.cache.has(id)), 'stare kanały usunięte');
  assert.equal(guild.name, 'Mój Serwer');
});

test('/stworz jest zablokowane w trakcie czyszczenia', async () => {
  const store = new SessionStore({ timeoutMinutes: 30 });
  const wizard = createWizard({ store, config: { sessionTimeoutMinutes: 30, ownerOnly: false }, runBuild: async () => {} });
  const guild = new FakeGuild({ name: 'X', ownerId: '1' });
  store.lock(guild.id, 'czyszczenie serwera');
  const cmd = createInteraction({ guild, userId: '1', kind: 'command' });
  await wizard.start(cmd);
  assert.match(cmd.state.replies[0].embeds[0].data.description, /czyszczenie serwera/);
});

test('panel /usun: nieudana kopia zapasowa przerywa czyszczenie, panel działa dalej', async () => {
  const { panel } = panelSetup();
  const guild = new FakeGuild({ name: 'Serwer', ownerId: '1', existingChannels: 5 });
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', commandName: 'usun' });
  await panel.start(cmd);
  const sid = componentsOf(cmd.state.edits.at(-1))[0].custom_id.split(':')[1];
  const before = guild.channels.cache.size;
  const ok = createInteraction({ guild, userId: '1', customId: `cl:${sid}:confirm`, kind: 'modal', fields: { confirm: 'Serwer' } });
  ok.followUp = async () => { throw new Error('Discord nie przyjął pliku'); };
  await panel.handle(ok);
  assert.equal(guild.channels.cache.size, before, 'nic nie usunięto');
  assert.match(ok.state.edits.at(-1).embeds[0].data.description, /Nie udało się utworzyć kopii/);
  const again = createInteraction({ guild, userId: '1', customId: `cl:${sid}:refresh` });
  await panel.handle(again);
  assert.match(again.state.edits.at(-1).embeds[0].data.title, /Czyszczenie serwera/, 'panel nadal aktywny');
});
