'use strict';

/**
 * Atrapa (mock) serwera Discord – implementuje dokładnie te fragmenty API discord.js,
 * których używa executor i funkcje bota. Waliduje dane tak jak Discord (limity nazw,
 * tagów, nadpisań, typów kanałów wymagających Społeczności itd.) i rzuca błędy
 * z kodami API, dzięki czemu testy wyłapują realne problemy.
 */

const { ChannelType, Collection, PermissionsBitField, OverwriteType } = require('discord.js');

let seq = 100000000000000000n;
const nextId = () => String(++seq);

function apiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Discord przyjmuje w komponentach tylko prawdziwe emoji Unicode (lista RGI) albo emoji serwera (z id).
 * Znaki typu ✦ czy 〔 wyglądają jak emoji, ale Discord odrzuca je błędem COMPONENT_INVALID_EMOJI.
 */
let RGI_EMOJI = null;
try {
  RGI_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
} catch {
  RGI_EMOJI = null; // starszy Node bez flagi „v” – sprawdzanie emoji pominięte
}

function assertEmoji(emoji, where) {
  if (!emoji || emoji.id || !RGI_EMOJI) return;
  const name = typeof emoji === 'string' ? emoji : emoji.name;
  if (!RGI_EMOJI.test(name)) {
    throw apiError(50035, `${where}.emoji.name[COMPONENT_INVALID_EMOJI]: Invalid emoji ${JSON.stringify(name)}`);
  }
}

/** Sprawdza emoji we wszystkich komponentach (przyciski, menu i ich opcje, także w modalach). */
function assertComponentEmojis(components, where = 'components') {
  (components || []).forEach((c, i) => {
    const path = `${where}[${i}]`;
    assertEmoji(c.emoji, path);
    (c.options || []).forEach((o, j) => assertEmoji(o.emoji, `${path}.options[${j}]`));
    if (c.components) assertComponentEmojis(c.components, `${path}.components`);
    if (c.component) assertComponentEmojis([c.component], `${path}.component`);
  });
}

function embedLength(e) {
  const d = typeof e.toJSON === 'function' ? e.toJSON() : e;
  let n = (d.title?.length || 0) + (d.description?.length || 0) + (d.footer?.text?.length || 0) + (d.author?.name?.length || 0);
  for (const f of d.fields || []) n += f.name.length + f.value.length;
  return { n, d };
}

function validateMessage(body) {
  const embeds = body.embeds || [];
  if (embeds.length > 10) throw apiError(50035, 'too many embeds');
  let total = 0;
  for (const e of embeds) {
    const { n, d } = embedLength(e);
    total += n;
    if ((d.title?.length || 0) > 256) throw apiError(50035, 'embed title > 256');
    if ((d.description?.length || 0) > 4096) throw apiError(50035, 'embed description > 4096');
    if ((d.fields || []).length > 25) throw apiError(50035, 'embed fields > 25');
    for (const f of d.fields || []) {
      if (!f.name || f.name.length > 256) throw apiError(50035, `field name invalid: ${f.name}`);
      if (!f.value || f.value.length > 1024) throw apiError(50035, `field value invalid (${f.value?.length})`);
    }
  }
  if (total > 6000) throw apiError(50035, `embeds total > 6000 (${total})`);
  const rows = (body.components || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
  if (rows.length > 5) throw apiError(50035, 'too many rows');
  assertComponentEmojis(rows);
  for (const row of rows) {
    for (const c of row.components) {
      if (c.custom_id && c.custom_id.length > 100) throw apiError(50035, 'custom_id > 100');
      if (c.options && c.options.length > 25) throw apiError(50035, 'options > 25');
      if (c.options) {
        const values = new Set(c.options.map((o) => o.value));
        if (values.size !== c.options.length) throw apiError(50035, 'duplicate option values');
      }
    }
  }
  return rows;
}

class FakeRole {
  constructor(guild, data) {
    this.guild = guild;
    this.id = data.id || nextId();
    this.name = data.name;
    this.color = data.colors?.primaryColor ?? 0;
    this.hoist = Boolean(data.hoist);
    this.mentionable = Boolean(data.mentionable);
    this.permissions = new PermissionsBitField(data.permissions ?? 0n);
    this.managed = Boolean(data.managed);
    this.position = data.position ?? 1;
    this.unicodeEmoji = data.unicodeEmoji ?? null;
  }

  get editable() {
    if (this.managed) return false;
    return this.guild.me.roles.highest.position > this.position;
  }

  async delete() {
    if (!this.editable) throw apiError(50013, 'Missing Permissions');
    this.guild.roles.cache.delete(this.id);
    this.guild.log.push(['roleDelete', this.name]);
    return this;
  }

  async setPermissions(bits) {
    this.permissions = new PermissionsBitField(bits);
    return this;
  }
}

class FakeMessage {
  constructor(channel, body) {
    this.id = nextId();
    this.channel = channel;
    this.embeds = body.embeds || [];
    this.components = body.components || [];
    this.content = body.content;
    this.thread = null;
  }

  async startThread({ name }) {
    if (!name || name.length > 100) throw apiError(50035, 'thread name');
    this.thread = { name };
    return this.thread;
  }
}

class FakeChannel {
  constructor(guild, data) {
    this.guild = guild;
    this.id = nextId();
    this.name = data.name;
    this.type = data.type ?? ChannelType.GuildText;
    this.topic = data.topic ?? null;
    this.nsfw = Boolean(data.nsfw);
    this.parentId = data.parent ?? null;
    this.rateLimitPerUser = data.rateLimitPerUser ?? 0;
    this.userLimit = data.userLimit ?? 0;
    // Tablica (jak dane wejściowe) + widok `cache` jak w discord.js (PermissionOverwriteManager).
    const overwrites = (data.permissionOverwrites || []).slice();
    Object.defineProperty(overwrites, 'cache', {
      get() {
        return new Collection(overwrites.map((o) => [o.id, {
          id: o.id,
          type: o.type ?? OverwriteType.Role,
          allow: new PermissionsBitField(o.allow ?? 0n),
          deny: new PermissionsBitField(o.deny ?? 0n),
        }]));
      },
    });
    this.permissionOverwrites = overwrites;
    this.availableTags = data.availableTags || [];
    this.position = guild.channels.cache.size;
    this.messages = [];
    this.threadsCreated = [];
    const channel = this;
    this.threads = {
      async create({ name, message }) {
        if (channel.type !== ChannelType.GuildForum) throw apiError(50024, 'not a forum');
        validateMessage(message);
        const thread = { name, message, pinned: false, async pin() { thread.pinned = true; } };
        channel.threadsCreated.push(thread);
        return thread;
      },
    };
  }

  get parent() {
    return this.parentId ? this.guild.channels.cache.get(this.parentId) : null;
  }

  isThread() {
    return false;
  }

  toString() {
    return `<#${this.id}>`;
  }

  async delete() {
    if (this.guild.protectedChannels.has(this.id)) throw apiError(50074, 'Cannot delete a channel required for Community Servers');
    this.guild.channels.cache.delete(this.id);
    this.guild.log.push(['channelDelete', this.name]);
    return this;
  }

  async send(body) {
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(this.type)) throw apiError(50008, 'Cannot send messages in a non-text channel');
    validateMessage(body);
    const msg = new FakeMessage(this, body);
    this.messages.push(msg);
    return msg;
  }

  async setType(type) {
    if (type === ChannelType.GuildAnnouncement && !this.guild.features.includes('COMMUNITY')) throw apiError(50024, 'community required');
    this.type = type;
    return this;
  }

  permissionsFor(member) {
    return member.permissionsIn?.(this) ?? new PermissionsBitField(0n);
  }
}

class FakeMember {
  constructor(guild, id, { roles = [], permissions = 0n } = {}) {
    this.guild = guild;
    this.id = id;
    this.user = { id, tag: `user${id}`, username: `User ${id}` };
    this.displayName = `User ${id}`;
    this.basePermissions = new PermissionsBitField(permissions);
    const member = this;
    this.roles = {
      cache: new Collection(roles.map((r) => [r, guild.roles.cache.get(r) || { id: r }])),
      get highest() {
        return [...this.cache.values()].reduce((a, b) => ((b.position ?? 0) > (a.position ?? 0) ? b : a), { position: 0 });
      },
      async add(roleOrIds) {
        const ids = [].concat(roleOrIds).map((r) => (typeof r === 'string' ? r : r.id));
        for (const id2 of ids) {
          const role = guild.roles.cache.get(id2);
          if (!role) throw apiError(10011, 'Unknown Role');
          this.cache.set(id2, role);
        }
        guild.log.push(['memberRoleAdd', member.id, ids.length]);
        return member;
      },
      async set(ids) {
        this.cache = new Collection(ids.map((id2) => [id2, guild.roles.cache.get(id2) || { id: id2 }]));
        guild.log.push(['memberRoleSet', member.id, ids.length]);
        return member;
      },
    };
  }

  get permissions() {
    let bits = this.basePermissions.bitfield;
    for (const role of this.roles.cache.values()) bits |= role.permissions?.bitfield ?? 0n;
    return new PermissionsBitField(bits);
  }

  permissionsIn(channel) {
    let bits = this.permissions.bitfield;
    if (bits & PermissionsBitField.Flags.Administrator) return new PermissionsBitField(PermissionsBitField.All);
    for (const o of channel.permissionOverwrites || []) {
      const applies = o.id === this.id || this.roles.cache.has(o.id) || o.id === this.guild.id;
      if (!applies) continue;
      bits &= ~BigInt(new PermissionsBitField(o.deny ?? 0n).bitfield);
      bits |= BigInt(new PermissionsBitField(o.allow ?? 0n).bitfield);
    }
    return new PermissionsBitField(bits);
  }
}

class FakeGuild {
  constructor({ name = 'Test Guild', ownerId = '1', community = false, features = [], existingChannels = 3, existingRoles = 3 } = {}) {
    this.id = nextId();
    this.name = name;
    this.ownerId = ownerId;
    this.features = community ? ['COMMUNITY', ...features] : [...features];
    this.log = [];
    this.protectedChannels = new Set();
    this.welcomeScreen = null;
    this.iconSet = null;
    this.settings = {};
    const guild = this;

    this.roles = {
      cache: new Collection(),
      async fetch() { return this.cache; },
      get everyone() { return this.cache.get(guild.id); },
      premiumSubscriberRole: null,
      async create(data) {
        if (!data.name || data.name.length > 100) throw apiError(50035, `role name invalid: ${data.name}`);
        if (this.cache.size >= 250) throw apiError(30005, 'Maximum number of guild roles reached (250)');
        if (data.unicodeEmoji && !guild.features.includes('ROLE_ICONS')) throw apiError(50101, 'role icons require boosts');
        if (data.unicodeEmoji) assertEmoji(data.unicodeEmoji, 'unicode_emoji');
        for (const r of this.cache.values()) if (r.id !== guild.id && r.position >= 1) r.position += 1;
        const role = new FakeRole(guild, { ...data, position: 1 });
        this.cache.set(role.id, role);
        guild.log.push(['roleCreate', role.name]);
        return role;
      },
      async setPositions(list) {
        for (const { role, position } of list) {
          const r = this.cache.get(role);
          if (r) r.position = position;
        }
        return guild;
      },
    };
    this.roles.cache.set(this.id, new FakeRole(this, { id: this.id, name: '@everyone', position: 0 }));
    const botRole = new FakeRole(this, { name: 'Kreator Serwera', managed: true, position: 1000, permissions: PermissionsBitField.Flags.Administrator });
    this.roles.cache.set(botRole.id, botRole);
    for (let i = 0; i < existingRoles; i += 1) {
      const r = new FakeRole(this, { name: `Stara rola ${i}`, position: 2 + i });
      this.roles.cache.set(r.id, r);
    }
    this.me = new FakeMember(this, 'bot', { roles: [botRole.id] });

    this.channels = {
      cache: new Collection(),
      async fetch() { return this.cache; },
      async create(data) {
        if (!data.name || data.name.length > 100) throw apiError(50035, `channel name invalid: ${data.name}`);
        if (this.cache.size >= 500) throw apiError(30013, 'Maximum number of guild channels reached (500)');
        const community = guild.features.includes('COMMUNITY');
        if ([ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice].includes(data.type) && !community) {
          throw apiError(50024, 'Community required');
        }
        if (data.parent) {
          const parent = this.cache.get(data.parent);
          if (!parent || parent.type !== ChannelType.GuildCategory) throw apiError(50035, 'invalid parent');
          const siblings = this.cache.filter((c) => c.parentId === data.parent).size;
          if (siblings >= 50) throw apiError(50035, 'category full');
        }
        if (data.topic && data.topic.length > (data.type === ChannelType.GuildForum ? 4096 : 1024)) throw apiError(50035, 'topic too long');
        assertEmoji(data.defaultReactionEmoji, 'default_reaction_emoji');
        if ((data.rateLimitPerUser ?? 0) > 21600) throw apiError(50035, 'slowmode too long');
        if ((data.userLimit ?? 0) > 99) throw apiError(50035, 'user limit too high');
        if (data.availableTags) {
          if (data.availableTags.length > 20) throw apiError(50035, 'too many tags');
          for (const t of data.availableTags) {
            if (!t.name || t.name.length > 20) throw apiError(50035, `tag name: ${t.name}`);
            assertEmoji(t.emoji, 'available_tags');
          }
        }
        for (const o of data.permissionOverwrites || []) {
          const known = o.id === guild.id || guild.roles.cache.has(o.id) || o.id === 'bot' || o.type === OverwriteType.Member;
          if (!known) throw apiError(50035, `unknown overwrite target ${o.id}`);
          for (const v of [o.allow, o.deny]) if (v !== undefined && typeof v !== 'bigint' && !Array.isArray(v)) throw apiError(50035, 'allow/deny must be bits');
        }
        if ((data.permissionOverwrites || []).length > 100) throw apiError(50035, 'too many overwrites');
        const channel = new FakeChannel(guild, data);
        this.cache.set(channel.id, channel);
        guild.log.push(['channelCreate', channel.name, data.type]);
        return channel;
      },
      async setPositions(list) {
        for (const { channel, position } of list) {
          const c = this.cache.get(channel);
          if (c) c.position = position;
        }
        guild.log.push(['channelPositions', list.length]);
        return guild;
      },
    };
    for (let i = 0; i < existingChannels; i += 1) {
      const c = new FakeChannel(this, { name: `stary-kanal-${i}`, type: ChannelType.GuildText });
      this.channels.cache.set(c.id, c);
    }

    this.autoModerationRules = {
      cache: new Collection(),
      async fetch() { return this.cache; },
      async create(data) {
        const tm = data.triggerMetadata || {};
        if (!data.name || data.name.length > 100) throw apiError(50035, 'rule name');
        if ((tm.keywordFilter || []).length > 1000) throw apiError(50035, 'too many keywords');
        for (const k of tm.keywordFilter || []) if (k.length > 60) throw apiError(50035, 'keyword too long');
        if ((tm.regexPatterns || []).length > 10) throw apiError(50035, 'too many regex');
        for (const r of tm.regexPatterns || []) if (r.length > 260) throw apiError(50035, 'regex too long');
        if ((data.exemptRoles || []).length > 20) throw apiError(50035, 'too many exempt roles');
        for (const a of data.actions) {
          if (a.metadata?.customMessage && a.metadata.customMessage.length > 150) throw apiError(50035, 'custom message too long');
          if (a.type === 3 && ![1, 5].includes(data.triggerType)) throw apiError(50035, 'timeout not allowed for this trigger');
        }
        if (data.triggerType === 6) {
          if (data.eventType !== 2) throw apiError(50035, 'member profile rules need MEMBER_UPDATE event');
          if (data.actions.some((x) => ![2, 4].includes(x.type))) throw apiError(50035, 'member profile rules allow only block interaction + alert');
        } else if (data.eventType !== 1 || data.actions.some((x) => x.type === 4)) {
          throw apiError(50035, 'message rules need MESSAGE_SEND and no block-interaction action');
        }
        if ([3, 4, 5, 6].includes(data.triggerType) && [...this.cache.values()].some((r) => r.triggerType === data.triggerType)) {
          throw apiError(30035, 'rule of this type already exists');
        }
        const rule = {
          id: nextId(),
          name: data.name,
          triggerType: data.triggerType,
          eventType: data.eventType,
          triggerMetadata: data.triggerMetadata || {},
          actions: data.actions.map((a) => ({ type: a.type, metadata: { ...a.metadata, channelId: a.metadata?.channel ?? a.metadata?.channelId } })),
          exemptRoles: new Collection((data.exemptRoles || []).map((rid) => [rid, guild.roles.cache.get(rid) || { id: rid }])),
          data,
          delete: async () => { this.cache.delete(rule.id); guild.log.push(['automodDelete', data.name]); },
        };
        this.cache.set(rule.id, rule);
        guild.log.push(['automodCreate', data.name]);
        return rule;
      },
    };

    // Prostsze menedżery: emoji, naklejki, zaproszenia, bany, wydarzenia.
    const manager = (kind) => ({
      cache: new Collection(),
      async fetch() { return new Collection(this.cache); },
      add(item) {
        const entry = { ...item, delete: async () => { this.cache.delete(entry.key); guild.log.push([`${kind}Delete`, entry.name ?? entry.key]); } };
        this.cache.set(entry.key, entry);
        return entry;
      },
    });
    this.emojis = manager('emoji');
    this.stickers = manager('sticker');
    this.invites = manager('invite');
    this.scheduledEvents = manager('event');
    this.bans = {
      cache: new Collection(),
      async fetch({ limit = 1000 } = {}) { return new Collection([...this.cache].slice(0, limit)); },
      async remove(userId) {
        if (!this.cache.has(userId)) throw apiError(10026, 'Unknown Ban');
        this.cache.delete(userId);
        guild.log.push(['unban', userId]);
      },
    };

    this.members = {
      cache: new Collection([['bot', this.me]]),
      get me() { return guild.me; },
      async fetchMe() { return guild.me; },
      async fetch(id) {
        if (!this.cache.has(id)) this.cache.set(id, new FakeMember(guild, id));
        return this.cache.get(id);
      },
    };
  }

  /** Dodaje emoji, naklejki, zaproszenia, bany i wydarzenia (do testów /usun). */
  seedExtras({ emojis = 0, managedEmojis = 0, stickers = 0, invites = 0, bans = 0, events = 0 } = {}) {
    for (let i = 0; i < emojis; i += 1) { const id = nextId(); this.emojis.add({ key: id, id, name: `emoji${i}`, managed: false }); }
    for (let i = 0; i < managedEmojis; i += 1) { const id = nextId(); this.emojis.add({ key: id, id, name: `twitch${i}`, managed: true }); }
    for (let i = 0; i < stickers; i += 1) { const id = nextId(); this.stickers.add({ key: id, id, name: `naklejka${i}` }); }
    for (let i = 0; i < invites; i += 1) this.invites.add({ key: `kod${i}`, code: `kod${i}` });
    for (let i = 0; i < events; i += 1) { const id = nextId(); this.scheduledEvents.add({ key: id, id, name: `Wydarzenie ${i}` }); }
    for (let i = 0; i < bans; i += 1) { const id = nextId(); this.bans.cache.set(id, { user: { id, tag: `zbanowany${i}` } }); }
    return this;
  }

  get verificationLevel() { return this.settings.verificationLevel ?? 0; }

  get explicitContentFilter() { return this.settings.explicitContentFilter ?? 0; }

  get defaultMessageNotifications() { return this.settings.defaultMessageNotifications ?? 1; }

  get systemChannelId() { return this.settings.systemChannel ?? null; }

  get afkChannelId() { return this.settings.afkChannel ?? null; }

  get afkTimeout() { return this.settings.afkTimeout ?? 300; }

  get rulesChannelId() { return this.features.includes('COMMUNITY') ? this.settings.rulesChannel ?? null : null; }

  get publicUpdatesChannelId() { return this.features.includes('COMMUNITY') ? this.settings.publicUpdatesChannel ?? null : null; }

  get preferredLocale() { return this.settings.preferredLocale ?? 'en-US'; }

  get description() { return this.settings.description ?? null; }

  get memberCount() { return 42; }

  iconURL() {
    return this.iconSet ? 'https://cdn.discordapp.com/icons/1/abc.png' : null;
  }

  async fetch() {
    return this;
  }

  async edit(data) {
    if (data.features) {
      if (data.features.includes('COMMUNITY') && !this.features.includes('COMMUNITY')) {
        if (!data.rulesChannel || !data.publicUpdatesChannel) throw apiError(50101, 'community requirements');
        if ((data.verificationLevel ?? this.settings.verificationLevel ?? 0) < 1) throw apiError(50101, 'verification too low');
        if ((data.explicitContentFilter ?? this.settings.explicitContentFilter ?? 0) !== 2) throw apiError(50101, 'content filter');
      }
      this.features = [...new Set(data.features)];
      if (!this.features.includes('COMMUNITY')) this.protectedChannels.clear();
    }
    if (data.description && !this.features.includes('COMMUNITY')) throw apiError(50035, 'description requires community');
    if (this.features.includes('COMMUNITY') && data.verificationLevel !== undefined && data.verificationLevel < 1) throw apiError(50101, 'community needs verification');
    if (data.name) this.name = data.name;
    Object.assign(this.settings, data);
    for (const key of ['rulesChannel', 'publicUpdatesChannel']) if (data[key]) this.protectedChannels.add(data[key]);
    this.log.push(['guildEdit', Object.keys(data).join(',')]);
    return this;
  }

  async setIcon(url) {
    this.iconSet = url;
    return this;
  }

  async editWelcomeScreen(data) {
    if (!this.features.includes('COMMUNITY')) throw apiError(50101, 'community required');
    if (data.welcomeChannels.length > 5) throw apiError(50035, 'too many welcome channels');
    for (const w of data.welcomeChannels) assertEmoji(w.emoji, 'welcome_channels');
    if (data.description && data.description.length > 140) throw apiError(50035, 'welcome description too long');
    this.welcomeScreen = data;
    return data;
  }
}

module.exports = { FakeGuild, FakeMember, FakeChannel, FakeRole, validateMessage, assertComponentEmojis, apiError };
