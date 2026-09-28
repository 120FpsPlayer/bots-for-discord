'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { FakeGuild, FakeMember } = require('./helpers/fakeDiscord');
const { handleVerification } = require('../src/features/verification');
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

test('treści (regulamin, info, FAQ, opis ról, karty) mieszczą się w limitach dla każdego typu i języka', () => {
  for (const type of Object.keys(SERVER_TYPES)) {
    for (const lang of ['pl', 'en']) {
      const answers = createAnswers(type);
      answers.language = lang;
      answers.modules.push('verification', 'faq', 'partnerships', 'boosts', 'qotd', 'counting', 'roleinfo');
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
