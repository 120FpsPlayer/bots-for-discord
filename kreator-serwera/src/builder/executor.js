'use strict';

const {
  AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType, ChannelType, EmbedBuilder, GuildSystemChannelFlags, OverwriteType,
} = require('discord.js');
const { toBits } = require('./permissions');
const { renderContent } = require('./content');
const { createLogger } = require('../utils/logger');

const log = createLogger('budowa');

/**
 * Wykonawca blueprintu – tworzy na serwerze wszystko, co opisuje blueprint.
 * Każda operacja jest izolowana: błąd jednej (np. zbyt długa nazwa, limit Discorda)
 * nie przerywa całej budowy – trafia do raportu, a budowa idzie dalej.
 * Discord.js sam kolejkuje żądania i respektuje limity zapytań (rate limits).
 */

class BuildAborted extends Error {
  constructor() {
    super('Budowa przerwana przez użytkownika.');
    this.name = 'BuildAborted';
  }
}

const KIND_TYPE = {
  text: ChannelType.GuildText,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  voice: ChannelType.GuildVoice,
  stage: ChannelType.GuildStageVoice,
};

const API_ERRORS = {
  10003: 'kanał już nie istnieje',
  10011: 'rola już nie istnieje',
  30005: 'osiągnięto limit 250 ról',
  30013: 'osiągnięto limit 500 kanałów',
  30035: 'osiągnięto limit reguł AutoMod tego typu',
  50001: 'bot nie ma dostępu',
  50013: 'bot nie ma wymaganych uprawnień',
  50024: 'nie można tego zrobić na tym typie kanału',
  50028: 'nieprawidłowa rola',
  50035: 'nieprawidłowe dane',
  50074: 'kanał jest wymagany przez tryb Społeczności',
  50101: 'serwer nie spełnia wymagań trybu Społeczności',
};

function describeError(err) {
  if (!err) return 'nieznany błąd';
  const known = API_ERRORS[err.code];
  if (known && err.code === 50035) {
    const detail = String(err.message || '').split('\n').slice(1, 3).join(' ').trim();
    return detail ? `${known} (${detail.slice(0, 160)})` : known;
  }
  if (known) return known;
  return String(err.message || err).slice(0, 200);
}

const SINGLE_INSTANCE_TRIGGERS = new Set([
  AutoModerationRuleTriggerType.Spam,
  AutoModerationRuleTriggerType.KeywordPreset,
  AutoModerationRuleTriggerType.MentionSpam,
  AutoModerationRuleTriggerType.MemberProfile,
]);

/**
 * @param {object} p
 * @param {import('discord.js').Guild} p.guild
 * @param {object} p.blueprint
 * @param {object} p.answers
 * @param {string} p.invokerId
 * @param {string[]} [p.keepChannelIds]  kanały, których nie usuwamy w trybie czyszczenia
 * @param {(state: object) => void} [p.onProgress]
 * @param {() => boolean} [p.shouldAbort]
 */
async function executeBlueprint({ guild, blueprint: bp, answers, invokerId, keepChannelIds = [], onProgress = () => {}, shouldAbort = () => false }) {
  const started = Date.now();
  const reason = `Kreator Serwera – uruchomił ${invokerId}`;
  const wipe = bp.meta.mode === 'wipe';
  const R = {
    roles: {},
    channels: {},
    created: { roles: 0, categories: 0, channels: 0, messages: 0, automod: 0, overwrites: 0 },
    deleted: { channels: 0, roles: 0, automod: 0 },
    ids: { roles: [], categories: [], channels: [], automod: [] },
    warnings: [...bp.warnings],
    errors: [],
    phases: [],
    aborted: false,
    community: false,
  };

  let done = 0;
  let total = 1;
  let phase = 'Przygotowanie';
  let label = '';
  const emit = () => onProgress({ done, total, phase, label, phases: R.phases.slice(), elapsed: Date.now() - started });
  const tick = (text) => { done += 1; if (text) label = text; emit(); };
  const startPhase = (name) => {
    if (phase && phase !== 'Przygotowanie') R.phases.push(phase);
    phase = name;
    label = '';
    emit();
  };
  const checkAbort = () => { if (shouldAbort()) throw new BuildAborted(); };
  const attempt = async (what, fn, { warn = false } = {}) => {
    checkAbort();
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BuildAborted) throw err;
      const message = `${what}: ${describeError(err)}`;
      if (warn) R.warnings.push(message);
      else R.errors.push(message);
      log.warn(message);
      if (R.errors.length > 40) throw new Error('Zbyt wiele błędów z rzędu – budowa została zatrzymana. Sprawdź uprawnienia bota.');
      return null;
    }
  };

  try {
    // ───────────── Przygotowanie ─────────────
    emit();
    await guild.fetch();
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    let communityOn = guild.features.includes('COMMUNITY');
    // Zdjęcie ustawień sprzed budowy – potrzebne do „Cofnij budowę”.
    R.previous = {
      name: guild.name,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      systemChannelId: guild.systemChannelId ?? null,
      afkChannelId: guild.afkChannelId ?? null,
      afkTimeout: guild.afkTimeout ?? 300,
      rulesChannelId: guild.rulesChannelId ?? null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ?? null,
      everyonePermissions: String(guild.roles.everyone?.permissions?.bitfield ?? 0n),
      community: communityOn,
    };
    const wantCommunity = Boolean(bp.guild.community);

    const keep = new Set(keepChannelIds.filter(Boolean));
    const channelsToDelete = wipe ? [...guild.channels.cache.values()].filter((c) => !c.isThread() && !keep.has(c.id)) : [];
    const rolesToDelete = wipe ? [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed && r.editable) : [];
    const existingRules = await guild.autoModerationRules.fetch().catch(() => null);
    const rulesToDelete = wipe && existingRules ? [...existingRules.values()] : [];

    const channelCount = bp.categories.reduce((n, c) => n + c.channels.length, 0);
    total = channelsToDelete.length + rolesToDelete.length + rulesToDelete.length
      + bp.roles.length + 1 + bp.categories.length + channelCount + 3 + bp.messages.length + bp.automod.length + 3;

    // ───────────── Czyszczenie ─────────────
    const deferredDeletes = [];
    if (wipe) {
      startPhase('Czyszczenie serwera');
      for (const rule of rulesToDelete) {
        const ok = await attempt(`Usuwanie reguły AutoMod „${rule.name}”`, () => rule.delete(reason), { warn: true });
        if (ok !== null) R.deleted.automod += 1;
        tick(`AutoMod: ${rule.name}`);
      }
      const ordered = [
        ...channelsToDelete.filter((c) => c.type !== ChannelType.GuildCategory),
        ...channelsToDelete.filter((c) => c.type === ChannelType.GuildCategory),
      ];
      for (const channel of ordered) {
        checkAbort();
        try {
          await channel.delete(reason);
          R.deleted.channels += 1;
        } catch (err) {
          if (err.code === 50074) deferredDeletes.push(channel);
          else if (err.code !== 10003) R.warnings.push(`Nie usunięto kanału #${channel.name}: ${describeError(err)}`);
        }
        tick(`Usunięto #${channel.name}`);
      }
      for (const role of rolesToDelete) {
        const ok = await attempt(`Usuwanie roli „${role.name}”`, () => role.delete(reason), { warn: true });
        if (ok !== null) R.deleted.roles += 1;
        tick(`Usunięto rolę ${role.name}`);
      }
      const skippedRoles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed && !r.editable).size;
      if (skippedRoles) R.warnings.push(`Pominięto ${skippedRoles} ról powyżej roli bota – przenieś rolę bota wyżej, jeśli chcesz je usuwać.`);
    }

    // ───────────── Role ─────────────
    startPhase('Tworzenie ról');
    const roleIcons = guild.features.includes('ROLE_ICONS');
    for (const role of bp.roles) {
      const base = {
        name: role.name,
        colors: { primaryColor: role.color || 0 },
        hoist: Boolean(role.hoist),
        mentionable: Boolean(role.mentionable),
        permissions: toBits(role.permissions),
        reason,
      };
      const created = await attempt(`Rola „${role.name}”`, async () => {
        if (roleIcons && (role.hoist || bp.meta.type === 'backup') && role.emoji && !role.separator) {
          try {
            return await guild.roles.create({ ...base, unicodeEmoji: role.emoji });
          } catch {
            // Ikona roli jest tylko ozdobą – w razie problemu tworzymy rolę bez niej.
          }
        }
        return guild.roles.create(base);
      });
      if (created) {
        R.roles[role.key] = created.id;
        R.ids.roles.push(created.id);
        R.created.roles += 1;
      }
      tick(`Rola ${role.name}`);
    }
    await attempt('Kolejność ról', () => ensureRoleOrder(guild, bp.roles.map((r) => R.roles[r.key]).filter(Boolean)), { warn: true });

    await attempt('Uprawnienia @everyone', () => guild.roles.everyone.setPermissions(toBits(bp.everyone), reason));
    tick('Uprawnienia @everyone');

    // ───────────── Kategorie i kanały ─────────────
    startPhase('Tworzenie kanałów');
    const boosterRoleId = guild.roles.premiumSubscriberRole?.id;
    const resolveOverwrites = (list) => list.map((o) => {
      let id;
      if (o.target === '@everyone') id = guild.id;
      else if (o.target === '@booster') id = boosterRoleId;
      else if (typeof o.target === 'string' && o.target.startsWith('user:')) {
        // Nadpisanie dla konkretnej osoby (np. z kopii zapasowej serwera).
        return { id: o.target.slice(5), type: OverwriteType.Member, allow: toBits(o.allow), deny: toBits(o.deny) };
      } else id = R.roles[o.target];
      if (!id) return null;
      return { id, type: OverwriteType.Role, allow: toBits(o.allow), deny: toBits(o.deny) };
    }).filter(Boolean);

    const toConvert = [];
    const deferred = [];
    const categoryIds = {};

    // Nadpisania dla osób (z kopii zapasowej) mogą wskazywać kogoś, kogo już nie ma na serwerze –
    // wtedy Discord odrzuca cały kanał. Ponawiamy bez nich, żeby kanał i tak powstał.
    const createGuildChannel = async (opts) => {
      try {
        return await guild.channels.create(opts);
      } catch (err) {
        const personal = (opts.permissionOverwrites || []).filter((o) => o.type === OverwriteType.Member);
        if (!personal.length || err?.code === 50013) throw err;
        R.warnings.push(`${opts.name}: pominięto ${personal.length} uprawnień dla osób, których nie ma już na serwerze.`);
        return guild.channels.create({ ...opts, permissionOverwrites: opts.permissionOverwrites.filter((o) => o.type !== OverwriteType.Member) });
      }
    };

    const channelOptions = (ch, parentId, type) => {
      const opts = {
        name: ch.name,
        type,
        parent: parentId,
        permissionOverwrites: resolveOverwrites(ch.overwrites),
        reason,
      };
      const textLike = type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement || type === ChannelType.GuildForum;
      if (textLike && ch.topic) opts.topic = ch.topic;
      if (textLike) opts.nsfw = Boolean(ch.nsfw);
      if ((type === ChannelType.GuildText || type === ChannelType.GuildForum) && ch.slowmode) opts.rateLimitPerUser = ch.slowmode;
      if (type === ChannelType.GuildVoice && ch.userLimit) opts.userLimit = ch.userLimit;
      if (type === ChannelType.GuildForum) {
        if (ch.tags?.length) {
          opts.availableTags = ch.tags.map((t) => ({ name: t.name, moderated: Boolean(t.moderated), emoji: t.emoji ? { id: null, name: t.emoji } : null }));
        }
        if (ch.reaction) opts.defaultReactionEmoji = { id: null, name: ch.reaction };
      }
      return opts;
    };

    const createChannel = async (ch, parentId) => {
      let kind = ch.kind;
      if (kind === 'announcement' && !communityOn) {
        if (wantCommunity) toConvert.push(ch.key);
        kind = 'text';
      }
      if (kind === 'stage' && !communityOn) {
        deferred.push({ ch, parentId });
        return null;
      }
      if (kind === 'forum') {
        try {
          checkAbort();
          return await createGuildChannel(channelOptions(ch, parentId, ChannelType.GuildForum));
        } catch (err) {
          if (err instanceof BuildAborted) throw err;
          if (wantCommunity && !communityOn) {
            deferred.push({ ch, parentId });
            return null;
          }
          R.warnings.push(`Forum #${ch.name} utworzono jako zwykły kanał (${describeError(err)}).`);
          kind = 'text';
        }
      }
      return attempt(`Kanał ${ch.name}`, () => createGuildChannel(channelOptions(ch, parentId, KIND_TYPE[kind])));
    };

    for (const cat of bp.categories) {
      if (cat.root) {
        // Kanały bez kategorii (np. z kopii zapasowej) – tworzymy je bezpośrednio na serwerze.
        tick('Kanały bez kategorii');
        for (const ch of cat.channels) {
          const channel = await createChannel(ch, undefined);
          if (channel) {
            R.channels[ch.key] = channel.id;
            R.ids.channels.push(channel.id);
            R.created.channels += 1;
            R.created.overwrites += resolveOverwrites(ch.overwrites).length;
          }
          tick(`#${ch.name}`);
        }
        continue;
      }
      const category = await attempt(`Kategoria ${cat.name}`, () => createGuildChannel({
        name: cat.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: resolveOverwrites(cat.overwrites),
        reason,
      }));
      tick(`Kategoria ${cat.name}`);
      if (!category) continue;
      categoryIds[cat.key] = category.id;
      R.ids.categories.push(category.id);
      R.created.categories += 1;
      R.created.overwrites += resolveOverwrites(cat.overwrites).length;
      for (const ch of cat.channels) {
        const channel = await createChannel(ch, category.id);
        if (channel) {
          R.channels[ch.key] = channel.id;
          R.ids.channels.push(channel.id);
          R.created.channels += 1;
          R.created.overwrites += resolveOverwrites(ch.overwrites).length;
        }
        tick(`#${ch.name}`);
      }
    }

    // ───────────── Ustawienia serwera ─────────────
    startPhase('Ustawienia serwera');
    const id = (key) => (key ? R.channels[key] : undefined);
    const settings = {
      verificationLevel: bp.guild.verificationLevel,
      explicitContentFilter: bp.guild.explicitContentFilter,
      defaultMessageNotifications: bp.guild.defaultNotifications,
      // Bez porad Discorda; w kanale powitań (tylko do odczytu) chowamy też przycisk „pomachaj”.
      systemChannelFlags: GuildSystemChannelFlags.SuppressGuildReminderNotifications
        | (bp.guild.suppressJoinReplies ? GuildSystemChannelFlags.SuppressJoinNotificationReplies : 0),
      premiumProgressBarEnabled: true,
      reason,
    };
    if (communityOn) {
      // Serwer już jest w trybie Społeczności – Discord nie pozwoli obniżyć tych ustawień.
      settings.verificationLevel = Math.max(1, settings.verificationLevel);
      settings.explicitContentFilter = 2;
    }
    if (bp.guild.name) settings.name = bp.guild.name;
    if (id(bp.guild.systemChannel)) settings.systemChannel = id(bp.guild.systemChannel);
    if (id(bp.guild.afkChannel)) {
      settings.afkChannel = id(bp.guild.afkChannel);
      settings.afkTimeout = bp.guild.afkTimeout;
    }
    await attempt('Ustawienia serwera', () => guild.edit(settings));
    if (bp.guild.iconUrl) await attempt('Ikona serwera', () => guild.setIcon(bp.guild.iconUrl, reason), { warn: true });
    tick('Nazwa, bezpieczeństwo, kanał systemowy');

    // ───────────── Tryb Społeczności ─────────────
    if (wantCommunity) {
      startPhase('Tryb Społeczności');
      const c = bp.guild.community;
      const rulesId = id(c.rulesChannel);
      const updatesId = id(c.updatesChannel);
      if (rulesId && updatesId) {
        const payload = { rulesChannel: rulesId, publicUpdatesChannel: updatesId, reason };
        if (!communityOn) {
          payload.features = [...new Set([...guild.features, 'COMMUNITY'])];
          payload.verificationLevel = Math.max(1, bp.guild.verificationLevel);
          payload.explicitContentFilter = 2;
        }
        const ok = await attempt('Włączanie trybu Społeczności', () => guild.edit(payload));
        if (ok) communityOn = guild.features.includes('COMMUNITY') || Boolean(ok.features?.includes('COMMUNITY'));
        if (communityOn) {
          const extra = { preferredLocale: bp.guild.locale, safetyAlertsChannel: updatesId, reason };
          if (c.description) extra.description = c.description;
          await attempt('Opis i język serwera', () => guild.edit(extra), { warn: true });
        }
      } else {
        R.warnings.push('Tryb Społeczności pominięty – nie udało się utworzyć kanału regulaminu lub kanału moderatorów.');
      }
      tick('Tryb Społeczności');

      if (communityOn) {
        for (const key of toConvert) {
          const channel = guild.channels.cache.get(R.channels[key]);
          if (channel) await attempt(`Kanał ogłoszeń #${channel.name}`, () => channel.setType(ChannelType.GuildAnnouncement, reason), { warn: true });
        }
      } else if (toConvert.length) {
        R.warnings.push('Tryb Społeczności nie został włączony – kanały ogłoszeń są zwykłymi kanałami tekstowymi (tylko do odczytu).');
      }
    }

    // Kanały odłożone (scena / forum wymagające Społeczności)
    if (deferred.length) {
      for (const { ch, parentId } of deferred) {
        let kind = ch.kind;
        if (!communityOn) {
          kind = ch.kind === 'stage' ? 'voice' : 'text';
          R.warnings.push(`${ch.kind === 'stage' ? 'Scenę' : 'Forum'} #${ch.name} utworzono jako zwykły kanał (brak trybu Społeczności).`);
        }
        const channel = await attempt(`Kanał ${ch.name}`, () => createGuildChannel(channelOptions(ch, parentId, KIND_TYPE[kind])));
        if (channel) {
          R.channels[ch.key] = channel.id;
          R.ids.channels.push(channel.id);
          R.created.channels += 1;
          R.created.overwrites += resolveOverwrites(ch.overwrites).length;
        }
      }
      // Przywracamy kolejność kanałów w kategoriach, do których coś dołożyliśmy.
      const parents = new Set(deferred.map((d) => d.parentId));
      for (const cat of bp.categories) {
        if (!parents.has(categoryIds[cat.key])) continue;
        const positions = cat.channels.map((ch) => R.channels[ch.key]).filter(Boolean).map((channel, position) => ({ channel, position }));
        await attempt(`Kolejność kanałów w ${cat.name}`, () => guild.channels.setPositions(positions), { warn: true });
      }
    }
    R.community = communityOn;

    // Ekran powitalny
    if (communityOn && bp.guild.community?.welcomeScreen) {
      const ws = bp.guild.community.welcomeScreen;
      const welcomeChannels = ws.channels
        .filter((w) => R.channels[w.channel])
        .map((w) => ({ channel: R.channels[w.channel], description: w.description, emoji: w.emoji }));
      if (welcomeChannels.length) {
        await attempt('Ekran powitalny', () => guild.editWelcomeScreen({ enabled: true, description: ws.description, welcomeChannels }), { warn: true });
      }
    }
    tick('Ekran powitalny');

    // ───────────── Wiadomości i panele ─────────────
    startPhase('Publikowanie wiadomości');
    const ctx = {
      lang: bp.meta.language,
      answers,
      blueprint: bp,
      color: bp.meta.embedColor,
      guildName: guild.name,
      date: new Date().toLocaleDateString(bp.meta.language === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }),
      ch: (key) => (R.channels[key] ? `<#${R.channels[key]}>` : null),
      role: (key) => (R.roles[key] ? `<@&${R.roles[key]}>` : null),
      roleId: (key) => R.roles[key] || null,
      channelId: (key) => R.channels[key] || null,
    };
    for (const message of bp.messages) {
      const channel = guild.channels.cache.get(R.channels[message.channel]);
      if (channel) {
        const payloads = renderContent(message.kind, ctx);
        for (const payload of payloads) {
          const body = { embeds: payload.embeds, components: payload.components || [], allowedMentions: payload.allowedMentions || { parse: [] } };
          if (payload.content) body.content = payload.content;
          const sent = await attempt(`Wiadomość w #${channel.name}`, async () => {
            if (channel.type === ChannelType.GuildForum) {
              const title = payload.thread || payload.embeds?.[0]?.data?.title || 'Informacje';
              const thread = await channel.threads.create({ name: title.slice(0, 100), message: body, reason });
              await thread.pin(reason).catch(() => {});
              return thread;
            }
            const msg = await channel.send(body);
            if (payload.thread) await msg.startThread({ name: payload.thread.slice(0, 100), reason }).catch(() => {});
            return msg;
          });
          if (sent) R.created.messages += 1;
        }
      }
      tick(`Wiadomość: ${message.kind}`);
    }

    // ───────────── AutoMod ─────────────
    startPhase('Konfiguracja AutoMod');
    const activeRules = wipe ? [] : [...(existingRules?.values() || [])];
    let keywordRules = activeRules.filter((r) => r.triggerType === AutoModerationRuleTriggerType.Keyword).length;
    for (const rule of bp.automod) {
      const triggerType = AutoModerationRuleTriggerType[rule.trigger];
      if (SINGLE_INSTANCE_TRIGGERS.has(triggerType) && activeRules.some((r) => r.triggerType === triggerType)) {
        R.warnings.push(`AutoMod „${rule.name}” pominięto – serwer ma już regułę tego typu.`);
        tick(rule.name);
        continue;
      }
      if (triggerType === AutoModerationRuleTriggerType.Keyword) {
        if (keywordRules >= 6) {
          R.warnings.push(`AutoMod „${rule.name}” pominięto – osiągnięto limit 6 reguł słów kluczowych.`);
          tick(rule.name);
          continue;
        }
        keywordRules += 1;
      }
      const actions = rule.actions.map((a) => {
        if (a.type === 'block') return { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: a.message } };
        if (a.type === 'alert') return R.channels[a.channel] ? { type: AutoModerationActionType.SendAlertMessage, metadata: { channel: R.channels[a.channel] } } : null;
        if (a.type === 'timeout') return { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: a.seconds } };
        if (a.type === 'blockInteraction') return { type: AutoModerationActionType.BlockMemberInteraction };
        return null;
      }).filter(Boolean);
      const metadata = { ...rule.metadata };
      if (metadata.presets) metadata.presets = metadata.presets.map((p) => AutoModerationRuleKeywordPresetType[p]);
      const created = await attempt(`AutoMod „${rule.name}”`, () => guild.autoModerationRules.create({
        name: rule.name,
        eventType: AutoModerationRuleEventType[rule.event || 'MessageSend'],
        triggerType,
        triggerMetadata: metadata,
        actions,
        enabled: true,
        exemptRoles: rule.exemptRoles.map((k) => R.roles[k]).filter(Boolean),
        reason,
      }), { warn: true });
      if (created) {
        R.created.automod += 1;
        R.ids.automod.push(created.id);
      }
      tick(rule.name);
    }

    // ───────────── Role dla właściciela, wywołującego i bota ─────────────
    startPhase('Nadawanie ról');
    const memberRole = R.roles[bp.assign.member];
    if (bp.assign.enabled) {
      const ownerRoles = [R.roles[bp.assign.owner], memberRole].filter(Boolean);
      if (ownerRoles.length) {
        await attempt('Role właściciela', async () => (await guild.members.fetch(guild.ownerId)).roles.add(ownerRoles, reason), { warn: true });
      }
      if (invokerId && invokerId !== guild.ownerId) {
        const invokerRoles = [R.roles[bp.assign.invoker], memberRole].filter(Boolean);
        if (invokerRoles.length) {
          await attempt('Twoje role', async () => (await guild.members.fetch(invokerId)).roles.add(invokerRoles, reason), { warn: true });
        }
      }
    }
    tick('Role ekipy');
    if (R.roles[bp.assign.bot]) await attempt('Rola bota', () => me.roles.add(R.roles[bp.assign.bot], reason), { warn: true });
    tick('Rola bota');

    // Usuwanie kanałów, które blokował tryb Społeczności (teraz regulamin/moderacja są w nowych kanałach)
    for (const channel of deferredDeletes) {
      await attempt(`Usuwanie #${channel.name}`, async () => {
        await channel.delete(reason);
        R.deleted.channels += 1;
      }, { warn: true });
    }

    // Raport dla ekipy
    const reportChannel = guild.channels.cache.get(R.channels.management || R.channels.staffChat || R.channels.logServer);
    if (reportChannel) {
      const report = new EmbedBuilder()
        .setColor(bp.meta.embedColor)
        .setTitle('🏗️ Raport z budowy serwera')
        .setDescription(`Serwer został zbudowany przez **Kreator Serwera** na polecenie <@${invokerId}>.`)
        .addFields(
          { name: '📊 Utworzono', value: `🎭 ${R.created.roles} ról\n📁 ${R.created.categories} kategorii\n💬 ${R.created.channels} kanałów\n📨 ${R.created.messages} wiadomości\n🤖 ${R.created.automod} reguł AutoMod`, inline: true },
          { name: '⏱️ Czas', value: `${Math.round((Date.now() - started) / 1000)} s`, inline: true },
          { name: '⚠️ Uwagi', value: `${R.warnings.length + R.errors.length}`, inline: true },
        )
        .setTimestamp(new Date());
      await attempt('Raport budowy', () => reportChannel.send({ embeds: [report], allowedMentions: { parse: [] } }), { warn: true });
    }
    tick('Raport');
    R.phases.push(phase);
  } catch (err) {
    if (err instanceof BuildAborted) {
      R.aborted = true;
      R.warnings.push('Budowa została przerwana na Twoje życzenie – utworzone elementy zostały na serwerze.');
    } else {
      R.fatal = describeError(err);
      log.error('Krytyczny błąd budowy:', err);
    }
  }

  R.duration = Date.now() - started;
  R.done = done;
  R.total = total;
  return R;
}

/**
 * Upewnia się, że role są w kolejności z blueprintu (pierwsza = najwyższa).
 * Nowe role Discord tworzy na dole listy, więc tworzenie „od góry” zwykle wystarcza –
 * poprawiamy tylko, jeśli coś się rozjechało.
 */
async function ensureRoleOrder(guild, ids) {
  // Pozycje innych ról zmieniają się przy każdym tworzeniu – pobieramy świeże dane z API.
  const fresh = await guild.roles.fetch();
  const roles = ids.map((rid) => fresh.get(rid) ?? guild.roles.cache.get(rid)).filter(Boolean);
  const sorted = roles.every((r, i) => i === 0 || roles[i - 1].position > r.position);
  if (sorted || roles.length < 2) return true;
  const base = Math.min(...roles.map((r) => r.position));
  const positions = roles.map((role, i) => ({ role: role.id, position: base + (roles.length - 1 - i) }));
  await guild.roles.setPositions(positions);
  return true;
}

module.exports = { executeBlueprint, describeError, BuildAborted };
