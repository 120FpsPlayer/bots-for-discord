const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { COLORS, embed, reply, isStaff, isAdmin } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List of ticket system commands')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const member = interaction.member;
    const e = embed(COLORS.brand)
      .setTitle('📖 Help – ticket system')
      .setDescription('To open a ticket, use the **ticket panel** on the server and pick a category.')
      .addFields({
        name: '👤 For everyone',
        value: [
          '`/ticket info` – ticket details',
          '`/ticket close` – close your ticket',
          '🔔 **Call support** – a button in the ticket for when you\'ve been waiting a long time',
        ].join('\n'),
      });
    if (isStaff(member)) {
      e.addFields({
        name: '🎧 Staff',
        value: [
          '`/ticket claim` · `/ticket unclaim` – handle a ticket',
          '`/ticket add` · `/ticket remove` – people in the ticket (or the menu in the ticket card)',
          '`/ticket priority` · `/ticket move` · `/ticket rename`',
          '`/ticket request-close` – the author confirms the issue is resolved',
          '`/reply` – canned replies',
          '`/blacklist` – blocks · `/stats` – statistics and leaderboard',
        ].join('\n'),
      });
    }
    if (isAdmin(member)) {
      e.addFields({
        name: '🛡️ Administration',
        value: ['`/setup auto` – automatic setup', '`/setup set` · `/setup show` · `/setup role-add`', '`/panel` – send the ticket panel'].join('\n'),
      });
    }
    return reply(interaction, { embeds: [e] });
  },
};
