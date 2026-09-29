'use strict';

const { ChannelType } = require('discord.js');
const { toBits, MEMBER_CORE, MEMBER_TOGGLES } = require('../builder/permissions');
const { describeError } = require('../builder/executor');
const { createLogger } = require('../utils/logger');

const log = createLogger('czyszczenie');

/**
 * Silnik komendy /usun – usuwa wybrane elementy serwera.
 * Każda operacja jest izolowana (błąd jednej nie przerywa reszty), a kolejność jest dobrana tak,
 * żeby Discord na nic nie protestował: najpierw wyłączamy tryb Społeczności (inaczej nie da się
 * usunąć kanału regulaminu), potem AutoMod i wydarzenia, kanały, role, emoji, zaproszenia, bany.
 * NIGDY nie usuwamy członków, wiadomości prywatnych ani samego serwera.
 */

const TARGETS = {
  channels: { emoji: '💬', label: 'Kanały i kategorie', description: 'Wszystkie kanały, fora i kategorie (z wiadomościami)' },
  roles: { emoji: '🎭', label: 'Role', description: 'Role poniżej roli bota (bez ról botów i integracji)' },
  automod: { emoji: '🤖', label: 'Reguły AutoMod', description: 'Wszystkie reguły automatycznej moderacji' },
  events: { emoji: '📅', label: 'Wydarzenia', description: 'Zaplanowane wydarzenia serwera' },
  emojis: { emoji: '😀', label: 'Emoji i naklejki', description: 'Własne emoji i naklejki serwera' },
  invites: { emoji: '🔗', label: 'Zaproszenia', description: 'Wszystkie linki zaproszeń (stare linki przestaną działać)' },
  settings: { emoji: '⚙️', label: 'Ustawienia serwera', description: 'Weryfikacja, filtr, powiadomienia, Społeczność → domyślne' },
  bans: { emoji: '🔓', label: 'Bany (odbanuj wszystkich)', description: 'Zdejmuje wszystkie bany – ostrożnie!' },
};

const DEFAULT_TARGETS = ['channels', 'roles', 'automod', 'events'];

/** Domyślne uprawnienia @everyone na świeżym serwerze Discord. */
const DEFAULT_EVERYONE = [
  ...MEMBER_CORE,
  ...Object.entries(MEMBER_TOGGLES).filter(([k]) => !['events', 'expressions'].includes(k)).flatMap(([, t]) => t.perms),
];

const MAX_UNBANS = 1000;

async function performCleanup(guild, { targets, fresh = true, keepChannelIds = [], invokerId, onProgress = () => {}, shouldAbort = () => false }) {
  const started = Date.now();
  const reason = `Czyszczenie serwera (/usun) – uruchomił ${invokerId}`;
  const what = new Set(targets);
  const R = {
    deleted: { channels: 0, categories: 0, roles: 0, automod: 0, events: 0, emojis: 0, stickers: 0, invites: 0, unbanned: 0 },
    created: { channels: 0 },
    warnings: [],
    errors: [],
    phases: [],
    aborted: false,
    communityDisabled: false,
    freshChannelId: null,
  };

  let done = 0;
  let total = 1;
  let phase = 'Przygotowanie';
  let label = '';
  const emit = () => onProgress({ done, total, phase, label, phases: R.phases.slice(), elapsed: Date.now() - started });
  const tick = (text) => { done += 1; if (text) label = text; emit(); };
  const startPhase = (name) => {
    if (phase !== 'Przygotowanie') R.phases.push(phase);
    phase = name;
    label = '';
    emit();
  };
  const checkAbort = () => {
    if (shouldAbort()) {
      const err = new Error('aborted');
      err.aborted = true;
      throw err;
    }
  };
  const attempt = async (what2, fn, { quietCodes = [10003, 10011, 10014, 10070, 10026] } = {}) => {
    checkAbort();
    try {
      const out = await fn();
      return out === undefined ? true : out;
    } catch (err) {
      if (err?.aborted) throw err;
      if (!quietCodes.includes(err?.code)) {
        R.warnings.push(`${what2}: ${describeError(err)}`);
        log.warn(`${what2}: ${err?.message}`);
      }
      return null;
    }
  };

  try {
    emit();
    await guild.fetch().catch(() => {});
    await guild.channels.fetch().catch(() => {});
    await guild.roles.fetch().catch(() => {});

    const keep = new Set(keepChannelIds.filter(Boolean));
    const channels = what.has('channels') ? [...guild.channels.cache.values()].filter((c) => !c.isThread?.() && !keep.has(c.id)) : [];
    const roles = what.has('roles') ? [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed && r.editable).sort((a, b) => a.position - b.position) : [];
    const rules = what.has('automod') ? [...((await guild.autoModerationRules.fetch().catch(() => null))?.values() || [])] : [];
    const events = what.has('events') ? [...((await guild.scheduledEvents?.fetch().catch(() => null))?.values() || [])] : [];
    const emojis = what.has('emojis') ? [...((await guild.emojis?.fetch().catch(() => null))?.values() || [])].filter((e) => !e.managed) : [];
    const stickers = what.has('emojis') ? [...((await guild.stickers?.fetch().catch(() => null))?.values() || [])] : [];
    let bans = [];
    if (what.has('bans')) {
      const fetched = await guild.bans?.fetch({ limit: MAX_UNBANS }).catch(() => null);
      bans = [...(fetched?.values() || [])];
      if (bans.length >= MAX_UNBANS) R.warnings.push(`Zdjęto pierwsze ${MAX_UNBANS} banów – uruchom /usun ponownie, aby zdjąć kolejne.`);
    }
    total = channels.length + roles.length + rules.length + events.length + emojis.length + stickers.length + bans.length + 6;

    // 1. Tryb Społeczności blokuje usunięcie kanału regulaminu i ogłoszeń dla moderatorów.
    if (guild.features?.includes('COMMUNITY') && (what.has('channels') || what.has('settings'))) {
      startPhase('Wyłączanie trybu Społeczności');
      const ok = await attempt('Wyłączanie trybu Społeczności', () => guild.edit({ features: guild.features.filter((f) => f !== 'COMMUNITY'), reason }));
      R.communityDisabled = ok !== null && !guild.features.includes('COMMUNITY');
      tick('Tryb Społeczności');
    } else {
      tick();
    }

    if (rules.length) {
      startPhase('Usuwanie reguł AutoMod');
      for (const rule of rules) {
        if (await attempt(`AutoMod „${rule.name}”`, () => rule.delete(reason)) !== null) R.deleted.automod += 1;
        tick(rule.name);
      }
    }

    if (events.length) {
      startPhase('Usuwanie wydarzeń');
      for (const event of events) {
        if (await attempt(`Wydarzenie „${event.name}”`, () => event.delete()) !== null) R.deleted.events += 1;
        tick(event.name);
      }
    }

    if (channels.length) {
      startPhase('Usuwanie kanałów');
      const ordered = [
        ...channels.filter((c) => c.type !== ChannelType.GuildCategory),
        ...channels.filter((c) => c.type === ChannelType.GuildCategory),
      ];
      for (const channel of ordered) {
        const isCategory = channel.type === ChannelType.GuildCategory;
        if (await attempt(`Kanał #${channel.name}`, () => channel.delete(reason)) !== null) {
          if (isCategory) R.deleted.categories += 1;
          else R.deleted.channels += 1;
        }
        tick(`#${channel.name}`);
      }
    }

    if (what.has('roles')) {
      startPhase('Usuwanie ról');
      for (const role of roles) {
        if (await attempt(`Rola „${role.name}”`, () => role.delete(reason)) !== null) R.deleted.roles += 1;
        tick(role.name);
      }
      const above = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed && !r.editable).size;
      if (above) R.warnings.push(`Zostało ${above} ról powyżej roli bota – przeciągnij rolę bota na samą górę i uruchom /usun ponownie.`);
      // Bez ról @everyone musi znów widzieć kanały (np. po weryfikacji z kreatora miał zero uprawnień).
      await attempt('Uprawnienia @everyone', () => guild.roles.everyone.setPermissions(toBits(DEFAULT_EVERYONE), reason));
      tick('@everyone');
    }

    if (emojis.length || stickers.length) {
      startPhase('Usuwanie emoji i naklejek');
      for (const emoji of emojis) {
        if (await attempt(`Emoji :${emoji.name}:`, () => emoji.delete(reason)) !== null) R.deleted.emojis += 1;
        tick(`:${emoji.name}:`);
      }
      for (const sticker of stickers) {
        if (await attempt(`Naklejka ${sticker.name}`, () => sticker.delete(reason)) !== null) R.deleted.stickers += 1;
        tick(sticker.name);
      }
    }

    if (what.has('invites')) {
      startPhase('Usuwanie zaproszeń');
      const invites = [...((await guild.invites?.fetch().catch(() => null))?.values() || [])];
      total += invites.length;
      for (const invite of invites) {
        if (await attempt(`Zaproszenie ${invite.code}`, () => invite.delete(reason)) !== null) R.deleted.invites += 1;
        tick(invite.code);
      }
    }

    if (bans.length) {
      startPhase('Zdejmowanie banów');
      for (const ban of bans) {
        const userId = ban.user?.id ?? ban.id;
        if (await attempt(`Unban ${ban.user?.tag ?? userId}`, () => guild.bans.remove(userId, reason)) !== null) R.deleted.unbanned += 1;
        tick(ban.user?.tag ?? userId);
      }
    }

    if (what.has('settings')) {
      startPhase('Przywracanie ustawień');
      const community = guild.features?.includes('COMMUNITY');
      await attempt('Ustawienia serwera', () => guild.edit({
        verificationLevel: community ? 1 : 0,
        explicitContentFilter: community ? 2 : 0,
        defaultMessageNotifications: 1,
        systemChannel: null,
        afkChannel: null,
        afkTimeout: 300,
        systemChannelFlags: 0,
        premiumProgressBarEnabled: false,
        reason,
      }));
    }
    tick('Ustawienia');

    // Świeże kanały – jak na nowym serwerze Discord.
    if (fresh && what.has('channels')) {
      startPhase('Tworzenie kanałów startowych');
      const textCat = await attempt('Kategoria „Kanały tekstowe”', () => guild.channels.create({ name: 'Kanały tekstowe', type: ChannelType.GuildCategory, reason }));
      const general = await attempt('#ogólny', () => guild.channels.create({ name: 'ogólny', type: ChannelType.GuildText, parent: textCat?.id, reason }));
      const voiceCat = await attempt('Kategoria „Kanały głosowe”', () => guild.channels.create({ name: 'Kanały głosowe', type: ChannelType.GuildCategory, reason }));
      const voice = await attempt('Kanał głosowy', () => guild.channels.create({ name: 'Ogólny', type: ChannelType.GuildVoice, parent: voiceCat?.id, reason }));
      R.created.channels = [textCat, general, voiceCat, voice].filter(Boolean).length;
      if (general?.id) {
        R.freshChannelId = general.id;
        await attempt('Kanał systemowy', () => guild.edit({ systemChannel: general.id, reason }));
      }
    }
    tick('Gotowe');
    R.phases.push(phase);
  } catch (err) {
    if (err?.aborted) {
      R.aborted = true;
      R.warnings.push('Czyszczenie zostało przerwane – część elementów została na serwerze.');
    } else {
      R.fatal = describeError(err);
      log.error('Krytyczny błąd czyszczenia:', err);
    }
  }
  R.duration = Date.now() - started;
  return R;
}

module.exports = { performCleanup, TARGETS, DEFAULT_TARGETS, DEFAULT_EVERYONE, MAX_UNBANS };
