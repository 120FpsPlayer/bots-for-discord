'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { FakeGuild, FakeMember } = require('./helpers/fakeDiscord');
const { handleVerification, handleVerificationAnswer, verifyButtonId, parseOptions } = require('../src/features/verification');
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
        channelId: (key) => `9${String(key.length).padStart(17, '0')}`,
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

function verifyInteraction(guild, member, customId, extra = {}) {
  const state = { replies: [], modals: [] };
  return {
    state,
    guild,
    member,
    user: { id: member.id, tag: `u#${member.id}`, username: 'u', createdTimestamp: extra.createdTimestamp ?? Date.now() - 400 * 86_400_000, displayAvatarURL: () => null, toString: () => `<@${member.id}>` },
    customId,
    fields: { getTextInputValue: () => extra.answer ?? '' },
    reply: async (p) => { state.replies.push(p); },
    showModal: async (m) => { state.modals.push(m.toJSON()); },
  };
}

test('weryfikacja: identyfikator przycisku mieści opcje i mieści się w limicie 100 znaków', () => {
  const id = verifyButtonId('pl', '123456789012345678', { captcha: true, minAgeDays: 30, logChannelId: '987654321098765432' });
  assert.ok(id.length <= 100);
  assert.deepEqual(parseOptions(id.split(':')[3]), { captcha: true, minAgeDays: 30, logChannelId: '987654321098765432' });
  assert.equal(verifyButtonId('en', '123456789012345678'), 'vf:en:123456789012345678', 'bez opcji – stary, zgodny format');
});

test('weryfikacja: pytanie kontrolne – zła odpowiedź odmawia, dobra nadaje rolę i zapisuje log', async () => {
  const guild = new FakeGuild();
  const role = await guild.roles.create({ name: 'Członek', permissions: PermissionFlagsBits.ViewChannel });
  const logs = await guild.channels.create({ name: 'logi', type: ChannelType.GuildText });
  logs.isTextBased = () => true;
  const member = new FakeMember(guild, '400000000000000001');
  const buttonId = verifyButtonId('pl', role.id, { captcha: true, logChannelId: logs.id });

  const click = verifyInteraction(guild, member, buttonId);
  await handleVerification(click);
  assert.equal(click.state.modals.length, 1, 'pokazano pytanie kontrolne');
  const modal = click.state.modals[0];
  const [, a, b] = modal.components[0].label.match(/(\d+) \+ (\d+)/);
  assert.ok(!member.roles.cache.has(role.id), 'samo kliknięcie nie nadaje roli');

  const wrong = verifyInteraction(guild, member, modal.custom_id, { answer: String(Number(a) + Number(b) + 1) });
  await handleVerificationAnswer(wrong);
  assert.ok(!member.roles.cache.has(role.id));
  assert.match(wrong.state.replies[0].embeds[0].data.description, /Zła odpowiedź/);

  const forged = verifyInteraction(guild, member, modal.custom_id.replace(/:\d+:\d+:/, ':1:1:'), { answer: '2' });
  await handleVerificationAnswer(forged);
  assert.ok(!member.roles.cache.has(role.id), 'podmienione pytanie jest odrzucane');

  const right = verifyInteraction(guild, member, modal.custom_id, { answer: ` ${Number(a) + Number(b)} ` });
  await handleVerificationAnswer(right);
  assert.ok(member.roles.cache.has(role.id), 'dobra odpowiedź nadaje rolę');
  assert.equal(logs.messages.length, 2, 'log: nieudana i udana próba');
});

test('weryfikacja: za młode konto jest odrzucane z informacją, kiedy spróbować ponownie', async () => {
  const guild = new FakeGuild();
  const role = await guild.roles.create({ name: 'Członek' });
  const member = new FakeMember(guild, '400000000000000002');
  const young = verifyInteraction(guild, member, verifyButtonId('pl', role.id, { minAgeDays: 7 }), { createdTimestamp: Date.now() - 2 * 86_400_000 });
  await handleVerification(young);
  assert.ok(!member.roles.cache.has(role.id));
  assert.match(young.state.replies[0].embeds[0].data.description, /za młode/);
  const old = verifyInteraction(guild, member, verifyButtonId('pl', role.id, { minAgeDays: 7 }));
  await handleVerification(old);
  assert.ok(member.roles.cache.has(role.id));
});
