'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { isSafeSelfRole } = require('./guards');

const COOLDOWN_MS = 2500;
const cooldowns = new Map();

/**
 * Menu wyboru ról (customId: sr:<język>:<s|m>:<indeks>).
 * Zasada działania – przełącznik:
 *   • wybranie roli, której nie masz → dodaje ją,
 *   • wybranie roli, którą masz → usuwa ją,
 *   • w grupie „jedna rola” (s) nowa rola zastępuje poprzednią.
 * Wartości opcji to ID ról, więc handler nie potrzebuje żadnej bazy danych.
 */
async function handleSelfRoles(interaction) {
  const [, lang, mode] = interaction.customId.split(':');
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const { guild, member } = interaction;

  const last = cooldowns.get(member.id) || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return interaction.reply({ content: T('⏳ Chwilę… zbyt szybko zmieniasz role.', '⏳ Slow down a little.'), flags: MessageFlags.Ephemeral });
  }
  cooldowns.set(member.id, Date.now());

  const groupIds = (interaction.component?.options || []).map((o) => o.value);
  const picked = interaction.values.filter((v) => groupIds.includes(v));
  const current = new Set(member.roles.cache.keys());
  const added = [];
  const removed = [];
  const blocked = [];

  for (const roleId of picked) {
    const role = guild.roles.cache.get(roleId);
    if (!isSafeSelfRole(role)) { blocked.push(roleId); continue; }
    if (current.has(roleId)) {
      current.delete(roleId);
      removed.push(roleId);
    } else {
      if (mode === 's') {
        for (const other of groupIds) {
          if (other !== roleId && current.has(other) && isSafeSelfRole(guild.roles.cache.get(other))) {
            current.delete(other);
            removed.push(other);
          }
        }
      }
      current.add(roleId);
      added.push(roleId);
    }
  }

  if (added.length || removed.length) {
    await member.roles.set([...current], T('Panel wyboru ról', 'Self-role panel'));
  }

  // Odświeżamy wiadomość, żeby menu nie „pamiętało” zaznaczenia u użytkownika.
  await interaction.update({ components: interaction.message.components });

  const lines = [];
  if (added.length) lines.push(`➕ ${T('Dodano', 'Added')}: ${added.map((id) => `<@&${id}>`).join(', ')}`);
  if (removed.length) lines.push(`➖ ${T('Usunięto', 'Removed')}: ${removed.map((id) => `<@&${id}>`).join(', ')}`);
  if (blocked.length) lines.push(`⚠️ ${T('Tych ról nie mogę nadać', 'I cannot assign')}: ${blocked.map((id) => `<@&${id}>`).join(', ')}`);
  if (!lines.length) lines.push(T('Bez zmian – nie wybrano żadnej roli.', 'No changes – nothing was selected.'));
  lines.push(`\n*${T('Wybierz rolę ponownie, aby ją usunąć.', 'Pick a role again to remove it.')}*`);

  return interaction.followUp({
    embeds: [new EmbedBuilder().setColor(added.length ? 0x57f287 : removed.length ? 0xfee75c : 0x2b2d31).setDescription(lines.join('\n'))],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

module.exports = { handleSelfRoles, cooldowns };
