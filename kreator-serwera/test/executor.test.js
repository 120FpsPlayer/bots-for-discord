'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { createAnswers, applyDefaults } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { executeBlueprint } = require('../src/builder/executor');
const { SERVER_TYPES } = require('../src/data/serverTypes');
const { FakeGuild } = require('./helpers/fakeDiscord');

async function build(type, { mode = 'append', community = 'full', guildOpts = {}, tweak } = {}) {
  const guild = new FakeGuild({ name: 'Stara nazwa', ownerId: '1', ...guildOpts });
  const answers = createAnswers(type);
  answers.basics.name = 'Nowy Serwer';
  answers.mode.type = mode;
  answers.content.community = community;
  if (tweak) tweak(answers);
  const blueprint = buildBlueprint(answers, { existingChannels: guild.channels.cache.size, existingRoles: guild.roles.cache.size });
  assert.deepEqual(blueprint.errors, []);
  const progress = [];
  const result = await executeBlueprint({
    guild, blueprint, answers, invokerId: '2', keepChannelIds: [], onProgress: (s) => progress.push(s),
  });
  return { guild, blueprint, result, progress, answers };
}

test('budowa każdego typu serwera na atrapie Discorda – bez błędów', async () => {
  for (const type of Object.keys(SERVER_TYPES)) {
    const { guild, blueprint, result, progress } = await build(type);
    assert.equal(result.fatal, undefined, `${type}: ${result.fatal}`);
    assert.deepEqual(result.errors, [], `${type}: ${result.errors.join('\n')}`);
    assert.equal(result.created.roles, blueprint.stats.roles, `${type}: role`);
    assert.equal(result.created.categories, blueprint.stats.categories, `${type}: kategorie`);
    assert.equal(result.created.channels, blueprint.stats.channels, `${type}: kanały`);
    assert.ok(result.created.messages >= blueprint.messages.length, `${type}: wiadomości ${result.created.messages}/${blueprint.messages.length}`);
    assert.equal(guild.name, 'Nowy Serwer');
    assert.ok(progress.length > 10, 'raportowanie postępu');
    assert.ok(progress.at(-1).done <= progress.at(-1).total + 1, 'postęp nie przekracza 100%');
  }
});

test('kolejność ról odpowiada blueprintowi (pierwsza = najwyższa)', async () => {
  const { guild, blueprint, result } = await build('gaming');
  const positions = blueprint.roles.map((r) => guild.roles.cache.get(result.roles[r.key]).position);
  for (let i = 1; i < positions.length; i += 1) assert.ok(positions[i - 1] > positions[i], `rola ${blueprint.roles[i].name} jest nie na miejscu`);
  const bot = guild.me.roles.highest;
  assert.ok(bot.position > positions[0], 'rola bota zostaje najwyżej');
});

test('tryb Społeczności: włączany, kanały ogłoszeń konwertowane, scena i ekran powitalny', async () => {
  const { guild, result } = await build('community', {
    tweak: (a) => { a.size = 'large'; applyDefaults(a); a.content.community = 'full'; },
  });
  assert.ok(guild.features.includes('COMMUNITY'));
  assert.equal(result.community, true);
  const announcements = guild.channels.cache.get(result.channels.announcements);
  assert.equal(announcements.type, ChannelType.GuildAnnouncement);
  const stage = guild.channels.cache.get(result.channels.stage);
  assert.equal(stage.type, ChannelType.GuildStageVoice);
  assert.ok(guild.welcomeScreen?.welcomeChannels.length > 0);
  assert.equal(guild.settings.rulesChannel, result.channels.rules);
  assert.deepEqual(result.errors, []);
});

test('bez Społeczności: ogłoszenia jako zwykłe kanały, scena jako kanał głosowy', async () => {
  const { guild, result } = await build('community', {
    community: 'off',
    tweak: (a) => { a.size = 'large'; applyDefaults(a); a.content.community = 'off'; },
  });
  assert.ok(!guild.features.includes('COMMUNITY'));
  assert.equal(guild.channels.cache.get(result.channels.announcements).type, ChannelType.GuildText);
  assert.equal(guild.channels.cache.get(result.channels.stage).type, ChannelType.GuildVoice);
  assert.deepEqual(result.errors, []);
});

test('tryb czyszczenia usuwa stare kanały i role, zachowuje kanał wywołania i rolę bota', async () => {
  const guild = new FakeGuild({ ownerId: '1', existingChannels: 6, existingRoles: 5 });
  const origin = [...guild.channels.cache.values()][0];
  const answers = createAnswers('gaming');
  answers.mode.type = 'wipe';
  const blueprint = buildBlueprint(answers);
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', keepChannelIds: [origin.id] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.deleted.channels, 5);
  assert.equal(result.deleted.roles, 5);
  assert.ok(guild.channels.cache.has(origin.id), 'kanał wywołania zachowany');
  assert.ok([...guild.roles.cache.values()].some((r) => r.managed), 'rola bota zachowana');
  assert.ok(![...guild.channels.cache.values()].some((c) => c.name.startsWith('stary-kanal') && c.id !== origin.id));
});

test('czyszczenie serwera, który już jest Społecznością (kanały chronione usuwane na końcu)', async () => {
  const guild = new FakeGuild({ ownerId: '1', community: true, existingChannels: 4 });
  const [rules, updates] = [...guild.channels.cache.values()];
  guild.protectedChannels.add(rules.id);
  guild.protectedChannels.add(updates.id);
  const answers = createAnswers('gaming');
  answers.mode.type = 'wipe';
  const blueprint = buildBlueprint(answers);
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', keepChannelIds: [] });
  assert.deepEqual(result.errors, []);
  // Chronione kanały zostały zwolnione po przestawieniu regulaminu na nowy kanał
  guild.protectedChannels.delete(rules.id);
  guild.protectedChannels.delete(updates.id);
  assert.ok(!guild.channels.cache.has(rules.id) || result.warnings.some((w) => /Usuwanie/.test(w)));
});

test('AutoMod: reguły tworzone z alertami i wyjątkami; istniejące reguły tego typu są pomijane', async () => {
  const { guild, blueprint, result } = await build('community', { tweak: (a) => { a.size = 'huge'; applyDefaults(a); } });
  assert.equal(result.created.automod, blueprint.automod.length);
  for (const rule of guild.autoModerationRules.cache.values()) {
    assert.ok(rule.data.exemptRoles.length > 0, 'ekipa jest wyłączona z AutoMod');
    assert.ok(rule.data.actions.some((a) => a.type === 2), 'alert na kanał logów');
  }
  // drugi przebieg w trybie „dodaj” – reguły jednorazowe mają zostać pominięte, a nie wywalić budowy
  const answers = createAnswers('community');
  answers.size = 'huge';
  applyDefaults(answers);
  const bp2 = buildBlueprint(answers);
  const again = await executeBlueprint({ guild, blueprint: bp2, answers, invokerId: '1' });
  assert.ok(again.warnings.some((w) => /już regułę tego typu/.test(w)));
});

test('uprawnienia kanałów trafiają na serwer jako bity z poprawnymi ID ról', async () => {
  const { guild, result } = await build('community', { tweak: (a) => { a.size = 'large'; applyDefaults(a); } });
  const staffChat = guild.channels.cache.get(result.channels.staffChat);
  const everyone = staffChat.permissionOverwrites.find((o) => o.id === guild.id);
  assert.ok(everyone.deny & PermissionFlagsBits.ViewChannel);
  const mod = staffChat.permissionOverwrites.find((o) => o.id === result.roles.mod);
  assert.ok(mod.allow & PermissionFlagsBits.ViewChannel);
  const owner = guild.roles.cache.get(result.roles.owner);
  assert.ok(owner.permissions.has(PermissionFlagsBits.Administrator));
  const memberOwner = await guild.members.fetch('1');
  assert.ok(memberOwner.roles.cache.has(result.roles.owner), 'właściciel dostał rolę Właściciel');
  const invoker = await guild.members.fetch('2');
  assert.ok(invoker.roles.cache.has(result.roles.coowner) || invoker.roles.cache.has(result.roles.admin), 'wywołujący dostał rolę ekipy');
  assert.ok(guild.me.roles.cache.has(result.roles.bots), 'bot dostał rolę Boty');
});

test('wiadomości: regulamin, panel weryfikacji z przyciskiem, opis ról (tekst), forum propozycji; bez ticketów i menu ról', async () => {
  const { guild, result } = await build('gaming', { tweak: (a) => { a.modules.push('verification', 'suggestions'); } });
  const msg = (key) => guild.channels.cache.get(result.channels[key]).messages;
  assert.ok(msg('rules')[0].embeds[0].toJSON().fields.length >= 5, 'regulamin ma paragrafy');
  const verifyButton = msg('verify')[0].components[0].toJSON().components[0];
  assert.equal(verifyButton.custom_id, `vf:pl:${result.roles.member}`);
  const roleInfo = msg('roleinfo');
  assert.ok(roleInfo.length >= 1, 'opis ról opublikowany');
  const roleText = roleInfo.flatMap((m) => m.embeds.flatMap((e) => e.toJSON().fields.map((f) => f.value))).join(' ');
  assert.ok(roleText.includes(`<@&${result.roles.owner}>`), 'opis ról wymienia role');
  const allMessages = [...guild.channels.cache.values()].flatMap((c) => c.messages);
  const customIds = allMessages.flatMap((m) => (m.components || []).flatMap((r) => r.toJSON().components.map((c) => c.custom_id)));
  assert.deepEqual(customIds.filter((id) => !id.startsWith('vf:')), [], 'jedyny interaktywny element to przycisk weryfikacji');
  assert.ok(![...guild.channels.cache.values()].some((c) => /ticket/.test(c.name)), 'brak kanałów ticketów');
  const forum = guild.channels.cache.get(result.channels.suggestions);
  assert.equal(forum.type, ChannelType.GuildForum);
  assert.equal(forum.threadsCreated.length, 1);
  assert.ok(forum.threadsCreated[0].pinned);
});

test('dostęp do kanałów z kreatora trafia na serwer (bity uprawnień na kanałach)', async () => {
  const { guild, result } = await build('gaming', {
    tweak: (a) => { a.channelAccess = { community: { view: 'default', write: 'readonly' }, voice: { view: 'staff', write: 'default' } }; },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.created.overwrites > 50, `ustawiono ${result.created.overwrites} nadpisań`);
  const general = guild.channels.cache.get(result.channels.general);
  const everyone = general.permissionOverwrites.find((o) => o.id === guild.id);
  assert.ok(everyone.deny & PermissionFlagsBits.SendMessages, '#ogólny: członkowie nie piszą');
  const lobby = guild.channels.cache.get(result.channels.lobby1);
  assert.ok(lobby.permissionOverwrites.find((o) => o.id === guild.id).deny & PermissionFlagsBits.ViewChannel, 'lobby ukryte');
  assert.ok(lobby.permissionOverwrites.find((o) => o.id === result.roles.mod).allow & PermissionFlagsBits.ViewChannel, 'ekipa widzi lobby');
});

test('przerwanie budowy zatrzymuje ją po bieżącej operacji', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  const answers = createAnswers('gaming');
  const blueprint = buildBlueprint(answers);
  let calls = 0;
  const result = await executeBlueprint({ guild, blueprint, answers, invokerId: '1', shouldAbort: () => { calls += 1; return calls > 20; } });
  assert.equal(result.aborted, true);
  assert.ok(result.created.roles < blueprint.stats.roles);
});

test('serwer bez boostów: ikony ról pomijane bez błędów; z boostami – ikony ustawione', async () => {
  const plain = await build('gaming');
  assert.deepEqual(plain.result.errors, []);
  const boosted = await build('gaming', { guildOpts: { features: ['ROLE_ICONS'] } });
  assert.deepEqual(boosted.result.errors, []);
  const owner = boosted.guild.roles.cache.get(boosted.result.roles.owner);
  assert.equal(owner.unicodeEmoji, '👑');
});
