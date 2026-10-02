const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const { buildPanel } = require('../lib/tickets');
const db = require('../lib/db');
const { reply, replyError, isAdmin } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send the panel for opening tickets')
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Target channel (defaults to the current one)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((o) =>
      o
        .setName('style')
        .setDescription('Panel layout')
        .addChoices(
          { name: 'Cards with buttons (up to 8 categories)', value: 'buttons' },
          { name: 'Dropdown list', value: 'select' },
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) return replyError(interaction, 'Only bot administrators (OWNER_IDS / ADMIN_ROLE_IDS) can use this command.');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const style = interaction.options.getString('style') ?? 'buttons';
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return replyError(interaction, `I don't have permission to send messages in ${channel}.`);
    }
    const message = await channel.send(buildPanel(interaction.guild, style));
    db.addPanel(interaction.guild.id, { channelId: channel.id, messageId: message.id, style });
    return reply(interaction, `The panel has been sent to ${channel}. Its stats will refresh automatically.`);
  },
};
