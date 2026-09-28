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
          .setTitle(`${type.emoji ?? '🎫'} Ticket utworzony!`)
          .setDescription(`Twój ticket jest gotowy: ${channel}\nZespół został powiadomiony – odpowiemy najszybciej, jak to możliwe.`),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Przejdź do ticketu').setEmoji('🎫').setURL(channel.url),
        ),
      ],
    });
  } catch (err) {
    if (!(err instanceof t.UserError)) console.error('[open]', err);
    await replyError(
      interaction,
      err instanceof t.UserError
        ? err.message
        : 'Nie udało się utworzyć ticketu. Sprawdź, czy bot ma uprawnienia do zarządzania kanałami i rolami.',
    );
  }
}

async function handleOpen(interaction, typeId, origin) {
  const type = config.getType(typeId);
  if (!type) return replyError(interaction, 'Ta kategoria już nie istnieje – poproś administrację o odświeżenie panelu.');

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
  if (!type) return replyError(interaction, 'Ta kategoria już nie istnieje.');
  const answers = type.questions.map((q) => ({
    label: q.label,
    value: interaction.fields.getTextInputValue(q.id)?.trim() ?? '',
  }));
  return createAndRespond(interaction, type, origin, answers);
}

function closeReasonModal() {
  return new ModalBuilder()
    .setCustomId('ticket:close_modal')
    .setTitle('🔒 Zamknij ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Powód zamknięcia')
          .setPlaceholder('Np. sprawa rozwiązana, brak odpowiedzi…')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
}

async function handleTicketButton(interaction, action) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'Ten kanał nie jest już ticketem.');
  const type = config.getType(ticket.typeId);
  const staff = isStaff(member, type);
  const isOwner = ticket.ownerId === member.id;
  const canClose = staff || (isOwner && env.ownerCanClose);

  switch (action) {
    case 'close':
      if (!canClose) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      if (ticket.status !== 'open') return replyError(interaction, 'Ten ticket jest już zamknięty.');
      return reply(interaction, {
        embeds: [
          embed(COLORS.warning)
            .setTitle('❓ Zamknąć ticket?')
            .setDescription('Po zamknięciu autor straci dostęp do kanału, a transkrypt zostanie zapisany.'),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('Tak, zamknij').setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket:close_reason').setLabel('Zamknij z powodem').setEmoji('📝').setStyle(ButtonStyle.Secondary),
          ),
        ],
      });

    case 'close_confirm':
      if (!canClose) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Zamykanie ticketu i zapisywanie transkryptu…')], components: [] });
      await t.closeTicket(channel, member);
      return interaction.editReply({ embeds: [embed(COLORS.success).setDescription('✅ Ticket zamknięty.')] }).catch(() => null);

    case 'close_reason':
      if (!canClose) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      return interaction.showModal(closeReasonModal());

    case 'claim':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może przejmować tickety.');
      await interaction.deferReply(ephemeral);
      await t.claimTicket(channel, member);
      return reply(interaction, 'Przejąłeś ten ticket. Powodzenia! 💪');

    case 'unclaim':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może to zrobić.');
      await interaction.deferReply(ephemeral);
      await t.unclaimTicket(channel, member);
      return reply(interaction, 'Nie obsługujesz już tego ticketu.');

    case 'ping':
      await interaction.deferReply(ephemeral);
      await t.pingStaff(channel, member);
      return reply(interaction, 'Support został powiadomiony 🔔');

    case 'still':
      await interaction.deferReply(ephemeral);
      await t.stillNeedHelp(channel, member, interaction.message);
      return reply(interaction, 'Dzięki! Ticket pozostaje otwarty.');

    case 'closereq_yes':
    case 'closereq_no':
      if (!isOwner && !staff) return replyError(interaction, 'Tylko autor ticketu może odpowiedzieć na tę prośbę.');
      if (!isOwner && action === 'closereq_no') return replyError(interaction, 'Tylko autor może odrzucić tę prośbę.');
      await interaction.deferReply(ephemeral);
      await t.answerCloseRequest(channel, member, action === 'closereq_yes', interaction.message);
      return reply(interaction, action === 'closereq_yes' ? 'Ticket zamknięty – dziękujemy!' : 'Support został powiadomiony, że nadal potrzebujesz pomocy.');

    case 'reopen':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może ponownie otworzyć ticket.');
      await interaction.deferReply(ephemeral);
      await t.reopenTicket(channel, member);
      await interaction.message.delete().catch(() => null);
      return reply(interaction, 'Ticket został ponownie otwarty.');

    case 'delete':
      if (!(env.staffCanDelete ? staff : isAdmin(member))) {
        return replyError(interaction, env.staffCanDelete ? 'Tylko zespół supportu może usuwać tickety.' : 'Tylko administratorzy mogą usuwać tickety.');
      }
      await interaction.deferReply(ephemeral);
      await t.deleteTicket(channel, member);
      return reply(interaction, 'Ticket zostanie za chwilę usunięty.');

    case 'transcript': {
      if (!staff) return replyError(interaction, 'Transkrypt jest dostępny tylko dla zespołu supportu.');
      await interaction.deferReply(ephemeral);
      const { createTranscript } = require('../lib/transcript');
      const { attachment, messageCount } = await createTranscript(channel, ticket, type);
      return interaction.editReply({
        embeds: [embed(COLORS.info).setDescription(`📄 Aktualny transkrypt ticketu \`#${pad(ticket.number)}\` · ${messageCount} wiadomości`)],
        files: [attachment],
      });
    }
  }
}

async function handleManage(interaction) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'Ten kanał nie jest już ticketem.');
  if (!isStaff(member, config.getType(ticket.typeId))) {
    await t.refreshControlMessage(channel, ticket);
    return replyError(interaction, 'To menu jest dostępne tylko dla zespołu supportu.');
  }
  await interaction.deferReply(ephemeral);
  const [kind, value] = interaction.values[0].split(':');
  try {
    if (kind === 'prio') {
      await t.setPriority(channel, value, member);
      return await reply(interaction, 'Zmieniono priorytet.');
    }
    if (kind === 'move') {
      await t.moveTicket(channel, value, member);
      return await reply(interaction, 'Ticket został przeniesiony.');
    }
    if (kind === 'closereq') {
      await t.requestClose(channel, member);
      await t.refreshControlMessage(channel, ticket);
      return await reply(interaction, 'Wysłano prośbę o zamknięcie do autora.');
    }
  } catch (err) {
    await t.refreshControlMessage(channel, ticket);
    throw err;
  }
}

async function handleAddUser(interaction) {
  const { channel, member } = interaction;
  const ticket = db.getTicket(channel.id);
  if (!ticket) return replyError(interaction, 'Ten kanał nie jest już ticketem.');
  if (!isStaff(member, config.getType(ticket.typeId))) {
    await t.refreshControlMessage(channel, ticket);
    return replyError(interaction, 'Tylko zespół supportu może dodawać osoby.');
  }
  await interaction.deferReply(ephemeral);
  try {
    const count = await t.addUsers(channel, [...interaction.users.values()], member);
    return await reply(interaction, `Dodano ${count} ${count === 1 ? 'osobę' : 'osoby'}.`);
  } catch (err) {
    await t.refreshControlMessage(channel, ticket);
    throw err;
  }
}

function ratingModal(channelId, stars) {
  return new ModalBuilder()
    .setCustomId(`ratemodal:${channelId}:${stars}`)
    .setTitle(`Twoja ocena: ${'⭐'.repeat(stars)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('Komentarz (opcjonalnie)')
          .setPlaceholder('Co poszło dobrze, a co możemy poprawić?')
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
    .setTitle(stars >= 4 ? '💙 Dziękujemy za świetną ocenę!' : '💙 Dziękujemy za ocenę!')
    .setDescription(
      `## ${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}\n` +
        (comment ? `>>> ${comment}` : '') +
        (stars <= 2 ? '\n\nPrzykro nam, że coś poszło nie tak – przekażemy Twoją opinię zespołowi.' : ''),
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
        if (ticket?.rating) return await replyError(interaction, 'Ten ticket został już oceniony. Dziękujemy!');
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
          return await replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
        }
        const reason = interaction.fields.getTextInputValue('reason');
        if (interaction.isFromMessage()) {
          await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Zamykanie ticketu i zapisywanie transkryptu…')], components: [] });
        } else {
          await interaction.deferReply(ephemeral);
        }
        await t.closeTicket(interaction.channel, interaction.member, reason);
        await interaction.editReply({ embeds: [embed(COLORS.success).setDescription('✅ Ticket zamknięty.')] }).catch(() => null);
        return;
      }
      if (scope === 'ratemodal') return await handleRatingSubmit(interaction, action, Number(args[0]));
    }
  } catch (err) {
    if (interaction.isAutocomplete()) return;
    if (err instanceof t.UserError) return replyError(interaction, err.message).catch(() => null);
    console.error('[interakcja]', interaction.customId ?? interaction.commandName, err);
    return replyError(interaction, 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie za chwilę.').catch(() => null);
  }
};
