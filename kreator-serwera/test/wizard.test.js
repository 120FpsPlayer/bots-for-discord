'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ComponentType, PermissionsBitField } = require('discord.js');
const { SessionStore } = require('../src/wizard/sessions');
const { createWizard } = require('../src/wizard/router');
const { STEPS } = require('../src/wizard/steps');
const { SERVER_TYPES } = require('../src/data/serverTypes');
const { FakeGuild } = require('./helpers/fakeDiscord');
const { createInteraction, componentsOf } = require('./helpers/fakeInteraction');

const config = { sessionTimeoutMinutes: 30, ownerOnly: false };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Przykładowe odpowiedzi do modali – dobrane tak, by testować parsowanie. */
function sampleFieldValue(component, random) {
  const id = component.custom_id;
  const samples = {
    name: 'Kraina Graczy PL',
    description: 'Najlepszy polski serwer dla graczy. Turnieje, wspólne granie i świetna atmosfera!',
    audience: 'gracze 15-30 lat',
    icon: random() > 0.5 ? 'https://example.com/ikona.png' : 'to-nie-link',
    items: 'Minecraft, CS2,   Valorant ; League of Legends\nFortnite, minecraft, Rocket League',
    roles: 'Opiekun Discorda, #00B894, mod\nRekruter | #FDCB6E\nZły kolor, #GGGGGG, admin',
    special: 'Zasłużony, #F1C40F\nTwórca treści',
    self: 'Szukam drużyny\nNocny marek\nStreamer, #9146FF',
    text: 'zapisy, drabinka, wyniki meczów',
    voice: 'Sędziowie, Mecz 1',
    emoji: random() > 0.5 ? '🏆' : 'abc',
    confirm: 'Test Guild',
  };
  if (component.type === ComponentType.StringSelect) return [component.options[Math.floor(random() * component.options.length)].value];
  if (id.startsWith('info_')) return random() > 0.3 ? `Wartość ${id} – https://example.com` : '';
  return samples[id] ?? 'tekst';
}

async function dispatch(wizard, guild, customId, extra = {}) {
  const interaction = createInteraction({ guild, customId, ...extra });
  await wizard.handle(interaction);
  return interaction;
}

function lastPayload(interaction) {
  const s = interaction.state;
  return s.updates.at(-1) || s.replies.at(-1) || s.edits.at(-1);
}

async function exerciseStep(wizard, guild, payload, random) {
  const components = componentsOf(payload);
  let current = payload;
  for (const c of components) {
    if (c.type === ComponentType.StringSelect && !c.custom_id.includes(':s:goto')) {
      if (c.disabled) continue;
      const count = c.min_values + Math.floor(random() * (c.max_values - c.min_values + 1));
      const shuffled = [...c.options].sort(() => random() - 0.5);
      const values = shuffled.slice(0, count).map((o) => o.value);
      const i = await dispatch(wizard, guild, c.custom_id, { values });
      current = lastPayload(i) || current;
    }
    if (c.type === ComponentType.Button && c.custom_id?.includes(':b:') && !c.disabled) {
      const i = await dispatch(wizard, guild, c.custom_id);
      if (i.state.modals.length) {
        const modal = i.state.modals[0];
        const fields = {};
        for (const label of modal.components) fields[label.component.custom_id] = sampleFieldValue(label.component, random);
        const m = await dispatch(wizard, guild, modal.custom_id, { kind: 'modal', fields });
        current = lastPayload(m) || current;
      } else {
        current = lastPayload(i) || current;
      }
    }
  }
  return current;
}

test('pełne przejście kreatora dla każdego typu serwera (losowe odpowiedzi, walidacja limitów Discorda)', async () => {
  for (const [index, type] of Object.keys(SERVER_TYPES).entries()) {
    const random = rng(1000 + index);
    const guild = new FakeGuild({ name: 'Test Guild', ownerId: '1' });
    const store = new SessionStore({ timeoutMinutes: 30 });
    const builds = [];
    const wizard = createWizard({ store, config, runBuild: async (p) => { builds.push(p); } });

    const start = createInteraction({ guild, kind: 'command' });
    await wizard.start(start);
    assert.equal(start.state.replies.length, 1, 'odpowiedź na /stworz');
    const session = store.get(guild.id);
    assert.ok(session, 'sesja utworzona');
    const id = (kind, name) => `wz:${session.id}:${kind}:${name}`;

    let payload = lastPayload(await dispatch(wizard, guild, id('n', 'start')));
    assert.equal(session.step, 'type');

    // „Dalej” bez wyboru typu jest blokowane
    await dispatch(wizard, guild, id('n', 'next'));
    assert.equal(session.step, 'type');

    payload = lastPayload(await dispatch(wizard, guild, id('s', 'type'), { values: [type] }));
    assert.equal(session.answers.type, type);

    for (let i = 0; i < STEPS.length; i += 1) {
      assert.equal(session.step, STEPS[i].id);
      payload = await exerciseStep(wizard, guild, payload, random);
      payload = lastPayload(await dispatch(wizard, guild, id('n', 'next')));
    }
    assert.equal(session.step, 'summary', `${type}: po ostatnim kroku jest podsumowanie`);

    // Podgląd kanałów i ról (z paginacją)
    for (const view of ['pvc', 'pvr']) {
      await dispatch(wizard, guild, id('n', view));
      for (let p = 0; p < 5; p += 1) await dispatch(wizard, guild, id('n', 'pnext'));
      await dispatch(wizard, guild, id('n', 'pprev'));
    }
    await dispatch(wizard, guild, id('n', 'ret'));
    assert.equal(session.view, null);

    // Eksport JSON
    const exp = await dispatch(wizard, guild, id('n', 'export'));
    assert.equal(exp.state.replies[0].files.length, 1);

    // Skok do kroku i z powrotem
    await dispatch(wizard, guild, id('s', 'goto'), { values: ['style'] });
    assert.equal(session.step, 'style');
    await dispatch(wizard, guild, id('n', 'sum'));
    assert.equal(session.step, 'summary');

    // Budowa (w trybie „dodaj”, żeby test nie wymagał potwierdzenia)
    session.answers.mode.type = 'append';
    const buildClick = await dispatch(wizard, guild, id('n', 'build'));
    if (session.blueprint?.errors?.length) {
      assert.equal(builds.length, 0, `${type}: blueprint z błędami nie może być budowany`);
    } else {
      assert.equal(builds.length, 1, `${type}: budowa uruchomiona – ${JSON.stringify(buildClick.state)}`);
      assert.ok(builds[0].blueprint.stats.channels > 0);
    }
    assert.equal(store.get(guild.id), null, 'sesja zamknięta po budowie');
  }
});

test('tryb czyszczenia: wymaga właściciela i poprawnej nazwy serwera', async () => {
  const guild = new FakeGuild({ name: 'Mój Serwer', ownerId: '1' });
  const store = new SessionStore();
  const builds = [];
  const wizard = createWizard({ store, config, runBuild: async (p) => { builds.push(p); } });
  await wizard.start(createInteraction({ guild, kind: 'command', userId: '1' }));
  const s = store.get(guild.id);
  const id = (kind, name) => `wz:${s.id}:${kind}:${name}`;
  await dispatch(wizard, guild, id('n', 'start'));
  await dispatch(wizard, guild, id('s', 'type'), { values: ['gaming'] });
  s.step = 'mode';
  await dispatch(wizard, guild, id('s', 'mode'), { values: ['wipe'] });
  assert.equal(s.answers.mode.type, 'wipe');
  await dispatch(wizard, guild, id('n', 'sum'));

  const click = await dispatch(wizard, guild, id('n', 'build'));
  assert.equal(click.state.modals.length, 1, 'pokazano modal potwierdzenia');
  await dispatch(wizard, guild, id('m', 'wipe'), { kind: 'modal', fields: { confirm: 'zła nazwa' } });
  assert.equal(builds.length, 0, 'zła nazwa nie uruchamia czyszczenia');
  await dispatch(wizard, guild, id('m', 'wipe'), { kind: 'modal', fields: { confirm: '  mój serwer ' } });
  assert.equal(builds.length, 1, 'poprawna nazwa uruchamia budowę');
  assert.equal(builds[0].blueprint.meta.mode, 'wipe');
});

test('osoba niebędąca właścicielem nie może wybrać czyszczenia', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  const store = new SessionStore();
  const wizard = createWizard({ store, config, runBuild: async () => {} });
  await wizard.start(createInteraction({ guild, kind: 'command', userId: '2' }));
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'mode';
  await dispatch(wizard, guild, `wz:${s.id}:s:mode`, { values: ['wipe'], userId: '2' });
  assert.equal(s.answers.mode.type, 'append');
});

test('uprawnienia i sesje: brak admina, cudzy panel, wygasła sesja', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  const store = new SessionStore();
  const wizard = createWizard({ store, config, runBuild: async () => {} });

  const noAdmin = createInteraction({ guild, kind: 'command', userId: '5', permissions: 0n });
  await wizard.start(noAdmin);
  assert.match(noAdmin.state.replies[0].embeds[0].data.title, /Brak uprawnień/);
  assert.equal(store.get(guild.id), null);

  await wizard.start(createInteraction({ guild, kind: 'command', userId: '1' }));
  const s = store.get(guild.id);
  const other = await dispatch(wizard, guild, `wz:${s.id}:n:start`, { userId: '9' });
  assert.match(other.state.replies[0].content, /innej osoby/);

  const stale = await dispatch(wizard, guild, 'wz:deadbeef:n:start');
  assert.match(stale.state.updates[0].embeds[0].data.title, /wygasła/);

  // Druga osoba (nie właściciel) nie może przejąć aktywnego kreatora
  const second = createInteraction({ guild, kind: 'command', userId: '3', permissions: PermissionsBitField.Flags.Administrator });
  await wizard.start(second);
  assert.match(second.state.replies[0].embeds[0].data.title, /zajęty/);
});

test('bot bez uprawnienia Administrator – przycisk startu jest wyłączony', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  guild.me.roles.cache.clear();
  const store = new SessionStore();
  const wizard = createWizard({ store, config, runBuild: async () => {} });
  const i = createInteraction({ guild, kind: 'command', userId: '1' });
  await wizard.start(i);
  const startButton = componentsOf(i.state.replies[0]).find((c) => c.custom_id?.endsWith(':n:start'));
  assert.equal(startButton.disabled, true);
});

test('/stworz wraca do otwartego kreatora tej samej osoby – odpowiedzi zostają, stary panel dalej działa', async () => {
  const guild = new FakeGuild({ ownerId: '1' });
  const store = new SessionStore();
  const wizard = createWizard({ store, config, runBuild: async () => {} });
  await wizard.start(createInteraction({ guild, kind: 'command' }));
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'onboarding';
  s.answers.basics.name = 'Moja Arena';

  const again = createInteraction({ guild, kind: 'command' });
  await wizard.start(again);
  assert.equal(store.get(guild.id), s, 'ta sama sesja');
  assert.equal(s.answers.basics.name, 'Moja Arena');
  const shown = again.state.replies[0].embeds[0].data;
  assert.match(shown.title, /Onboarding/);
  assert.match(shown.description, /Wróciłeś do otwartego kreatora/);

  const click = createInteraction({ guild, customId: `wz:${s.id}:s:obon`, values: ['on'] });
  await wizard.handle(click);
  assert.equal(s.answers.onboarding.enabled, true, 'przyciski starego panelu nadal działają');

  // Plik projektu zawsze otwiera nową sesję.
  const withFile = createInteraction({ guild, kind: 'command', attachment: { name: 'zdjecie.png', size: 10, url: 'x', contentType: 'image/png' } });
  await wizard.start(withFile);
  assert.match(withFile.state.edits[0].embeds[0].data.title, /Nie udało się wczytać/);
});
