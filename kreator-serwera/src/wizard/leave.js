'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('../utils/logger');

const log = createLogger('wyjście');

/**
 * Zaplanowane wyjścia bota z serwerów („bot wychodzi po budowie”).
 * Plan jest zapisywany w pliku (data/wyjscia.json), więc przetrwa restart bota.
 * Jeśli na serwerze akurat trwa kreator lub czyszczenie, wyjście jest przesuwane o 10 minut.
 */
class LeaveScheduler {
  constructor({ file, client = null, store = null, onLeave = null }) {
    this.file = file;
    this.client = client;
    this.store = store;
    this.onLeave = onLeave;
    this.timers = new Map();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  schedule(guildId, at, meta = {}) {
    const data = this.load();
    data[guildId] = { at, ...meta };
    this.save(data);
    this.arm(guildId, at);
    log.info(`Bot opuści serwer ${meta.guildName || guildId} ${new Date(at).toLocaleString('pl-PL')}.`);
  }

  cancel(guildId) {
    clearTimeout(this.timers.get(guildId));
    this.timers.delete(guildId);
    const data = this.load();
    if (!data[guildId]) return false;
    delete data[guildId];
    this.save(data);
    return true;
  }

  list() {
    return Object.entries(this.load()).map(([guildId, v]) => ({ guildId, ...v })).sort((a, b) => a.at - b.at);
  }

  get(guildId) {
    return this.load()[guildId] || null;
  }

  arm(guildId, at) {
    clearTimeout(this.timers.get(guildId));
    const timer = setTimeout(() => this.run(guildId).catch((err) => log.error('Wyjście z serwera nieudane:', err)), Math.max(1000, at - Date.now()));
    timer.unref?.();
    this.timers.set(guildId, timer);
  }

  /** Po starcie bota: wznawia zaplanowane wyjścia (zaległe wykonuje po 30 s). */
  restore() {
    for (const { guildId, at } of this.list()) this.arm(guildId, Math.max(at, Date.now() + 30_000));
  }

  async run(guildId) {
    const entry = this.get(guildId);
    if (!entry) return false;
    const busy = this.store?.lockedBy(guildId) || (this.store?.get(guildId) ? 'otwarty kreator' : null);
    if (busy) {
      log.info(`Wyjście z ${entry.guildName || guildId} przesunięte o 10 min (${busy}).`);
      this.schedule(guildId, Date.now() + 10 * 60_000, entry);
      return false;
    }
    this.cancel(guildId);
    const guild = this.client?.guilds?.cache?.get(guildId);
    if (!guild) return false;
    await guild.leave();
    log.info(`Bot opuścił serwer ${guild.name} (${guildId}) – zgodnie z ustawieniem po budowie.`);
    await this.onLeave?.(guild, entry);
    return true;
  }
}

module.exports = { LeaveScheduler };
