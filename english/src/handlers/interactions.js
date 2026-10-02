const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('../lib/config');
const db = require('../lib/db');
const t = require('../lib/tickets');
const { env } = require('../lib/permissions');
const { COLORS, embed, reply, replyError, isStaff, isAdmin, pad } = require('../lib/utils');

const ephemeral = { flags: MessageFlags.Ephemeral };

function resetSelectPanel(interaction, origin) {
  if (origin !== 's' || !interaction.message) return;
  interaction.message.edit(t.buildPanel(interaction.guild, 'select')).catch(() => null);
}

async function createAndRespond(interaction, type, origin, answers) {
  await interaction.deferReply(ephemeral);
  resetSelectPanel(interaction, origin);
  try {
    const channel = await t.openTicket(interaction.member, type, answers);
    await interaction.editReply({
      embeds: [
        embed(COLORS.success)
          .setTitle(`${type.emoji ?? '🎫'} Ticket created!`)
          .setDescription(`Your ticket is ready: ${channel}\nThe team has been notified – we'll reply as soon as possible.`),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Go to ticket').setEmoji('🎫').setURL(channel.url),
        ),
      ],
    });
  } catch (err) {
    if (!(err instanceof t.UserError)) console.error('[open]', err);
    await replyError(
      interaction,
      err instanceof t.UserError
        ? err.message
        : 'Failed to create the ticket. Make sure the bot has permission to manage channels and roles.',
    );
  }
}

async function handleOpen(interaction, typeId, origin) {
  const type = config.getType(typeId);
  if (!type) return replyError(interaction, 'This category no longer exists – ask the staff to refresh the panel.');

  const error = t.checkCanOpen(interaction.member);
  if (error) {
    resetSelectPanel(interaction, origin);
    return replyError(interaction, error);
  }
  if (type.questions.length) return interaction.showModal(t.buildForm(type, origin));
  return createAndRespond(interaction, type, origin, []);
}

async function handleForm(interaction, typeId, origin) {
  const type = config.getType(typeId);
  if (!type) return replyError(interaction, 'This category no longer exists.');
  const answers = type.questions.map((q) => ({
    label: q.label,
    value: interaction.fields.getTextInputValue(q.id)?.trim() ?? '',
  }));
  return createAndRespond(interaction, type, origin, answers);
}

function closeReasonModal() {
  return new ModalBuilder()
    .setCustomId('ticket:close_modal')
    .setTitle('🔒 Close ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Close reason')
          .setPlaceholder('E.g. issue resolved, no response…')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
}

async function handleTicketButton(interaction, action) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'This channel is no longer a ticket.');
  const type = config.getType(ticket.typeId);
  const staff = isStaff(member, type);
  const isOwner = ticket.ownerId === member.id;
  const canClose = staff || (isOwner && env.ownerCanClose);

  switch (action) {
    case 'close':
      if (!canClose) return replyError(interaction, 'You cannot close this ticket.');
      if (ticket.status !== 'open') return replyError(interaction, 'This ticket is already closed.');
      return reply(interaction, {
        embeds: [
          embed(COLORS.warning)
            .setTitle('❓ Close this ticket?')
            .setDescription('After closing, the author will lose access to the channel and the transcript will be saved.'),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('Yes, close it').setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket:close_reason').setLabel('Close with reason').setEmoji('📝').setStyle(ButtonStyle.Secondary),
          ),
        ],
      });

    case 'close_confirm':
      if (!canClose) return replyError(interaction, 'You cannot close this ticket.');
      await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Closing the ticket and saving the transcript…')], components: [] });
      await t.closeTicket(channel, member);
      return interaction.editReply({ embeds: [embed(COLORS.success).setDescription('✅ Ticket closed.')] }).catch(() => null);

    case 'close_reason':
      if (!canClose) return replyError(interaction, 'You cannot close this ticket.');
      return interaction.showModal(closeReasonModal());

    case 'claim':
      if (!staff) return replyError(interaction, 'Only staff members can claim tickets.');
      await interaction.deferReply(ephemeral);
      await t.claimTicket(channel, member);
      return reply(interaction, 'You claimed this ticket. Good luck! 💪');

    case 'unclaim':
      if (!staff) return replyError(interaction, 'Only staff members can do this.');
      await interaction.deferReply(ephemeral);
      await t.unclaimTicket(channel, member);
      return reply(interaction, 'You are no longer handling this ticket.');

    case 'ping':
      await interaction.deferReply(ephemeral);
      await t.pingStaff(channel, member);
      return reply(interaction, 'Support has been notified 🔔');

    case 'still':
      await interaction.deferReply(ephemeral);
      await t.stillNeedHelp(channel, member, interaction.message);
      return reply(interaction, 'Thanks! The ticket stays open.');

    case 'closereq_yes':
    case 'closereq_no':
      if (!isOwner && !staff) return replyError(interaction, 'Only the ticket author can answer this request.');
      if (!isOwner && action === 'closereq_no') return replyError(interaction, 'Only the author can decline this request.');
      await interaction.deferReply(ephemeral);
      await t.answerCloseRequest(channel, member, action === 'closereq_yes', interaction.message);
      return reply(interaction, action === 'closereq_yes' ? 'Ticket closed – thank you!' : 'Support has been notified that you still need help.');

    case 'reopen':
      if (!staff) return replyError(interaction, 'Only staff members can reopen tickets.');
      await interaction.deferReply(ephemeral);
      await t.reopenTicket(channel, member);
      await interaction.message.delete().catch(() => null);
      return reply(interaction, 'The ticket has been reopened.');

    case 'delete':
      if (!(env.staffCanDelete ? staff : isAdmin(member))) {
        return replyError(interaction, env.staffCanDelete ? 'Only staff members can delete tickets.' : 'Only administrators can delete tickets.');
      }
      await interaction.deferReply(ephemeral);
      await t.deleteTicket(channel, member);
      return reply(interaction, 'The ticket will be deleted in a moment.');

    case 'transcript': {
      if (!staff) return replyError(interaction, 'Transcripts are only available to staff members.');
      await interaction.deferReply(ephemeral);
      const { createTranscript } = require('../lib/transcript');
      const { attachment, messageCount } = await createTranscript(channel, ticket, type);
      return interaction.editReply({
        embeds: [embed(COLORS.info).setDescription(`📄 Current transcript of ticket \`#${pad(ticket.number)}\` · ${messageCount} messages`)],
        files: [attachment],
      });
    }
  }
}

async function handleManage(interaction) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'This channel is no longer a ticket.');
  if (!isStaff(member, config.getType(ticket.typeId))) {
    await t.refreshControlMessage(channel, ticket);
    return replyError(interaction, 'This menu is only available to staff members.');
  }
  await interaction.deferReply(ephemeral);
  const [kind, value] = interaction.values[0].split(':');
  try {
    if (kind === 'prio') {
      await t.setPriority(channel, value, member);
      return await reply(interaction, 'Priority changed.');
    }
    if (kind === 'move') {
      await t.moveTicket(channel, value, member);
      return await reply(interaction, 'The ticket has been moved.');
    }
    if (kind === 'closereq') {
      await t.requestClose(channel, member);
      await t.refreshControlMessage(channel, ticket);
      return await reply(interaction, 'Close request sent to the author.');
    }
  } catch (err) {
    await t.refreshControlMessage(channel, ticket);
    throw err;
  }
}

async function handleAddUser(interaction) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'This channel is no longer a ticket.');
  if (!isStaff(member, config.getType(ticket.typeId))) {
    await t.refreshControlMessage(channel, ticket);
    return replyError(interaction, 'Only staff members can add people.');
  }
  await interaction.deferReply(ephemeral);
  try {
    const count = await t.addUsers(channel, [...interaction.users.values()], member);
    return await reply(interaction, `Added ${count} ${count === 1 ? 'member' : 'members'}.`);
  } catch (err) {
    await t.refreshControlMessage(channel, ticket);
    throw err;
  }
}

function ratingModal(channelId, stars) {
  return new ModalBuilder()
    .setCustomId(`ratemodal:${channelId}:${stars}`)
    .setTitle(`Your rating: ${'⭐'.repeat(stars)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('Comment (optional)')
          .setPlaceholder('What went well, and what could we improve?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

async function handleRatingSubmit(interaction, channelId, stars) {
  const comment = interaction.fields.getTextInputValue('comment')?.trim();
  await t.saveRating(interaction.client, channelId, interaction.user.id, stars, comment);
  const thanks = embed(stars >= 4 ? COLORS.success : COLORS.brand)
    .setTitle(stars >= 4 ? '💙 Thanks for the great rating!' : '💙 Thanks for your rating!')
    .setDescription(
      `## ${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}\n` +
        (comment ? `>>> ${comment}` : '') +
        (stars <= 2 ? '\n\nWe\'re sorry something went wrong – we\'ll pass your feedback on to the team.' : ''),
    );
  if (interaction.isFromMessage()) {
    return interaction.update({ embeds: [...interaction.message.embeds, thanks], components: [] });
  }
  return reply(interaction, { embeds: [thanks] });
}

module.exports = async function handleInteraction(interaction, commands) {
  try {
    if (interaction.isAutocomplete()) {
      const command = commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    const [scope, action, ...args] = interaction.customId?.split(':') ?? [];

    if (interaction.isButton()) {
      if (scope === 'ticket' && action === 'open') return await handleOpen(interaction, args[0], 'b');
      if (scope === 'ticket') return await handleTicketButton(interaction, action);
      if (scope === 'rate') {
        const ticket = db.getTicket(action);
        if (ticket?.rating) return await replyError(interaction, 'This ticket has already been rated. Thank you!');
        return await interaction.showModal(ratingModal(action, Number(args[0])));
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket:open') return await handleOpen(interaction, interaction.values[0], 's');
      if (interaction.customId === 'ticket:manage') return await handleManage(interaction);
    }

    if (interaction.isUserSelectMenu() && interaction.customId === 'ticket:adduser') {
      return await handleAddUser(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (scope === 'ticket' && action === 'form') return await handleForm(interaction, args[0], args[1]);
      if (interaction.customId === 'ticket:close_modal') {
        const ticket = db.getTicket(interaction.channel.id);
        const type = ticket && config.getType(ticket.typeId);
        if (!ticket || (!isStaff(interaction.member, type) && !(ticket.ownerId === interaction.user.id && env.ownerCanClose))) {
          return await replyError(interaction, 'You cannot close this ticket.');
        }
        const reason = interaction.fields.getTextInputValue('reason');
        if (interaction.isFromMessage()) {
          await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Closing the ticket and saving the transcript…')], components: [] });
        } else {
          await interaction.deferReply(ephemeral);
        }
        await t.closeTicket(interaction.channel, interaction.member, reason);
        await interaction.editReply({ embeds: [embed(COLORS.success).setDescription('✅ Ticket closed.')] }).catch(() => null);
        return;
      }
      if (scope === 'ratemodal') return await handleRatingSubmit(interaction, action, Number(args[0]));
    }
  } catch (err) {
    if (interaction.isAutocomplete()) return;
    if (err instanceof t.UserError) return replyError(interaction, err.message).catch(() => null);
    console.error('[interakcja]', interaction.customId ?? interaction.commandName, err);
    return replyError(interaction, 'An unexpected error occurred. Please try again in a moment.').catch(() => null);
  }
};
