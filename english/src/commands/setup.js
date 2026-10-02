const { SlashCommandBuilder, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const db = require('../lib/db');
const { embed, COLORS, reply, replyError, isAdmin } = require('../lib/utils');
const { env, ticketRoleIds } = require('../lib/permissions');

const PRIVATE = (guild, staffRoleIds) => [
  { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
  { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ManageChannels'] },
  ...staffRoleIds.map((id) => ({ id, allow: ['ViewChannel', 'ReadMessageHistory'] })),
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Ticket system configuration')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('auto')
        .setDescription('Automatically create the ticket categories and log/transcript channels')
        .addRoleOption((o) => o.setName('support_role').setDescription('The role of the team handling tickets').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set options manually (only fill in the ones you want to change)')
        .addChannelOption((o) =>
          o.setName('category').setDescription('Category for open tickets').addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) =>
          o
            .setName('closed_category')
            .setDescription('Category where closed tickets are moved')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) => o.setName('log_channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) =>
          o.setName('transcript_channel').setDescription('Transcript channel').addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((o) =>
          o.setName('limit').setDescription('Max open tickets per user (0 = no limit)').setMinValue(0).setMaxValue(25),
        )
        .addIntegerOption((o) =>
          o
            .setName('auto_close_hours')
            .setDescription('Close a ticket after this many hours without a reply from the author (0 = off)')
            .setMinValue(0)
            .setMaxValue(720),
        )
        .addIntegerOption((o) =>
          o
            .setName('warning_hours')
            .setDescription('Send a closing warning after this many hours (0 = off)')
            .setMinValue(0)
            .setMaxValue(720),
        )
        .addBooleanOption((o) => o.setName('ping_staff').setDescription('Mention the support role when a new ticket is opened?')),
    )
    .addSubcommand((s) =>
      s
        .setName('role-add')
        .setDescription('Add a support team role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('role-remove')
        .setDescription('Remove a support team role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('show').setDescription('Show the current configuration')),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) return replyError(interaction, 'Only bot administrators (OWNER_IDS / ADMIN_ROLE_IDS) can use this command.');
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'auto') {
      const role = interaction.options.getRole('support_role');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const staff = [...new Set([...db.settings(guild.id).staffRoleIds, role.id])];
      const everyoneHidden = [{ id: guild.roles.everyone.id, deny: ['ViewChannel'] }];

      const category = await guild.channels.create({
        name: '🎫 Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: everyoneHidden,
      });
      const closed = await guild.channels.create({
        name: '📁 Closed tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: everyoneHidden,
      });
      const logs = await guild.channels.create({
        name: 'ticket-logs',
        type: ChannelType.GuildText,
        parent: closed.id,
        permissionOverwrites: PRIVATE(guild, ticketRoleIds(staff).filter((id) => guild.roles.cache.has(id))),
      });
      const transcripts = await guild.channels.create({
        name: 'ticket-transcripts',
        type: ChannelType.GuildText,
        parent: closed.id,
        permissionOverwrites: PRIVATE(guild, ticketRoleIds(staff).filter((id) => guild.roles.cache.has(id))),
      });

      db.updateSettings(guild.id, {
        staffRoleIds: staff,
        categoryId: category.id,
        closedCategoryId: closed.id,
        logChannelId: logs.id,
        transcriptChannelId: transcripts.id,
      });

      return reply(interaction, {
        embeds: [
          embed(COLORS.success)
            .setTitle('✅ All set!')
            .setDescription(
              `Created:\n• ${category} – open tickets\n• ${closed} – closed tickets\n• ${logs} – logs\n• ${transcripts} – transcripts\n\n` +
                `Support role: ${role}\n\nNow run **/panel** in the channel where the ticket panel should appear.`,
            ),
        ],
      });
    }

    if (sub === 'set') {
      const o = interaction.options;
      const patch = {};
      const map = {
        category: ['categoryId', () => o.getChannel('category')?.id],
        closed_category: ['closedCategoryId', () => o.getChannel('closed_category')?.id],
        log_channel: ['logChannelId', () => o.getChannel('log_channel')?.id],
        transcript_channel: ['transcriptChannelId', () => o.getChannel('transcript_channel')?.id],
        limit: ['maxOpenTicketsPerUser', () => o.getInteger('limit')],
        auto_close_hours: ['autoCloseHours', () => o.getInteger('auto_close_hours')],
        warning_hours: ['autoCloseWarningHours', () => o.getInteger('warning_hours')],
        ping_staff: ['pingStaffOnOpen', () => o.getBoolean('ping_staff')],
      };
      for (const [, [key, get]] of Object.entries(map)) {
        const value = get();
        if (value !== undefined && value !== null) patch[key] = value;
      }
      if (Object.keys(patch).length === 0) return replyError(interaction, 'No options were provided to change.');
      db.updateSettings(guild.id, patch);
      return reply(interaction, { embeds: [summary(guild).setTitle('✅ Configuration saved')] });
    }

    if (sub === 'role-add' || sub === 'role-remove') {
      const role = interaction.options.getRole('role');
      const current = db.settings(guild.id).staffRoleIds;
      const next = sub === 'role-add' ? [...new Set([...current, role.id])] : current.filter((id) => id !== role.id);
      db.updateSettings(guild.id, { staffRoleIds: next });
      return reply(
        interaction,
        `${sub === 'role-add' ? 'Added' : 'Removed'} role ${role}. ` +
          '\n-# Permissions in already existing tickets are not changed automatically.',
      );
    }

    return reply(interaction, { embeds: [summary(guild)] });
  },
};

function summary(guild) {
  const s = db.settings(guild.id);
  const ch = (id) => (id ? `<#${id}>` : '*not set*');
  const roles = (list) => list.map((id) => `<@&${id}>`).join(', ') || '*none*';
  const yesNo = (v) => (v ? 'yes' : 'no');
  return embed(COLORS.info)
    .setTitle('⚙️ Ticket configuration')
    .addFields(
      { name: 'Ticket category', value: ch(s.categoryId), inline: true },
      { name: 'Closed category', value: ch(s.closedCategoryId), inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'Log channel', value: ch(s.logChannelId), inline: true },
      { name: 'Transcript channel', value: ch(s.transcriptChannelId), inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'Support roles (/setup)', value: roles(s.staffRoleIds) },
      { name: '👑 Bot owners (.env)', value: env.ownerIds.map((id) => `<@${id}>`).join(', ') || '*none*', inline: true },
      { name: '🛡️ Admin roles (.env)', value: roles(env.adminRoleIds), inline: true },
      { name: '🎧 Support roles (.env)', value: roles(env.supportRoleIds), inline: true },
      { name: '✅ Who can open tickets', value: env.openRoleIds.length ? roles(env.openRoleIds) : 'everyone', inline: true },
      { name: '⛔ Blocked roles', value: roles(env.blockedRoleIds), inline: true },
      {
        name: '🔧 Options',
        value:
          `Discord admins = bot admins: **${yesNo(env.discordAdminsAreAdmins)}**\n` +
          `Staff can delete: **${yesNo(env.staffCanDelete)}**\n` +
          `Author can close: **${yesNo(env.ownerCanClose)}**`,
        inline: true,
      },
      { name: 'Limit per user', value: s.maxOpenTicketsPerUser ? String(s.maxOpenTicketsPerUser) : 'no limit', inline: true },
      {
        name: 'Auto-close',
        value: s.autoCloseHours ? `after ${s.autoCloseHours} h (warning after ${s.autoCloseWarningHours} h)` : 'off',
        inline: true,
      },
      { name: 'Ping staff', value: yesNo(s.pingStaffOnOpen), inline: true },
    );
}
