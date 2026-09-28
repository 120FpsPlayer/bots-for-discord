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
const { COLORS, embed, reply, replyError, isStaff, isAdmin } = require('../lib/utils');
const { env } = require('../lib/permissions');

// ───────────────────────── otwieranie ticketu ─────────────────────────

/**
 * Potwierdza interakcję. Przy panelu z listą rozwijaną „odświeżamy" wiadomość,
 * żeby wybór w menu się zresetował i dało się wybrać tę samą kategorię ponownie.
 */
async function ack(interaction, origin) {
  const fromSelect = origin === 's' && (interaction.isStringSelectMenu() || interaction.isFromMessage?.());
  if (fromSelect) {
    await interaction.update({ components: interaction.message.components });
    return (payload) => interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return (payload) => interaction.editReply(payload);
}

async function createAndRespond(interaction, type, origin, answers) {
  const respond = await ack(interaction, origin);
  try {
    const channel = await t.openTicket(interaction.member, type, answers);
    await respond({
      embeds: [embed(COLORS.success).setDescription(`✅ Twój ticket został utworzony: ${channel}`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Przejdź do ticketu').setEmoji('🎫').setURL(channel.url),
        ),
      ],
    });
  } catch (err) {
    if (!(err instanceof t.UserError)) console.error('[open]', err);
    await respond({
      embeds: [
        embed(COLORS.danger).setDescription(
          `❌ ${err instanceof t.UserError ? err.message : 'Nie udało się utworzyć ticketu. Sprawdź, czy bot ma uprawnienia do zarządzania kanałami i rolami.'}`,
        ),
      ],
    });
  }
}

async function handleOpen(interaction, typeId, origin) {
  const type = config.getType(typeId);
  if (!type) return replyError(interaction, 'Ta kategoria już nie istnieje – poproś administrację o odświeżenie panelu.');

  const error = t.checkCanOpen(interaction.member);
  if (error) return replyError(interaction, error);

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

// ───────────────────────── przyciski w tickecie ─────────────────────────

function closeReasonModal() {
  return new ModalBuilder()
    .setCustomId('ticket:close_modal')
    .setTitle('Zamknij ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Powód zamknięcia')
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
  const isOwner = ticket.ownerId === member.id && env.ownerCanClose;

  switch (action) {
    case 'close': {
      if (!staff && !isOwner) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      if (ticket.status !== 'open') return replyError(interaction, 'Ten ticket jest już zamknięty.');
      return reply(interaction, {
        embeds: [embed(COLORS.warning).setDescription('❓ Czy na pewno chcesz zamknąć ten ticket?')],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('Tak, zamknij').setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket:close_reason').setLabel('Zamknij z powodem').setEmoji('📝').setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    }
    case 'close_confirm': {
      if (!staff && !isOwner) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Zamykanie ticketu…')], components: [] });
      return t.closeTicket(channel, member);
    }
    case 'close_reason':
      if (!staff && !isOwner) return replyError(interaction, 'Nie możesz zamknąć tego ticketu.');
      return interaction.showModal(closeReasonModal());
    case 'claim':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może przejmować tickety.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await t.claimTicket(channel, member);
      return reply(interaction, 'Przejąłeś ten ticket.');
    case 'unclaim':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może to zrobić.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await t.unclaimTicket(channel, member);
      return reply(interaction, 'Nie obsługujesz już tego ticketu.');
    case 'reopen':
      if (!staff) return replyError(interaction, 'Tylko zespół supportu może ponownie otworzyć ticket.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await t.reopenTicket(channel, member);
      await interaction.message.edit({ components: [] }).catch(() => null);
      return reply(interaction, 'Ticket został ponownie otwarty.');
    case 'delete':
      if (!(env.staffCanDelete ? staff : isAdmin(member))) {
        return replyError(interaction, env.staffCanDelete ? 'Tylko zespół supportu może usuwać tickety.' : 'Tylko administratorzy mogą usuwać tickety.');
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await t.deleteTicket(channel, member);
      await interaction.message.edit({ components: [] }).catch(() => null);
      return reply(interaction, 'Ticket zostanie za chwilę usunięty.');
    case 'transcript': {
      if (!staff) return replyError(interaction, 'Transkrypt jest dostępny tylko dla zespołu supportu.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { createTranscript } = require('../lib/transcript');
      const { attachment } = await createTranscript(channel, ticket, type);
      return interaction.editReply({ content: '📄 Aktualny transkrypt ticketu:', files: [attachment] });
    }
  }
}

// ───────────────────────── oceny (w DM) ─────────────────────────

function ratingModal(channelId, stars) {
  return new ModalBuilder()
    .setCustomId(`ratemodal:${channelId}:${stars}`)
    .setTitle(`Ocena: ${'⭐'.repeat(stars)}`)
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
  const thanks = embed(COLORS.success)
    .setTitle('💙 Dziękujemy za ocenę!')
    .setDescription(`Twoja ocena: ${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}${comment ? `\n> ${comment.replace(/\n/g, '\n> ')}` : ''}`);
  if (interaction.isFromMessage()) {
    return interaction.update({ embeds: [...interaction.message.embeds, thanks], components: [] });
  }
  return reply(interaction, { embeds: [thanks] });
}

// ───────────────────────── router ─────────────────────────

module.exports = async function handleInteraction(interaction, commands) {
  try {
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

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:open') {
      return await handleOpen(interaction, interaction.values[0], 's');
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
          await interaction.update({ embeds: [embed(COLORS.muted).setDescription('⏳ Zamykanie ticketu…')], components: [] });
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        await t.closeTicket(interaction.channel, interaction.member, reason);
        if (interaction.deferred && !interaction.replied) await interaction.editReply({ content: '🔒 Ticket zamknięty.' });
        return;
      }
      if (scope === 'ratemodal') return await handleRatingSubmit(interaction, action, Number(args[0]));
    }
  } catch (err) {
    if (err instanceof t.UserError) return replyError(interaction, err.message).catch(() => null);
    console.error('[interakcja]', interaction.customId ?? interaction.commandName, err);
    return replyError(interaction, 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie za chwilę.').catch(() => null);
  }
};
