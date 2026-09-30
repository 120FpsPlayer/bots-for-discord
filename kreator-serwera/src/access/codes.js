'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Kody dostępu do /stworz.
 * Sprzedawca generuje kody w konsoli bota (np. na Wispbyte), a kupujący wpisuje kod w /stworz.
 *  • kod ma 20 znaków (bez mylących 0/O, 1/I), wyświetlany jako ABCDE-FGHJK-LMNPQ-RSTUV,
 *  • po wpisaniu kod przypisuje się do serwera – kolejne /stworz na tym serwerze nie pytają o kod,
 *  • każda budowa zużywa jedno użycie (zwykle kod = 1 budowa); nieudana lub cofnięta budowa oddaje użycie,
 *  • kody są zapisywane w pliku data/kody.json (przetrwają restart bota).
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 20;
const MAX_USES = 100;
const MAX_BATCH = 50;
const NOTE_MAX = 100;

class CodeStoreError extends Error {}

/** ABCDE-FGHJK-… → ABCDEFGHJK… (wielkość liter, spacje i myślniki nie mają znaczenia). */
function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
}

function isWellFormed(code) {
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

function formatCode(code) {
  return code.match(/.{1,5}/g).join('-');
}

/** Skrócony zapis do pokazania na Discordzie: ABCDE-…-RSTUV. */
function maskCode(code) {
  return `${code.slice(0, 5)}-…-${code.slice(-5)}`;
}

function randomCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

class CodeStore {
  constructor({ file, now = () => Date.now() } = {}) {
    this.file = file;
    this.now = now;
  }

  // ───────────── plik ─────────────

  load() {
    if (!fs.existsSync(this.file)) return { version: 1, codes: {}, guilds: {} };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      // Nie nadpisujemy uszkodzonego pliku – sprzedane kody mogłyby przepaść.
      throw new CodeStoreError(`Plik kodów ${this.file} jest uszkodzony (${err.message}). Napraw go albo przywróć kopię – do tego czasu /stworz jest zablokowane.`);
    }
    return { version: 1, codes: data?.codes || {}, guilds: data?.guilds || {} };
  }

  save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file); // zapis atomowy – przerwany zapis nie psuje pliku
  }

  // ───────────── sprzedawca (konsola) ─────────────

  /**
   * @param {object} o
   * @param {number} [o.count]    ile kodów
   * @param {number} [o.uses]     ile budów na kod
   * @param {string} [o.note]     notatka sprzedawcy
   * @param {string} [o.pkg]      pakiet: basic | standard | premium (brak = premium)
   * @param {string} [o.template] ID szablonu, który kod otwiera
   * @param {number} [o.days]     ważność w dniach (brak = bez terminu)
   */
  generate({ count = 1, uses = 1, note = '', pkg = null, template = null, days = null } = {}) {
    const n = Math.min(MAX_BATCH, Math.max(1, Math.floor(count)));
    const u = Math.min(MAX_USES, Math.max(1, Math.floor(uses)));
    const data = this.load();
    const created = [];
    while (created.length < n) {
      const code = randomCode();
      if (data.codes[code]) continue;
      data.codes[code] = {
        code,
        uses: u,
        used: 0,
        note: String(note || '').trim().slice(0, NOTE_MAX),
        package: pkg || null,
        template: template || null,
        expiresAt: days ? new Date(this.now() + days * 86_400_000).toISOString() : null,
        createdAt: new Date(this.now()).toISOString(),
        revokedAt: null,
        builds: [],
      };
      created.push(data.codes[code]);
    }
    this.save(data);
    return created;
  }

  list() {
    const data = this.load();
    const bound = {};
    for (const [guildId, code] of Object.entries(data.guilds)) (bound[code] ||= []).push(guildId);
    return Object.values(data.codes)
      .map((r) => ({ ...r, boundGuilds: bound[r.code] || [], status: this.statusOf(r), remaining: Math.max(0, r.uses - r.used) }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  find(input) {
    const code = normalizeCode(input);
    const data = this.load();
    const r = data.codes[code];
    if (!r) return null;
    const boundGuilds = Object.entries(data.guilds).filter(([, c]) => c === code).map(([g]) => g);
    return { ...r, boundGuilds, status: this.statusOf(r), remaining: Math.max(0, r.uses - r.used) };
  }

  isExpired(r) {
    return Boolean(r.expiresAt) && Date.parse(r.expiresAt) <= this.now();
  }

  statusOf(r) {
    if (r.revokedAt) return 'anulowany';
    if (r.used >= r.uses) return 'zużyty';
    if (this.isExpired(r)) return 'wygasły';
    if (r.used > 0) return 'częściowo użyty';
    return 'nowy';
  }

  /** Anuluje kod – przestaje działać także na serwerze, do którego był przypisany. */
  revoke(input) {
    const data = this.load();
    const r = data.codes[normalizeCode(input)];
    if (!r) return null;
    r.revokedAt = new Date(this.now()).toISOString();
    for (const [guildId, code] of Object.entries(data.guilds)) if (code === r.code) delete data.guilds[guildId];
    this.save(data);
    return r;
  }

  /** Ustawia ważność kodu: liczba dni od teraz albo null = bez terminu. */
  setExpiry(input, days) {
    const data = this.load();
    const r = data.codes[normalizeCode(input)];
    if (!r) return null;
    r.expiresAt = days ? new Date(this.now() + days * 86_400_000).toISOString() : null;
    this.save(data);
    return r;
  }

  /** Dodaje użycia (np. klient kupił kolejną budowę). */
  addUses(input, n = 1) {
    const data = this.load();
    const r = data.codes[normalizeCode(input)];
    if (!r) return null;
    r.uses = Math.min(MAX_USES, r.uses + Math.max(1, Math.floor(n)));
    r.revokedAt = null;
    this.save(data);
    return r;
  }

  // ───────────── kupujący (/stworz) ─────────────

  /** Aktywny kod przypisany do serwera (albo null). */
  grantFor(guildId) {
    const data = this.load();
    const r = data.codes[data.guilds[guildId]];
    if (!r || r.revokedAt || r.used >= r.uses || this.isExpired(r)) return null;
    return {
      code: r.code, remaining: r.uses - r.used, uses: r.uses, note: r.note,
      package: r.package || null, template: r.template || null, expiresAt: r.expiresAt || null,
    };
  }

  /** Sprawdza kod wpisany przez kupującego i przypisuje go do serwera. */
  redeem(input, { guildId, guildName = '', userId = '' }) {
    const code = normalizeCode(input);
    if (!isWellFormed(code)) {
      return { ok: false, reason: 'format', error: `Kod ma ${CODE_LENGTH} znaków (litery i cyfry), np. ABCDE-FGHJK-LMNPQ-RSTUV. Sprawdź, czy skopiowałeś go w całości.` };
    }
    const data = this.load();
    const r = data.codes[code];
    if (!r) return { ok: false, reason: 'unknown', error: 'Nie ma takiego kodu. Sprawdź, czy nie ma literówki.' };
    if (r.revokedAt) return { ok: false, reason: 'revoked', error: 'Ten kod został anulowany przez sprzedawcę.' };
    if (r.used >= r.uses) return { ok: false, reason: 'used', error: 'Ten kod został już wykorzystany.' };
    if (this.isExpired(r)) {
      return { ok: false, reason: 'expired', error: `Ten kod wygasł ${new Date(r.expiresAt).toLocaleDateString('pl-PL')}. Poproś sprzedawcę o nowy.` };
    }
    data.guilds[guildId] = code;
    r.lastRedeem = { guildId, guildName: String(guildName).slice(0, 100), userId, at: new Date(this.now()).toISOString() };
    this.save(data);
    return { ok: true, code, remaining: r.uses - r.used, uses: r.uses, package: r.package || null, template: r.template || null, note: r.note };
  }

  /** Zużywa jedno użycie kodu serwera przy starcie budowy. Zwraca „bilet” potrzebny do ewentualnego zwrotu. */
  consume(guildId, { guildName = '', userId = '', kind = 'budowa' } = {}) {
    const data = this.load();
    const code = data.guilds[guildId];
    const r = data.codes[code];
    if (!r || r.revokedAt) return { ok: false, error: 'Kod dostępu dla tego serwera jest nieaktywny (anulowany lub usunięty). Wpisz /stworz, aby podać nowy kod.' };
    if (r.used >= r.uses) return { ok: false, error: 'Kod dostępu tego serwera został już wykorzystany. Wpisz /stworz, aby podać nowy kod.' };
    if (this.isExpired(r)) return { ok: false, error: `Kod dostępu tego serwera wygasł ${new Date(r.expiresAt).toLocaleDateString('pl-PL')}. Poproś sprzedawcę o nowy.` };
    const buildId = crypto.randomBytes(4).toString('hex');
    r.used += 1;
    r.builds.push({ id: buildId, guildId, guildName: String(guildName).slice(0, 100), userId, kind, template: r.template || null, at: new Date(this.now()).toISOString(), refunded: false });
    if (r.used >= r.uses) delete data.guilds[guildId];
    this.save(data);
    return { ok: true, code, buildId, guildId, remaining: r.uses - r.used, uses: r.uses, package: r.package || null, template: r.template || null };
  }

  /** Oddaje użycie (budowa nieudana albo cofnięta) i z powrotem przypisuje kod do serwera. */
  refund(ticket) {
    if (!ticket?.code) return false;
    const data = this.load();
    const r = data.codes[ticket.code];
    const build = r?.builds.find((b) => b.id === ticket.buildId);
    if (!r || !build || build.refunded) return false;
    build.refunded = true;
    r.used = Math.max(0, r.used - 1);
    if (!r.revokedAt) data.guilds[ticket.guildId] = r.code;
    this.save(data);
    return true;
  }
}

/**
 * Ochrona przed zgadywaniem kodów: po 5 błędnych próbach w ciągu 15 minut
 * użytkownik musi odczekać 15 minut.
 */
class AttemptLimiter {
  constructor({ max = 5, windowMs = 15 * 60_000, now = () => Date.now() } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.fails = new Map();
  }

  recent(key) {
    const since = this.now() - this.windowMs;
    const list = (this.fails.get(key) || []).filter((t) => t > since);
    if (list.length) this.fails.set(key, list);
    else this.fails.delete(key);
    return list;
  }

  /** Ile minut trzeba jeszcze czekać (0 = można próbować). */
  blockedFor(key) {
    const list = this.recent(key);
    if (list.length < this.max) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - this.now()) / 60_000));
  }

  fail(key) {
    const list = this.recent(key);
    list.push(this.now());
    this.fails.set(key, list);
    return Math.max(0, this.max - list.length);
  }

  reset(key) {
    this.fails.delete(key);
  }
}

module.exports = {
  CodeStore, CodeStoreError, AttemptLimiter, normalizeCode, formatCode, maskCode, isWellFormed, ALPHABET, CODE_LENGTH, MAX_USES, MAX_BATCH,
};
