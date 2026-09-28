const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const { buildPanel } = require('../lib/tickets');
const db = require('../lib/db');
const { reply, replyError, isAdmin } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Wyślij panel do otwierania ticketów')
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((o) =>
      o
        .setName('kanal')
        .setDescription('Kanał docelowy (domyślnie bieżący)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((o) =>
      o
        .setName('styl')
        .setDescription('Wygląd panelu')
        .addChoices(
          { name: 'Karty z przyciskami (do 8 kategorii)', value: 'buttons' },
          { name: 'Lista rozwijana', value: 'select' },
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) return replyError(interaction, 'Tę komendę mogą używać tylko administratorzy bota (OWNER_IDS / ADMIN_ROLE_IDS).');
    const channel = interaction.options.getChannel('kanal') ?? interaction.channel;
    const style = interaction.options.getString('styl') ?? 'buttons';
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return replyError(interaction, `Nie mam uprawnień do wysyłania wiadomości na ${channel}.`);
    }
    const message = await channel.send(buildPanel(interaction.guild, style));
    db.addPanel(interaction.guild.id, { channelId: channel.id, messageId: message.id, style });
    return reply(interaction, `Panel został wysłany na ${channel}. Statystyki na panelu będą odświeżać się automatycznie.`);
  },
};
