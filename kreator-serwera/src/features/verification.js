'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { isSafeSelfRole } = require('./guards');

/**
 * Przycisk „Zweryfikuj się” (customId: vf:<język>:<idRoli>).
 * Działa bez bazy danych – wszystko, czego potrzebuje, jest w customId.
 */
async function handleVerification(interaction) {
  const [, lang, roleId] = interaction.customId.split(':');
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const reply = (description, color) => interaction.reply({
    embeds: [new EmbedBuilder().setColor(color).setDescription(description)],
    flags: MessageFlags.Ephemeral,
  });

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return reply(T('❌ Rola weryfikacyjna nie istnieje. Poinformuj administrację serwera.', '❌ The verification role no longer exists. Please tell the staff.'), 0xed4245);
  }
  if (!isSafeSelfRole(role)) {
    return reply(T('❌ Nie mogę nadać tej roli (jest powyżej mojej roli lub ma uprawnienia moderacyjne). Poinformuj administrację.', '❌ I cannot assign this role (it is above my role or has moderation permissions). Please tell the staff.'), 0xed4245);
  }
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    return reply(T('✅ Jesteś już zweryfikowany – miłego pobytu!', '✅ You are already verified – enjoy your stay!'), 0x57f287);
  }
  await member.roles.add(role, T('Weryfikacja przyciskiem', 'Button verification'));
  return reply(
    T(`🎉 **Witaj na serwerze, ${member.displayName}!**\nWeryfikacja zakończona – masz już dostęp do wszystkich kanałów.`,
      `🎉 **Welcome, ${member.displayName}!**\nYou are verified and can now see all channels.`),
    0x57f287,
  );
}

module.exports = { handleVerification };
