const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const db = require('../lib/db');
const { COLORS, embed, reply, replyError, ts, isStaff } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Blokowanie użytkowników przed tworzeniem ticketów')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('dodaj')
        .setDescription('Zablokuj użytkownika')
        .addUserOption((o) => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
        .addStringOption((o) => o.setName('powod').setDescription('Powód').setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s
        .setName('usun')
        .setDescription('Odblokuj użytkownika')
        .addUserOption((o) => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Lista zablokowanych')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyError(interaction, 'Czarna lista jest dostępna tylko dla supportu i administracji.');
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'dodaj') {
      const user = interaction.options.getUser('uzytkownik');
      if (user.bot) return replyError(interaction, 'Nie można zablokować bota.');
      db.addBlacklist(guildId, {
        userId: user.id,
        reason: interaction.options.getString('powod'),
        by: interaction.user.id,
        at: Date.now(),
      });
      return reply(interaction, `${user} nie może już tworzyć ticketów.`);
    }

    if (sub === 'usun') {
      const user = interaction.options.getUser('uzytkownik');
      if (!db.removeBlacklist(guildId, user.id)) return replyError(interaction, `${user} nie jest zablokowany.`);
      return reply(interaction, `Odblokowano ${user}.`);
    }

    const list = db.blacklist(guildId);
    const lines = list
      .slice(-30)
      .map((b) => `• <@${b.userId}> – ${b.reason ?? 'brak powodu'} (przez <@${b.by}>, ${ts(b.at, 'd')})`);
    return reply(interaction, {
      embeds: [
        embed(COLORS.muted)
          .setTitle(`⛔ Czarna lista (${list.length})`)
          .setDescription(lines.join('\n') || 'Nikt nie jest zablokowany.'),
      ],
    });
  },
};
