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

/** Odpowiada na interakcję niezależnie od tego, czy była już potwierdzona. */
async function reply(interaction, payload, ephemeral = true) {
  const data = typeof payload === 'string' ? { embeds: [ok(payload)] } : payload;
  if (ephemeral) data.flags = MessageFlags.Ephemeral;
  if (interaction.deferred || interaction.replied) {
    if (interaction.deferred && !interaction.replied) return interaction.editReply(data);
    return interaction.followUp(data);
  }
  return interaction.reply(data);
}

const replyError = (interaction, text) => reply(interaction, { embeds: [fail(text)] });

/** Role z dostępem do ticketu: .env (admin + support) + /setup + config.json. */
function staffRoleIds(guildId, type) {
  return perms.ticketRoleIds(db.settings(guildId).staffRoleIds, type);
}

function isStaff(member, type = null) {
  if (!member) return false;
  return perms.isStaff(member, db.settings(member.guild.id).staffRoleIds, type);
}

const isAdmin = (member) => perms.isAdmin(member);

/**
 * Discord pozwala na 2 zmiany nazwy kanału na 10 minut. discord.js w takim
 * przypadku czeka w kolejce nawet 10 minut, blokując inne operacje na kanale –
 * dlatego sami pilnujemy limitu i odmawiamy zamiast wisieć.
 */
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

function channelName(ticket, type) {
  const prio = ticket.priority && ticket.priority !== 'normal' ? PRIORITIES[ticket.priority].emoji : '';
  const num = String(ticket.number).padStart(4, '0');
  return `${prio}${type?.channelPrefix ?? 'ticket'}-${num}`;
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
  duration,
  ts,
  sendLog,
};
