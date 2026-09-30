'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderContent } = require('../src/builder/content');
const { createAnswers } = require('../src/wizard/defaults');
const { buildBlueprint } = require('../src/builder/blueprint');
const { validateMessage } = require('./helpers/fakeDiscord');
const { SERVER_TYPES } = require('../src/data/serverTypes');

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
        for (const p of payloads) {
          validateMessage(p);
          assert.ok(!(p.components || []).length, `${type}/${lang}: ${kind} ma przyciski – bot ma publikować sam tekst`);
        }
      }
    }
  }
});
