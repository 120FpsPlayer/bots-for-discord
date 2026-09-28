const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const db = require('./db');
const perms = require('./permissions');

const COLORS = {
  brand: config.brand.colorInt,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
  muted: 0x2b2d31,
};

const PRIORITIES = {
  low: { label: 'Niski', emoji: '🟢', color: 0x57f287 },
  normal: { label: 'Normalny', emoji: '🔵', color: 0x5865f2 },
  high: { label: 'Wysoki', emoji: '🟠', color: 0xf0b232 },
  urgent: { label: 'Pilny', emoji: '🔴', color: 0xed4245 },
};

function embed(color = COLORS.brand) {
  const e = new EmbedBuilder().setColor(color).setTimestamp();
  if (config.brand.footer) e.setFooter({ text: config.brand.footer });
  return e;
}

const ok = (description) => embed(COLORS.success).setDescription(`✅ ${description}`);
const fail = (description) => embed(COLORS.danger).setDescription(`❌ ${description}`);

async function reply(interaction, payload, ephemeral = true) {
  const data = typeof payload === 'string' ? { embeds: [ok(payload)] } : { ...payload };
  if (interaction.deferred && !interaction.replied) return interaction.editReply(data);
  if (ephemeral) data.flags = (data.flags ?? 0) | MessageFlags.Ephemeral;
  if (interaction.replied) return interaction.followUp(data);
  return interaction.reply(data);
}

const replyError = (interaction, text) => reply(interaction, { embeds: [fail(text)] });

function staffRoleIds(guildId, type) {
  return perms.ticketRoleIds(db.settings(guildId).staffRoleIds, type);
}

function isStaff(member, type = null) {
  if (!member) return false;
  return perms.isStaff(member, db.settings(member.guild.id).staffRoleIds, type);
}

const isAdmin = (member) => perms.isAdmin(member);

const renameHistory = new Map();
function canRename(channelId) {
  const now = Date.now();
  const recent = (renameHistory.get(channelId) ?? []).filter((t) => now - t < 10 * 60_000);
  renameHistory.set(channelId, recent);
  if (recent.length >= 2) return Math.ceil((10 * 60_000 - (now - recent[0])) / 60_000);
  return 0;
}
async function safeRename(channel, name) {
  const wait = canRename(channel.id);
  if (wait) return { ok: false, wait };
  renameHistory.get(channel.id).push(Date.now());
  await channel.setName(name);
  return { ok: true };
}

function slug(text, max = 20) {
  return (
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'user'
  );
}

const pad = (n) => String(n).padStart(4, '0');

function channelName(ticket, type) {
  const prio = ticket.priority && ticket.priority !== 'normal' ? PRIORITIES[ticket.priority].emoji : '';
  return (
    config.channelNameFormat
      .replace('{prio}', prio)
      .replace('{prefix}', type?.channelPrefix ?? 'ticket')
      .replace('{number}', pad(ticket.number))
      .replace('{user}', slug(ticket.ownerName ?? 'user', 16))
      .slice(0, 100) || `ticket-${pad(ticket.number)}`
  );
}

function workingStatus(now = new Date()) {
  const wh = config.workingHours;
  if (!wh?.enabled) return { open: true, text: null };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: wh.timezone ?? 'Europe/Warsaw',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const toMin = (s) => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1] ?? 0);
  const from = toMin(wh.from ?? '00:00');
  const to = toMin(wh.to ?? '23:59');
  const inHours = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  const open = (wh.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(day) && inHours;
  return {
    open,
    text: open
      ? `🟢 Support jest teraz dostępny (${wh.from}–${wh.to})`
      : `🌙 Jesteśmy poza godzinami pracy (${wh.from}–${wh.to}) – odpowiemy najszybciej, jak to możliwe`,
  };
}

function avgResponseTime(guildId) {
  const since = Date.now() - 30 * 86_400_000;
  const times = db
    .tickets((t) => t.guildId === guildId && t.firstResponseAt && t.createdAt >= since)
    .map((t) => t.firstResponseAt - t.createdAt);
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
}

function logEmbed(color, title, user) {
  const e = embed(color).setTitle(title);
  if (user) e.setAuthor({ name: user.tag ?? user.username ?? 'Użytkownik', iconURL: user.displayAvatarURL?.() });
  return e;
}

function duration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m || parts.length === 0) parts.push(`${m} min`);
  return parts.join(' ');
}

const ts = (date, style = 'f') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

async function sendLog(guild, payload) {
  const { logChannelId } = db.settings(guild.id);
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId) ?? (await guild.channels.fetch(logChannelId).catch(() => null));
  if (!channel?.isTextBased()) return;
  await channel.send(payload).catch((err) => console.warn('[log] Nie udało się wysłać logu:', err.message));
}

module.exports = {
  COLORS,
  PRIORITIES,
  embed,
  ok,
  fail,
  reply,
  replyError,
  isStaff,
  isAdmin,
  staffRoleIds,
  safeRename,
  slug,
  channelName,
  pad,
  workingStatus,
  avgResponseTime,
  logEmbed,
  duration,
  ts,
  sendLog,
};
