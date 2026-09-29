'use strict';

const {
  AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleKeywordPresetType, AutoModerationRuleTriggerType,
  ChannelType, OverwriteType, PermissionFlagsBits,
} = require('discord.js');

/**
 * Kopia zapasowa serwera.
 * Zapisujemy strukturę serwera w tym samym formacie, którego używa silnik budowy (blueprint),
 * dzięki czemu kopię można przywrócić komendą `/stworz projekt:<plik kopii>`.
 * W kopii są: role (z uprawnieniami i kolorami), kategorie i kanały (z nadpisaniami uprawnień,
 * tematami, slowmode, tagami forów), reguły AutoMod i najważniejsze ustawienia serwera.
 * Wiadomości, członkowie, emoji i bany NIE są kopiowane.
 */

const BACKUP_KIND = 'kreator-backup';
const KIND_OF = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'stage',
};
const VOICE = new Set(['voice', 'stage']);
const enumName = (enumObj, value) => Object.keys(enumObj).find((k) => enumObj[k] === value && Number.isNaN(Number(k)));

function perms(bitfield) {
  return Object.keys(PermissionFlagsBits).filter((name) => (BigInt(bitfield ?? 0n) & PermissionFlagsBits[name]) === PermissionFlagsBits[name]);
}

/** Przybliżony opis dostępu (do podglądu kanałów przed przywróceniem). */
function accessFromOverwrites(overwrites) {
  const everyone = overwrites.find((o) => o.target === '@everyone');
  return {
    view: everyone?.deny.includes('ViewChannel') ? 'role' : 'members',
    write: everyone?.deny.includes('SendMessages') || everyone?.deny.includes('Speak') ? 'readonly' : 'all',
    custom: false,
  };
}

/** Tworzy kopię zapasową struktury serwera. */
async function snapshotGuild(guild) {
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});
  const warnings = [];

  // Role (od najwyższej), bez @everyone i ról zarządzanych przez integracje (boty, boosty).
  const roleList = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position);
  const roleKey = (id) => `r${id}`;
  const roleKeys = new Set(roleList.map((r) => roleKey(r.id)));
  const roles = roleList.map((r) => ({
    key: roleKey(r.id),
    name: r.name,
    label: r.name,
    color: r.colors?.primaryColor ?? r.color ?? 0,
    hoist: Boolean(r.hoist),
    mentionable: Boolean(r.mentionable),
    permissions: r.permissions.toArray ? r.permissions.toArray() : perms(r.permissions),
    emoji: r.unicodeEmoji || null,
  }));

  const overwritesOf = (channel) => {
    const out = [];
    const cache = channel.permissionOverwrites?.cache ?? new Map();
    for (const o of cache.values()) {
      let target;
      if (o.id === guild.id) target = '@everyone';
      else if (o.type === OverwriteType.Member) target = `user:${o.id}`;
      else if (roleKeys.has(roleKey(o.id))) target = roleKey(o.id);
      else continue; // rola bota / integracji – nie jest kopiowana
      const allow = o.allow?.toArray ? o.allow.toArray() : perms(o.allow);
      const deny = o.deny?.toArray ? o.deny.toArray() : perms(o.deny);
      if (allow.length || deny.length) out.push({ target, allow, deny });
    }
    return out;
  };

  const channelKey = (id) => `c${id}`;
  const channelOf = (c) => {
    const kind = KIND_OF[c.type];
    if (!kind) {
      warnings.push(`Kanał #${c.name} (typ ${c.type}) nie jest obsługiwany i nie trafi do kopii.`);
      return null;
    }
    const overwrites = overwritesOf(c);
    return {
      key: channelKey(c.id),
      kind,
      name: c.name,
      emoji: null,
      topic: c.topic || null,
      profile: 'public',
      posters: [],
      access: accessFromOverwrites(overwrites),
      slowmode: VOICE.has(kind) ? 0 : c.rateLimitPerUser || 0,
      nsfw: Boolean(c.nsfw),
      userLimit: kind === 'voice' ? c.userLimit || 0 : 0,
      tags: kind === 'forum' ? (c.availableTags || []).slice(0, 20).map((t) => ({ name: t.name, moderated: Boolean(t.moderated), emoji: t.emoji?.id ? undefined : t.emoji?.name || undefined })) : undefined,
      reaction: kind === 'forum' && c.defaultReactionEmoji && !c.defaultReactionEmoji.id ? c.defaultReactionEmoji.name : undefined,
      overwrites,
    };
  };

  // Kolejność jak w Discordzie: kanały tekstowe przed głosowymi, potem pozycja.
  const sortChannels = (list) => list.sort((a, b) => {
    const va = VOICE.has(KIND_OF[a.type]) ? 1 : 0;
    const vb = VOICE.has(KIND_OF[b.type]) ? 1 : 0;
    return va - vb || (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0);
  });
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread?.());
  const categories = [];
  const uncategorized = sortChannels(all.filter((c) => c.type !== ChannelType.GuildCategory && !c.parentId)).map(channelOf).filter(Boolean);
  if (uncategorized.length) categories.push({ key: '__root', root: true, name: '(bez kategorii)', section: null, overwrites: [], channels: uncategorized });
  const cats = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
  for (const cat of cats) {
    const children = sortChannels(all.filter((c) => c.parentId === cat.id)).map(channelOf).filter(Boolean);
    categories.push({ key: channelKey(cat.id), name: cat.name, section: null, overwrites: overwritesOf(cat), channels: children });
  }

  // Reguły AutoMod
  const automod = [];
  const rules = await guild.autoModerationRules?.fetch().catch(() => null);
  for (const rule of rules?.values() || []) {
    const trigger = enumName(AutoModerationRuleTriggerType, rule.triggerType);
    if (!trigger) continue;
    const tm = rule.triggerMetadata || {};
    const metadata = {};
    if (tm.keywordFilter?.length) metadata.keywordFilter = [...tm.keywordFilter];
    if (tm.regexPatterns?.length) metadata.regexPatterns = [...tm.regexPatterns];
    if (tm.allowList?.length) metadata.allowList = [...tm.allowList];
    if (tm.presets?.length) metadata.presets = tm.presets.map((p) => enumName(AutoModerationRuleKeywordPresetType, p)).filter(Boolean);
    if (tm.mentionTotalLimit) metadata.mentionTotalLimit = tm.mentionTotalLimit;
    if (tm.mentionRaidProtectionEnabled) metadata.mentionRaidProtectionEnabled = true;
    const actions = (rule.actions || []).map((a) => {
      if (a.type === AutoModerationActionType.BlockMessage) return { type: 'block', message: a.metadata?.customMessage || undefined };
      if (a.type === AutoModerationActionType.SendAlertMessage) return a.metadata?.channelId ? { type: 'alert', channel: channelKey(a.metadata.channelId) } : null;
      if (a.type === AutoModerationActionType.Timeout) return { type: 'timeout', seconds: a.metadata?.durationSeconds || 60 };
      if (a.type === AutoModerationActionType.BlockMemberInteraction) return { type: 'blockInteraction' };
      return null;
    }).filter(Boolean);
    automod.push({
      key: `a${rule.id}`,
      name: rule.name,
      trigger,
      event: enumName(AutoModerationRuleEventType, rule.eventType) || 'MessageSend',
      metadata,
      actions,
      exemptRoles: [...(rule.exemptRoles?.keys?.() || [])].map(roleKey).filter((k) => roleKeys.has(k)),
    });
  }

  const has = (id) => id && all.some((c) => c.id === id);
  const community = guild.features?.includes('COMMUNITY') && has(guild.rulesChannelId) && has(guild.publicUpdatesChannelId)
    ? { rulesChannel: channelKey(guild.rulesChannelId), updatesChannel: channelKey(guild.publicUpdatesChannelId), description: guild.description || null, welcomeScreen: null }
    : null;

  const blueprint = {
    version: 1,
    meta: {
      generatedAt: new Date().toISOString(),
      type: 'backup',
      typeLabel: 'Kopia zapasowa',
      language: 'pl',
      size: 'medium',
      mode: 'append',
      gate: false,
      verify: null,
      embedColor: 0x5865f2,
    },
    guild: {
      name: guild.name,
      iconUrl: guild.iconURL?.({ extension: 'png', size: 512 }) || null,
      verificationLevel: guild.verificationLevel ?? 0,
      explicitContentFilter: guild.explicitContentFilter ?? 0,
      defaultNotifications: guild.defaultMessageNotifications ?? 1,
      systemChannel: has(guild.systemChannelId) ? channelKey(guild.systemChannelId) : null,
      suppressJoinReplies: false,
      afkChannel: has(guild.afkChannelId) ? channelKey(guild.afkChannelId) : null,
      afkTimeout: guild.afkTimeout ?? 300,
      locale: guild.preferredLocale || 'pl',
      community,
    },
    everyone: guild.roles.everyone ? (guild.roles.everyone.permissions.toArray ? guild.roles.everyone.permissions.toArray() : perms(guild.roles.everyone.permissions)) : [],
    roles,
    categories,
    messages: [],
    automod,
    assign: { enabled: false, owner: null, invoker: null, member: null, bot: null },
    warnings: [],
    errors: [],
  };
  blueprint.stats = computeStats(blueprint);
  blueprint.estimatedSeconds = Math.round(blueprint.stats.roles * 0.5 + (blueprint.stats.categories + blueprint.stats.channels) * 0.9 + automod.length * 0.6 + 6);

  return {
    kind: BACKUP_KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    warnings,
    blueprint,
  };
}

function computeStats(bp) {
  const channels = bp.categories.flatMap((c) => c.channels);
  const visible = (c) => ['members', 'unverified'].includes(c.access.view);
  return {
    roles: bp.roles.length,
    separators: 0,
    categories: bp.categories.filter((c) => !c.root).length,
    channels: channels.length,
    text: channels.filter((c) => !VOICE.has(c.kind)).length,
    voice: channels.filter((c) => VOICE.has(c.kind)).length,
    forums: channels.filter((c) => c.kind === 'forum').length,
    messages: 0,
    automod: bp.automod.length,
    hidden: channels.filter((c) => !visible(c)).length,
    readonly: channels.filter((c) => visible(c) && c.access.write !== 'all').length,
    open: channels.filter((c) => visible(c) && c.access.write === 'all').length,
    overwrites: bp.categories.reduce((n, c) => n + c.overwrites.length + c.channels.reduce((m, ch) => m + ch.overwrites.length, 0), 0),
  };
}

// ───────────── Wczytywanie kopii z pliku (dane od użytkownika – wszystko sprawdzamy) ─────────────

const PERM_NAMES = new Set(Object.keys(PermissionFlagsBits));
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const clampInt = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);
const permList = (v) => (Array.isArray(v) ? [...new Set(v.filter((p) => PERM_NAMES.has(p)))] : []);
const KINDS = new Set(['text', 'announcement', 'forum', 'voice', 'stage']);
const TRIGGERS = new Set(['Keyword', 'Spam', 'KeywordPreset', 'MentionSpam', 'MemberProfile']);
const PRESETS = new Set(['Profanity', 'SexualContent', 'Slurs']);

function isBackup(json) {
  return Boolean(json && typeof json === 'object' && json.kind === BACKUP_KIND && json.blueprint);
}

/** Zamienia kopię z pliku na bezpieczny blueprint gotowy do przywrócenia. */
function sanitizeBackup(json) {
  if (!isBackup(json)) throw new Error('To nie jest kopia zapasowa z komendy /usun.');
  const src = json.blueprint;
  const roles = [];
  const roleKeys = new Set();
  for (const r of (Array.isArray(src.roles) ? src.roles : []).slice(0, 245)) {
    const key = str(r?.key, 40);
    const name = str(r?.name, 100).trim();
    if (!/^r\d{1,20}$/.test(key) || !name || roleKeys.has(key)) continue;
    roleKeys.add(key);
    roles.push({
      key, name, label: name,
      color: Number.isInteger(r.color) && r.color >= 0 && r.color <= 0xffffff ? r.color : 0,
      hoist: Boolean(r.hoist), mentionable: Boolean(r.mentionable), permissions: permList(r.permissions),
      emoji: typeof r.emoji === 'string' && r.emoji.length <= 16 && /^\p{Extended_Pictographic}/u.test(r.emoji) ? r.emoji : null,
    });
  }
  const cleanOverwrites = (list) => (Array.isArray(list) ? list : []).slice(0, 100).map((o) => {
    const target = str(o?.target, 40);
    const ok = target === '@everyone' || roleKeys.has(target) || /^user:\d{15,20}$/.test(target);
    if (!ok) return null;
    const allow = permList(o.allow);
    const deny = permList(o.deny).filter((p) => !allow.includes(p));
    return allow.length || deny.length ? { target, allow, deny } : null;
  }).filter(Boolean);

  const channelKeys = new Set();
  let total = 0;
  const categories = [];
  for (const cat of (Array.isArray(src.categories) ? src.categories : []).slice(0, 100)) {
    const root = cat?.root === true;
    const key = root ? '__root' : str(cat?.key, 40);
    if (!root && (!/^c\d{1,20}$/.test(key) || channelKeys.has(key))) continue;
    if (root && categories.some((c) => c.root)) continue;
    channelKeys.add(key);
    const channels = [];
    for (const ch of (Array.isArray(cat.channels) ? cat.channels : []).slice(0, 50)) {
      const ckey = str(ch?.key, 40);
      const kind = KINDS.has(ch?.kind) ? ch.kind : null;
      const name = str(ch?.name, 100).trim();
      if (!/^c\d{1,20}$/.test(ckey) || channelKeys.has(ckey) || !kind || !name) continue;
      if (total >= 480) break;
      channelKeys.add(ckey);
      total += 1;
      const overwrites = cleanOverwrites(ch.overwrites);
      channels.push({
        key: ckey, kind, name, emoji: null,
        topic: str(ch.topic, kind === 'forum' ? 4000 : 1000) || null,
        profile: 'public', posters: [], access: accessFromOverwrites(overwrites),
        slowmode: VOICE.has(kind) ? 0 : clampInt(ch.slowmode, 0, 21600, 0),
        nsfw: Boolean(ch.nsfw),
        userLimit: kind === 'voice' ? clampInt(ch.userLimit, 0, 99, 0) : 0,
        tags: kind === 'forum' && Array.isArray(ch.tags)
          ? ch.tags.slice(0, 20).map((t) => ({ name: str(t?.name, 20).trim(), moderated: Boolean(t?.moderated), emoji: str(t?.emoji, 16) || undefined })).filter((t) => t.name)
          : undefined,
        reaction: kind === 'forum' ? str(ch.reaction, 16) || undefined : undefined,
        overwrites,
      });
    }
    if (root && !channels.length) continue;
    categories.push(root
      ? { key, root: true, name: '(bez kategorii)', section: null, overwrites: [], channels }
      : { key, name: str(cat.name, 100).trim() || 'Kategoria', section: null, overwrites: cleanOverwrites(cat.overwrites), channels });
    total += root ? 0 : 1;
  }

  const automod = [];
  for (const rule of (Array.isArray(src.automod) ? src.automod : []).slice(0, 10)) {
    if (!TRIGGERS.has(rule?.trigger)) continue;
    const m = rule.metadata || {};
    const metadata = {};
    const words = (v, max, len) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len)) : []);
    if (m.keywordFilter) metadata.keywordFilter = words(m.keywordFilter, 1000, 60);
    if (m.regexPatterns) metadata.regexPatterns = words(m.regexPatterns, 10, 260);
    if (m.allowList) metadata.allowList = words(m.allowList, 1000, 60);
    if (m.presets) metadata.presets = words(m.presets, 3, 20).filter((p) => PRESETS.has(p));
    if (Number.isInteger(m.mentionTotalLimit)) metadata.mentionTotalLimit = Math.min(50, Math.max(1, m.mentionTotalLimit));
    if (m.mentionRaidProtectionEnabled) metadata.mentionRaidProtectionEnabled = true;
    const actions = (Array.isArray(rule.actions) ? rule.actions : []).map((a) => {
      if (a?.type === 'block') return { type: 'block', message: str(a.message, 150) || undefined };
      if (a?.type === 'alert' && channelKeys.has(a.channel)) return { type: 'alert', channel: a.channel };
      if (a?.type === 'timeout') return { type: 'timeout', seconds: clampInt(a.seconds, 1, 2419200, 60) };
      if (a?.type === 'blockInteraction') return { type: 'blockInteraction' };
      return null;
    }).filter(Boolean);
    if (!actions.length) continue;
    automod.push({
      key: str(rule.key, 40) || `a${automod.length}`,
      name: str(rule.name, 100) || 'AutoMod',
      trigger: rule.trigger,
      event: rule.trigger === 'MemberProfile' ? 'MemberUpdate' : 'MessageSend',
      metadata, actions,
      exemptRoles: (Array.isArray(rule.exemptRoles) ? rule.exemptRoles : []).filter((k) => roleKeys.has(k)).slice(0, 20),
    });
  }

  const g = src.guild || {};
  const chKey = (k) => (typeof k === 'string' && channelKeys.has(k) ? k : null);
  const community = g.community && chKey(g.community.rulesChannel) && chKey(g.community.updatesChannel)
    ? { rulesChannel: g.community.rulesChannel, updatesChannel: g.community.updatesChannel, description: str(g.community.description, 120) || null, welcomeScreen: null }
    : null;
  const blueprint = {
    version: 1,
    meta: { generatedAt: str(src.meta?.generatedAt, 40), type: 'backup', typeLabel: 'Kopia zapasowa', language: 'pl', size: 'medium', mode: 'append', gate: false, verify: null, embedColor: 0x5865f2 },
    guild: {
      name: str(g.name, 100).trim() || null,
      iconUrl: /^https:\/\/cdn\.discordapp\.com\//.test(str(g.iconUrl, 400)) ? str(g.iconUrl, 400) : null,
      verificationLevel: clampInt(g.verificationLevel, 0, 4, 0),
      explicitContentFilter: clampInt(g.explicitContentFilter, 0, 2, 0),
      defaultNotifications: g.defaultNotifications === 0 ? 0 : 1,
      systemChannel: chKey(g.systemChannel),
      suppressJoinReplies: false,
      afkChannel: chKey(g.afkChannel),
      afkTimeout: [60, 300, 900, 1800, 3600].includes(g.afkTimeout) ? g.afkTimeout : 300,
      locale: /^[a-z]{2}(-[A-Z]{2})?$/.test(str(g.locale, 10)) ? g.locale : 'pl',
      community,
    },
    everyone: permList(src.everyone),
    roles,
    categories,
    messages: [],
    automod,
    assign: { enabled: false, owner: null, invoker: null, member: null, bot: null },
    warnings: [],
    errors: [],
  };
  if (!roles.length && !categories.length) throw new Error('Kopia jest pusta – nie ma w niej ról ani kanałów.');
  blueprint.stats = computeStats(blueprint);
  blueprint.estimatedSeconds = Math.round(blueprint.stats.roles * 0.5 + (blueprint.stats.categories + blueprint.stats.channels) * 0.9 + automod.length * 0.6 + 6);
  return { blueprint, guildName: str(json.guildName, 100), createdAt: str(json.createdAt, 40) };
}

module.exports = { snapshotGuild, sanitizeBackup, isBackup, computeStats, BACKUP_KIND };
