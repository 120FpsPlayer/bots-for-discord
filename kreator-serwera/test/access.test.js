'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CodeStore, CodeStoreError, AttemptLimiter, normalizeCode, formatCode, isWellFormed, ALPHABET, CODE_LENGTH,
} = require('../src/access/codes');
const { runCommand } = require('../src/access/console');
const { SessionStore } = require('../src/wizard/sessions');
const { createWizard } = require('../src/wizard/router');
const { runBuild } = require('../src/wizard/build');
const { handleUndo } = require('../src/wizard/undo');
const { createAnswers } = require('../src/wizard/defaults');
const { FakeGuild } = require('./helpers/fakeDiscord');
const { createInteraction, componentsOf } = require('./helpers/fakeInteraction');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kody-'));
  return new CodeStore({ file: path.join(dir, 'data', 'kody.json') });
}

// ───────────── Magazyn kodów ─────────────

test('kody: 20 znaków bez mylących znaków, unikalne, zapisane w pliku', () => {
  const codes = tempStore();
  const list = codes.generate({ count: 50 });
  assert.equal(list.length, 50);
  assert.equal(new Set(list.map((r) => r.code)).size, 50);
  for (const { code } of list) {
    assert.equal(code.length, CODE_LENGTH);
    assert.ok(isWellFormed(code));
    assert.ok(![...code].some((c) => '01OI'.includes(c)), `mylący znak w ${code}`);
  }
  assert.equal(ALPHABET.length, 32);
  assert.match(formatCode(list[0].code), /^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  // Nowa instancja (np. po restarcie bota) widzi te same kody.
  const again = new CodeStore({ file: codes.file });
  assert.equal(again.list().length, 50);
  assert.ok(fs.existsSync(codes.file) && !fs.existsSync(`${codes.file}.tmp`));
  assert.equal(normalizeCode(' abcde-fghjk lmnpq_rstuv '), 'ABCDEFGHJKLMNPQRSTUV');
});

test('kody: przypisanie do serwera, zużycie przy budowie, zwrot, anulowanie, dodawanie budów', () => {
  const codes = tempStore();
  const [r] = codes.generate({ note: 'Zamówienie #7' });
  assert.equal(codes.redeem('ZLY', { guildId: 'g1' }).reason, 'format');
  assert.equal(codes.redeem('ABCDE-FGHJK-LMNPQ-RSTUV', { guildId: 'g1' }).reason, 'unknown');
  assert.equal(codes.grantFor('g1'), null);

  const ok = codes.redeem(formatCode(r.code).toLowerCase(), { guildId: 'g1', guildName: 'Serwer', userId: 'u1' });
  assert.equal(ok.ok, true);
  assert.deepEqual(codes.grantFor('g1'), { code: r.code, remaining: 1, uses: 1, note: 'Zamówienie #7', package: null, template: null, expiresAt: null });

  const ticket = codes.consume('g1', { guildName: 'Serwer', userId: 'u1' });
  assert.equal(ticket.ok, true);
  assert.equal(ticket.remaining, 0);
  assert.equal(codes.grantFor('g1'), null, 'wykorzystany kod nie działa dalej');
  assert.equal(codes.consume('g1').ok, false, 'druga budowa na tym samym kodzie jest zablokowana');
  assert.equal(codes.redeem(r.code, { guildId: 'g2' }).reason, 'used', 'zużytego kodu nie da się wpisać na innym serwerze');
  assert.equal(codes.find(r.code).status, 'zużyty');

  assert.equal(codes.refund(ticket), true);
  assert.equal(codes.refund(ticket), false, 'podwójny zwrot nic nie daje');
  assert.equal(codes.grantFor('g1').remaining, 1, 'po zwrocie kod znów działa na tym serwerze');
  assert.ok(codes.find(r.code).builds[0].refunded);

  codes.revoke(r.code);
  assert.equal(codes.grantFor('g1'), null, 'anulowany kod przestaje działać także na przypisanym serwerze');
  assert.equal(codes.redeem(r.code, { guildId: 'g1' }).reason, 'revoked');
  codes.addUses(r.code, 2);
  assert.equal(codes.find(r.code).remaining, 3);
  assert.equal(codes.redeem(r.code, { guildId: 'g1' }).ok, true, 'dodanie budów przywraca kod');
});

test('kody: uszkodzony plik nie jest nadpisywany (sprzedane kody nie przepadną)', () => {
  const codes = tempStore();
  codes.generate();
  fs.writeFileSync(codes.file, '{ to nie jest json');
  assert.throws(() => codes.grantFor('g1'), CodeStoreError);
  assert.throws(() => codes.generate(), CodeStoreError);
  assert.equal(fs.readFileSync(codes.file, 'utf8'), '{ to nie jest json');
});

test('limit prób: 5 błędnych w 15 min blokuje, po czasie odblokowuje', () => {
  let now = 1_000_000;
  const limiter = new AttemptLimiter({ now: () => now });
  for (let i = 4; i >= 0; i -= 1) assert.equal(limiter.fail('u'), i);
  assert.equal(limiter.blockedFor('u'), 15);
  now += 10 * 60_000;
  assert.equal(limiter.blockedFor('u'), 5);
  now += 5 * 60_000 + 1;
  assert.equal(limiter.blockedFor('u'), 0);
});

// ───────────── Konsola ─────────────

test('konsola: kod, kody, info, anuluj, dodaj, serwery, wyjdź, stop, pomoc', async () => {
  const codes = tempStore();
  const left = [];
  const client = {
    user: { tag: 'Kreator#0001' },
    guilds: { cache: new Map([['111', { id: '111', name: 'Serwer Klienta', memberCount: 12, leave: async () => left.push('111') }]]) },
  };
  const run = (line) => runCommand(line, { codes, client, store: new SessionStore() });

  const one = await run('kod');
  const shown = one.lines.join('\n').match(/[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}/g);
  assert.equal(shown.length, 1);
  assert.equal(codes.find(shown[0]).uses, 1);

  const many = await run('kod 3 2 Jan Kowalski #12');
  assert.equal(many.lines.join('\n').match(/[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}/g).length, 3);
  const last = codes.list().at(-1);
  assert.equal(last.uses, 2);
  assert.equal(last.note, 'Jan Kowalski #12');

  await run('kod Anna 5');
  assert.equal(codes.list().at(-1).note, 'Anna 5', 'liczby po notatce należą do notatki');
  assert.equal(codes.list().at(-1).uses, 1);
  assert.match((await run('kod 0')).lines[0], /1–50/);
  assert.match((await run('kod 1 999')).lines[0], /1–100/);

  codes.redeem(shown[0], { guildId: '111', guildName: 'Serwer Klienta', userId: '9' });
  assert.match((await run('kody')).lines.join('\n'), new RegExp(`${shown[0]}.*serwer 111`));
  assert.match((await run(`info ${shown[0].toLowerCase()}`)).lines.join('\n'), /Wpisany:.*Serwer Klienta/);
  assert.match((await run('serwery')).lines.join('\n'), /Serwer Klienta.*pozostało 1/);

  assert.match((await run(`anuluj ${shown[0]}`)).lines[0], /anulowany/);
  assert.ok(!(await run('kody')).lines.join('\n').includes(shown[0]), 'anulowany kod znika z listy aktywnych');
  assert.ok((await run('kody wszystkie')).lines.join('\n').includes(shown[0]));
  assert.match((await run(`dodaj ${shown[0]} 2`)).lines[0], /0\/3/);
  assert.match((await run('info XXXXX')).lines[0], /Nie znaleziono/);

  assert.match((await run('wyjdź 111')).lines[0], /opuścił/);
  assert.deepEqual(left, ['111']);
  assert.match((await run('status')).lines.join('\n'), /Kreator#0001/);
  assert.ok((await run('pomoc')).lines.length > 5);
  assert.match((await run('cokolwiek')).lines[0], /pomoc/);
  assert.equal((await run('stop')).stop, true);
  assert.deepEqual((await run('   ')).lines, []);
});

// ───────────── /stworz z kodem ─────────────

function setup({ build } = {}) {
  const codes = tempStore();
  const store = new SessionStore({ timeoutMinutes: 30 });
  const builds = [];
  const stubBuild = async (p) => {
    builds.push(p);
    return { ids: { roles: ['1'], categories: [], channels: [], automod: [] } };
  };
  const wizard = createWizard({ store, config: { sessionTimeoutMinutes: 30, ownerOnly: false, requireCode: true }, runBuild: build || stubBuild, codes });
  return { codes, store, wizard, builds };
}

const codeButton = (payload) => componentsOf(payload).find((c) => c.custom_id === 'wzk:enter');

async function goToSummaryAndBuild(wizard, store, guild) {
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'summary';
  const b = createInteraction({ guild, userId: '1', customId: `wz:${s.id}:n:build` });
  await wizard.handle(b);
  return b;
}

test('/stworz bez kodu: ekran kodu → zły kod → dobry kod → kreator; budowa zużywa kod', async () => {
  const { codes, store, wizard, builds } = setup();
  const guild = new FakeGuild({ name: 'Klient', ownerId: '1' });
  const [{ code }] = codes.generate();

  const cmd = createInteraction({ guild, userId: '1', kind: 'command' });
  await wizard.start(cmd);
  const prompt = cmd.state.replies[0];
  assert.match(prompt.embeds[0].data.title, /Wymagany kod dostępu/);
  assert.ok(codeButton(prompt));
  assert.equal(store.get(guild.id), null, 'bez kodu kreator się nie otwiera');

  const enter = createInteraction({ guild, userId: '1', customId: 'wzk:enter' });
  await wizard.handleCode(enter);
  assert.equal(enter.state.modals[0].custom_id, 'wzk:submit');

  const wrong = createInteraction({ guild, userId: '1', customId: 'wzk:submit', kind: 'modal', fields: { code: 'ABCDE-FGHJK-LMNPQ-RSTUV' } });
  await wizard.handleCode(wrong);
  assert.equal(wrong.state.order[0], 'deferred', 'formularz kodu jest potwierdzany od razu');
  assert.match(wrong.state.edits[0].embeds[0].data.description, /Nie ma takiego kodu/);

  const right = createInteraction({ guild, userId: '1', customId: 'wzk:submit', kind: 'modal', fields: { code: formatCode(code).toLowerCase() } });
  await wizard.handleCode(right);
  assert.deepEqual(right.state.order, ['deferred', 'edits'], 'najpierw potwierdzenie, potem kreator w miejscu ekranu kodu');
  const intro = right.state.edits[0].embeds[0].data;
  assert.match(intro.title, /Witaj w Kreatorze/);
  assert.ok(intro.fields.some((f) => f.value.includes('Kod dostępu') && f.value.includes('pozostało budów: **1**')));

  // Drugi raz /stworz na tym serwerze nie pyta o kod (jest przypisany).
  const again = createInteraction({ guild, userId: '1', kind: 'command' });
  await wizard.start(again);
  assert.match(again.state.replies[0].embeds[0].data.title, /Witaj/);

  // Podsumowanie informuje o zużyciu kodu; budowa go zużywa.
  const s = store.get(guild.id);
  s.typeChosen = true;
  s.step = 'summary';
  assert.match(wizard.render(s).embeds[0].data.description, /zużyje 1 użycie kodu/);
  await goToSummaryAndBuild(wizard, store, guild);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].session.ticket.code, code);
  assert.equal(codes.find(code).used, 1);

  const after = createInteraction({ guild, userId: '1', kind: 'command' });
  await wizard.start(after);
  assert.match(after.state.replies[0].embeds[0].data.title, /Wymagany kod/, 'po budowie potrzebny jest nowy kod');
});

test('/stworz kod:<kod> otwiera kreator od razu; zużyty kod na innym serwerze jest odrzucany', async () => {
  const { codes, wizard, store } = setup();
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } });
  await wizard.start(cmd);
  assert.match(cmd.state.replies[0].embeds[0].data.title, /Witaj/);
  await goToSummaryAndBuild(wizard, store, guild);

  const other = new FakeGuild({ name: 'B', ownerId: '1' });
  const reuse = createInteraction({ guild: other, userId: '1', kind: 'command', stringOptions: { kod: code } });
  await wizard.start(reuse);
  assert.match(reuse.state.replies[0].embeds[0].data.description, /już wykorzystany/);
});

test('budowa, która nic nie utworzyła, oddaje użycie kodu', async () => {
  const { codes, wizard, store } = setup({ build: async () => ({ fatal: 'Brak uprawnień', ids: { roles: [], categories: [], channels: [], automod: [] } }) });
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } }));
  await goToSummaryAndBuild(wizard, store, guild);
  assert.equal(codes.find(code).used, 0);
  assert.equal(codes.grantFor(guild.id).remaining, 1);
});

test('anulowany w trakcie sesji kod blokuje budowę z podpowiedzią', async () => {
  const { codes, wizard, store, builds } = setup();
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } }));
  codes.revoke(code);
  const b = await goToSummaryAndBuild(wizard, store, guild);
  assert.equal(builds.length, 0);
  assert.match(b.state.updates[0].embeds[0].data.description, /nieaktywny.*Zapisz projekt/s);
});

test('konsola: „test” mierzy łącze z Discordem, procesor i opóźnienia kliknięć', async () => {
  const codes = tempStore();
  const slow = { ws: { ping: 480 }, rest: { get: () => new Promise((resolve) => { setTimeout(resolve, 5); }) } };
  const res = await runCommand('test', { codes, client: slow, store: null, stats: { lags: [300, 2500, 1800] } });
  const text = res.lines.join('\n');
  assert.match(text, /Ping do Discorda: 480 ms/);
  assert.match(text, /Odpowiedź API Discorda: \d+ ms/);
  assert.match(text, /Rysowanie baneru: \d+ ms/);
  assert.match(text, /średnio 1533 ms, najdłużej 2500 ms \(ostatnie 3\)/);
  assert.match(res.lines.at(-1), /🐢 Wniosek: łącze hostingu z Discordem ma duże opóźnienie; kliknięcia długo docierają/);

  const fast = await runCommand('ping', { codes, client: { ws: { ping: 40 }, rest: { get: async () => ({}) } }, store: null, stats: { lags: [120, 90] } });
  assert.doesNotMatch(fast.lines.at(-1), /łącze|API|kliknięcia/, 'szybkie łącze nie jest wskazywane jako problem');
  const offline = await runCommand('test', { codes, client: { ws: { ping: -1 }, rest: { get: async () => { throw new Error('ECONNRESET'); } } }, store: null });
  assert.match(offline.lines.join('\n'), /brak połączenia[\s\S]*brak pomiarów/);
});

test('formularz kodu, gdy serwer jest zajęty: potwierdzony od razu, powód w osobnej wiadomości', async () => {
  const { wizard, store, codes } = setup();
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  store.lock(guild.id, 'czyszczenie serwera');
  const i = createInteraction({ guild, userId: '1', customId: 'wzk:submit', kind: 'modal', fields: { code } });
  await wizard.handleCode(i);
  assert.deepEqual(i.state.order, ['deferred', 'replies']);
  assert.match(i.state.replies[0].embeds[0].data.title, /zajęty/);
  assert.equal(codes.grantFor(guild.id), null, 'kod nie został przypisany');
});

test('za dużo błędnych kodów blokuje wpisywanie na 15 minut', async () => {
  const { wizard } = setup();
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = createInteraction({ guild, userId: '7', customId: 'wzk:submit', kind: 'modal', fields: { code: `ABCDE-FGHJK-LMNPQ-RSTU${'VWXYZ'[i]}` } });
    await wizard.handleCode(last);
  }
  assert.match(last.state.edits[0].embeds[0].data.description, /Za dużo błędnych prób/);
  assert.equal(codeButton(last.state.edits[0]).disabled, true);
  const enter = createInteraction({ guild, userId: '7', customId: 'wzk:enter' });
  await wizard.handleCode(enter);
  assert.equal(enter.state.modals.length, 0, 'formularz kodu jest zablokowany');
});

test('plik projektu z /stworz czeka na kod i wczytuje się po jego wpisaniu', async (t) => {
  const { codes, wizard } = setup();
  const [{ code }] = codes.generate();
  const project = JSON.stringify({ answers: createAnswers('minecraft') });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => project });
  t.after(() => { global.fetch = originalFetch; });
  const guild = new FakeGuild({ name: 'A', ownerId: '1' });
  const attachment = { name: 'projekt.json', size: project.length, url: 'https://cdn.discordapp.com/x/p.json', contentType: 'application/json' };
  const cmd = createInteraction({ guild, userId: '1', kind: 'command', attachment });
  await wizard.start(cmd);
  assert.match(cmd.state.replies[0].embeds[0].data.title, /Wymagany kod/);
  const submit = createInteraction({ guild, userId: '1', customId: 'wzk:submit', kind: 'modal', fields: { code } });
  await wizard.handleCode(submit);
  assert.match(submit.state.edits.at(-1).embeds[0].data.title, /Podsumowanie/);
  assert.match(submit.state.edits.at(-1).embeds[0].data.description, /Wczytano projekt/);
});

test('„Cofnij budowę” oddaje użycie kodu (prawdziwa budowa na atrapie Discorda)', async () => {
  const { codes, wizard, store } = setup({ build: runBuild });
  const [{ code }] = codes.generate();
  const guild = new FakeGuild({ name: 'Klient', ownerId: '1' });
  await wizard.start(createInteraction({ guild, userId: '1', kind: 'command', stringOptions: { kod: code } }));
  const b = await goToSummaryAndBuild(wizard, store, guild);
  const done = b.state.edits.at(-1);
  assert.match(done.embeds[0].data.title, /Serwer gotowy/);
  assert.match(done.embeds[0].data.footer.text, /pozostało budów 0\/1/);
  assert.equal(codes.find(code).used, 1);

  const undoBtn = componentsOf(done).find((c) => c.custom_id?.startsWith('wzu:ask:'));
  const yes = createInteraction({ guild, userId: '1', customId: undoBtn.custom_id.replace('ask', 'yes') });
  await handleUndo(yes, store, codes);
  assert.match(yes.state.edits.at(-1).embeds[0].data.description, /użycie kodu dostępu wróciło/);
  assert.equal(codes.find(code).used, 0);
  assert.equal(codes.grantFor(guild.id).remaining, 1);
});

test('REQUIRE_CODE=false – /stworz działa bez kodu', async () => {
  const store = new SessionStore({ timeoutMinutes: 30 });
  const wizard = createWizard({ store, config: { sessionTimeoutMinutes: 30, ownerOnly: false, requireCode: false }, runBuild: async () => {}, codes: tempStore() });
  const cmd = createInteraction({ guild: new FakeGuild({ ownerId: '1' }), userId: '1', kind: 'command' });
  await wizard.start(cmd);
  assert.match(cmd.state.replies[0].embeds[0].data.title, /Witaj/);
});
