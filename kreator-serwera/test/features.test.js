'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { FakeGuild, FakeMember } = require('./helpers/fakeDiscord');
const { handleVerification } = require('../src/features/verification');
const { handleSelfRoles, cooldowns } = require('../src/features/selfRoles');
const { handleTicket, ownerOf } = require('../src/features/tickets');
const { renderContent } = require('../src/builder/content');
const { createAnswers } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { validateMessage } = require('./helpers/fakeDiscord');
const { SERVER_TYPES } = require('../src/data/serverTypes');

function interactionFor(guild, member, { customId, values, channel, message, component } = {}) {
  const state = { replies: [], updates: [], followUps: [], edits: [] };
  return {
    state,
    guild,
    member,
    user: member.user,
    customId,
    values,
    channel,
    message,
    component,
    replied: false,
    deferred: false,
    reply: async (p) => { state.replies.push(p); },
    update: async (p) => { state.updates.push(p); },
    followUp: async (p) => { state.followUps.push(p); },
    deferReply: async () => { state.deferred = true; },
    editReply: async (p) => { state.edits.push(p); },
  };
}

test('weryfikacja nadaje rolę członka i odmawia ról z uprawnieniami moderacyjnymi', async () => {
  const guild = new FakeGuild();
  const memberRole = await guild.roles.create({ name: 'Członek', permissions: PermissionFlagsBits.ViewChannel });
  const modRole = await guild.roles.create({ name: 'Moderator', permissions: PermissionFlagsBits.BanMembers });
  const member = new FakeMember(guild, '50');

  const ok = interactionFor(guild, member, { customId: `vf:pl:${memberRole.id}` });
  await handleVerification(ok);
  assert.ok(member.roles.cache.has(memberRole.id));
  assert.match(ok.state.replies[0].embeds[0].data.description, /Witaj/);

  const again = interactionFor(guild, member, { customId: `vf:pl:${memberRole.id}` });
  await handleVerification(again);
  assert.match(again.state.replies[0].embeds[0].data.description, /już zweryfikowany/);

  const evil = interactionFor(guild, member, { customId: `vf:en:${modRole.id}` });
  await handleVerification(evil);
  assert.ok(!member.roles.cache.has(modRole.id), 'rola moderatora nie może być nadana przyciskiem');
});

test('panel ról: przełączanie, grupa „jedna rola”, blokada niebezpiecznych ról', async () => {
  const guild = new FakeGuild();
  const red = await guild.roles.create({ name: 'Czerwony' });
  const blue = await guild.roles.create({ name: 'Niebieski' });
  const admin = await guild.roles.create({ name: 'Admin', permissions: PermissionFlagsBits.Administrator });
  const member = new FakeMember(guild, '60');
  const component = { options: [{ value: red.id }, { value: blue.id }, { value: admin.id }] };
  const message = { components: [] };
  const pick = async (values, mode = 's') => {
    const i = interactionFor(guild, member, { customId: `sr:pl:${mode}:0`, values, component, message });
    cooldowns.clear();
    await handleSelfRoles(i);
    return i;
  };

  await pick([red.id]);
  assert.ok(member.roles.cache.has(red.id));
  await pick([blue.id]);
  assert.ok(member.roles.cache.has(blue.id) && !member.roles.cache.has(red.id), 'jedna rola w grupie – kolor zastąpiony');
  await pick([blue.id]);
  assert.ok(!member.roles.cache.has(blue.id), 'ponowny wybór usuwa rolę');
  const i = await pick([admin.id], 'm');
  assert.ok(!member.roles.cache.has(admin.id), 'rola z uprawnieniami nie jest nadawana');
  assert.match(i.state.followUps[0].embeds[0].data.description, /nie mogę nadać/);
});

test('tickety: otwarcie, duplikat, przejęcie przez ekipę, zamknięcie', async () => {
  const guild = new FakeGuild();
  const support = await guild.roles.create({ name: 'Pomocnik' });
  const category = await guild.channels.create({ name: 'POMOC', type: ChannelType.GuildCategory });
  const panel = await guild.channels.create({ name: 'utwórz-ticket', type: ChannelType.GuildText, parent: category.id });
  const user = new FakeMember(guild, '300000000000000070');

  const open = interactionFor(guild, user, { customId: `tk:o:pl:${support.id}`, channel: panel });
  await handleTicket(open);
  const ticket = [...guild.channels.cache.values()].find((c) => c.name.startsWith('ticket-'));
  assert.ok(ticket, 'kanał ticketu utworzony');
  assert.equal(ticket.parentId, category.id);
  assert.equal(ownerOf(ticket), '300000000000000070');
  assert.ok(ticket.permissionOverwrites.some((o) => o.id === support.id));
  assert.ok(ticket.permissionOverwrites.some((o) => o.id === guild.id && new PermissionsBitField(o.deny).has('ViewChannel')));
  validateMessage({ embeds: ticket.messages[0].embeds, components: ticket.messages[0].components });

  const dup = interactionFor(guild, user, { customId: `tk:o:pl:${support.id}`, channel: panel });
  await handleTicket(dup);
  assert.match(dup.state.replies[0].embeds[0].data.description, /już otwarte/);

  const stranger = new FakeMember(guild, '300000000000000071');
  const claimByUser = interactionFor(guild, stranger, { customId: 'tk:l:pl', channel: ticket, message: ticket.messages[0] });
  await handleTicket(claimByUser);
  assert.match(claimByUser.state.replies[0].embeds[0].data.description, /tylko ekipa/);

  const staff = new FakeMember(guild, '300000000000000072', { roles: [support.id] });
  const claim = interactionFor(guild, staff, { customId: 'tk:l:pl', channel: ticket, message: ticket.messages[0] });
  await handleTicket(claim);
  assert.equal(claim.state.updates.length, 1, 'ekipa przejęła ticket');

  const close = interactionFor(guild, user, { customId: 'tk:c:pl', channel: ticket });
  await handleTicket(close);
  assert.equal(close.state.replies.length, 1);
});

test('treści (regulamin, info, FAQ, panele, karty) mieszczą się w limitach dla każdego typu i języka', () => {
  for (const type of Object.keys(SERVER_TYPES)) {
    for (const lang of ['pl', 'en']) {
      const answers = createAnswers(type);
      answers.language = lang;
      answers.modules.push('verification', 'faq', 'partnerships', 'boosts', 'qotd', 'counting', 'selfroles', 'tickets');
      answers.special.extras = (SERVER_TYPES[type].extras || []).map((e) => e.key);
      answers.communityRoles.push('colors', 'notifications', 'platform', 'pronouns', 'region');
      answers.basics.description = 'Opis '.repeat(200);
      answers.basics.audience = 'Wszyscy';
      for (const f of SERVER_TYPES[type].infoFields || []) answers.special.info[f.key] = `Wartość ${f.key}`;
      const bp = buildBlueprint(answers);
      let n = 1000;
      const ids = {};
      const ctx = {
        lang, answers, blueprint: bp, color: 0x5865f2, guildName: 'Serwer', date: '1 stycznia 2026',
        ch: (key) => `<#${key}>`,
        role: (key) => `<@&${(ids[key] ||= String(n += 1))}>`,
        roleId: (key) => (ids[key] ||= String(n += 1)),
      };
      const kinds = [...new Set(bp.messages.map((m) => m.kind))];
      for (const kind of kinds) {
        const payloads = renderContent(kind, ctx);
        assert.ok(payloads.length > 0, `${type}/${lang}: pusta treść ${kind}`);
        for (const p of payloads) validateMessage(p);
      }
    }
  }
});
