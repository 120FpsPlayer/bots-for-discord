'use strict';

const crypto = require('node:crypto');
const { createAnswers } = require('./defaults');

/**
 * Przechowuje aktywne sesje kreatora – jedna sesja na serwer, żeby dwie osoby
 * nie budowały jednocześnie tego samego serwera. Sesje wygasają po czasie bezczynności
 * (chyba że właśnie trwa budowanie).
 */
class SessionStore {
  constructor({ timeoutMinutes = 30 } = {}) {
    this.timeoutMs = timeoutMinutes * 60_000;
    this.sessions = new Map();
    this.locks = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  create(guildId, userId, env = {}) {
    const session = {
      id: crypto.randomBytes(4).toString('hex'),
      guildId,
      userId,
      step: 'intro',
      answers: createAnswers('community'),
      typeChosen: false,
      view: null,
      flash: null,
      env,
      building: false,
      abort: false,
      finished: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    session.answers.basics.name = env.guildName || '';
    this.sessions.set(guildId, session);
    return session;
  }

  get(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return null;
    if (this.isExpired(session)) {
      this.sessions.delete(guildId);
      return null;
    }
    return session;
  }

  touch(session) {
    session.updatedAt = Date.now();
  }

  delete(guildId) {
    this.sessions.delete(guildId);
  }

  isExpired(session) {
    return !session.building && Date.now() - session.updatedAt > this.timeoutMs;
  }

  sweep() {
    for (const [guildId, session] of this.sessions) {
      if (this.isExpired(session)) this.sessions.delete(guildId);
    }
  }

  get size() {
    return this.sessions.size;
  }

  /**
   * Blokada serwera na czas długiej operacji (budowa, czyszczenie, przywracanie),
   * żeby /stworz i /usun nie działały jednocześnie na tym samym serwerze.
   */
  lock(guildId, reason) {
    this.locks.set(guildId, { reason, at: Date.now() });
  }

  unlock(guildId) {
    this.locks.delete(guildId);
  }

  lockedBy(guildId) {
    if (this.get(guildId)?.building) return 'budowa serwera';
    return this.locks.get(guildId)?.reason ?? null;
  }
}

module.exports = { SessionStore };
