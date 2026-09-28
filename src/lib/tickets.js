const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits: P,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('./config');
const db = require('./db');
const { createTranscript } = require('./transcript');
const {
  COLORS,
  PRIORITIES,
  embed,
  staffRoleIds,
  safeRename,
  channelName,
  duration,
  ts,
  sendLog,
} = require('./utils');

/** Błąd, którego treść można bezpiecznie pokazać użytkownikowi. */
class UserError extends Error {}

const OWNER_PERMS = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'AddReactions'];
const STAFF_PERMS = [...OWNER_PERMS, 'ManageMessages'];
const BOT_PERMS = [...STAFF_PERMS, 'ManageChannels'];
const allow = (perms) => Object.fromEntries(perms.map((p) => [p, true]));

const creating = new Set(); // blokada podwójnego kliknięcia

const button = (id, label, emoji, style) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

// ───────────────────────────── panel ─────────────────────────────

function buildPanel(style = 'buttons') {
  const e = embed(COLORS.brand)
    .setTitle(config.panel.title)
    .setDescription(
      `${config.panel.description}\n\n` +
        config.ticketTypes.map((t) => `${t.emoji ?? '🎫'} **${t.label}**${t.description ? ` — ${t.description}` : ''}`).join('\n'),
    );
  if (config.panel.image) e.setImage(config.panel.image);
  if (config.brand.name) e.setAuthor({ name: config.brand.name });

  const rows = [];
  if (style === 'select') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:open')
          .setPlaceholder('📂 Wybierz kategorię zgłoszenia…')
          .addOptions(
            config.ticketTypes.map((t) => ({
              label: t.label,
              value: t.id,
              description: t.description?.slice(0, 100),
              emoji: t.emoji,
            })),
          ),
      ),
    );
  } else {
    const buttons = config.ticketTypes.map((t) =>
      new ButtonBuilder()
        .setCustomId(`ticket:open:${t.id}`)
        .setLabel(t.label)
        .setEmoji(t.emoji ?? '🎫')
        .setStyle(ButtonStyle.Secondary),
    );
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return { embeds: [e], components: rows };
}

function buildForm(type, origin) {
  const modal = new ModalBuilder().setCustomId(`ticket:form:${type.id}:${origin}`).setTitle(`${type.label}`.slice(0, 45));
  for (const q of type.questions) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false)
      .setMaxLength(Math.min(q.maxLength ?? 1000, 4000));
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    if (q.minLength) input.setMinLength(q.minLength);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

// ───────────────────────────── otwieranie ─────────────────────────────

function checkCanOpen(member) {
  const settings = db.settings(member.guild.id);
  const category = member.guild.channels.cache.get(settings.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return 'System ticketów nie jest jeszcze skonfigurowany. Administrator musi użyć komendy `/setup ustaw`.';
  }
  if (db.isBlacklisted(member.guild.id, member.id)) {
    const entry = db.blacklist(member.guild.id).find((b) => b.userId === member.id);
    return `Masz blokadę na tworzenie ticketów.${entry?.reason ? `\n**Powód:** ${entry.reason}` : ''}`;
  }
  const open = db.tickets((t) => t.guildId === member.guild.id && t.ownerId === member.id && t.status === 'open');
  if (settings.maxOpenTicketsPerUser > 0 && open.length >= settings.maxOpenTicketsPerUser) {
    return `Osiągnięto limit otwartych ticketów (**${settings.maxOpenTicketsPerUser}**). Twoje tickety: ${open
      .map((t) => `<#${t.channelId}>`)
      .join(', ')}`;
  }
  return null;
}

function ticketEmbed(ticket, type) {
  const prio = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const e = embed(prio.color)
    .setTitle(`${type?.emoji ?? '🎫'} ${type?.label ?? 'Ticket'} · #${String(ticket.number).padStart(4, '0')}`)
    .setDescription(
      `Witaj <@${ticket.ownerId}>! 👋\nZespół odpowie najszybciej, jak to możliwe. ` +
        'W międzyczasie możesz dopisać szczegóły lub dodać zrzuty ekranu.\n\n' +
        'Aby zamknąć zgłoszenie, kliknij **🔒 Zamknij**.',
    )
    .addFields(
      { name: '👤 Autor', value: `<@${ticket.ownerId}>`, inline: true },
      { name: `${prio.emoji} Priorytet`, value: prio.label, inline: true },
      { name: '🙋 Przejęty przez', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
    );
  for (const a of ticket.answers ?? []) {
    e.addFields({ name: a.label, value: (a.value || '—').slice(0, 1024) });
  }
  return e;
}

function controlRow(ticket) {
  return new ActionRowBuilder().addComponents(
    button('ticket:close', 'Zamknij', '🔒', ButtonStyle.Danger),
    ticket.claimedBy
      ? button('ticket:unclaim', 'Odpuść', '↩️', ButtonStyle.Secondary)
      : button('ticket:claim', 'Przejmij', '🙋', ButtonStyle.Success),
    button('ticket:transcript', 'Transkrypt', '📄', ButtonStyle.Secondary),
  );
}

async function refreshControlMessage(channel, ticket) {
  if (!ticket.controlMessageId) return;
  const msg = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (!msg) return;
  await msg
    .edit({ embeds: [ticketEmbed(ticket, config.getType(ticket.typeId))], components: [controlRow(ticket)] })
    .catch(() => null);
}

async function openTicket(member, type, answers = []) {
  const guild = member.guild;
  const key = `${guild.id}:${member.id}`;
  if (creating.has(key)) throw new UserError('Twój ticket jest właśnie tworzony, chwilka…');

  const error = checkCanOpen(member);
  if (error) throw new UserError(error);

  creating.add(key);
  try {
    const settings = db.settings(guild.id);
    const staffRoles = staffRoleIds(guild.id, type).filter((id) => guild.roles.cache.has(id));
    const number = db.nextTicketNumber(guild.id);
    const draft = { number, priority: 'normal' };

    const channel = await guild.channels.create({
      name: channelName(draft, type),
      type: ChannelType.GuildText,
      parent: settings.categoryId,
      topic: `Ticket #${number} · ${type.label} · ${member.user.tag} (${member.id})`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: guild.members.me.id, allow: BOT_PERMS },
        { id: member.id, allow: OWNER_PERMS },
        ...staffRoles.map((id) => ({ id, allow: STAFF_PERMS })),
      ],
      reason: `Ticket #${number} otwarty przez ${member.user.tag}`,
    });

    const now = Date.now();
    const ticket = db.createTicket({
      channelId: channel.id,
      guildId: guild.id,
      number,
      typeId: type.id,
      ownerId: member.id,
      status: 'open',
      priority: 'normal',
      claimedBy: null,
      participants: [],
      answers,
      createdAt: now,
      lastActivity: now,
      lastMessageBy: 'owner',
      firstResponseAt: null,
      warned: false,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      rating: null,
      transcriptUrl: null,
      controlMessageId: null,
    });

    const pings = settings.pingStaffOnOpen ? staffRoles.map((id) => `<@&${id}>`).join(' ') : '';
    const msg = await channel.send({
      content: `${member} ${pings}`.trim(),
      embeds: [ticketEmbed(ticket, type)],
      components: [controlRow(ticket)],
      allowedMentions: { users: [member.id], roles: settings.pingStaffOnOpen ? staffRoles : [] },
    });
    db.updateTicket(channel.id, { controlMessageId: msg.id });
    await msg.pin().catch(() => null);

    await sendLog(guild, {
      embeds: [
        embed(COLORS.success)
          .setTitle('📥 Otwarto ticket')
          .addFields(
            { name: 'Ticket', value: `${channel} (#${number})`, inline: true },
            { name: 'Typ', value: `${type.emoji ?? ''} ${type.label}`, inline: true },
            { name: 'Autor', value: `${member} \`${member.id}\``, inline: true },
          ),
      ],
    });

    return channel;
  } finally {
    creating.delete(key);
  }
}

// ───────────────────────────── transkrypt ─────────────────────────────

async function archiveTranscript(channel, ticket, actor) {
  const type = config.getType(ticket.typeId);
  const { attachment, messageCount, participants } = await createTranscript(channel, ticket, type);
  const settings = db.settings(channel.guild.id);

  const summary = embed(COLORS.info)
    .setTitle(`📄 Transkrypt · ${channel.name}`)
    .addFields(
      { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
      { name: 'Typ', value: type?.label ?? ticket.typeId, inline: true },
      { name: 'Przejęty przez', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
      { name: 'Zamknięty przez', value: actor ? `<@${actor.id}>` : '—', inline: true },
      { name: 'Czas trwania', value: duration(Date.now() - ticket.createdAt), inline: true },
      { name: 'Wiadomości', value: `${messageCount} (uczestników: ${participants.size})`, inline: true },
    );
  if (ticket.closeReason) summary.addFields({ name: 'Powód zamknięcia', value: ticket.closeReason.slice(0, 1024) });

  const target = settings.transcriptChannelId
    ? await channel.guild.channels.fetch(settings.transcriptChannelId).catch(() => null)
    : null;
  if (target?.isTextBased()) {
    const sent = await target.send({ embeds: [summary], files: [attachment] }).catch(() => null);
    const url = sent?.attachments.first()?.url;
    if (url) db.updateTicket(channel.id, { transcriptUrl: url });
  }
  return { attachment, summary };
}

// ───────────────────────────── zamykanie ─────────────────────────────

function ratingRow(channelId) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`rate:${channelId}:${n}`)
        .setLabel(String(n))
        .setEmoji('⭐')
        .setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
}

async function closeTicket(channel, actor, reason = null) {
  const ticket = db.getTicket(channel.id);
  if (!ticket) throw new UserError('To nie jest kanał ticketu.');
  if (ticket.status !== 'open') throw new UserError('Ten ticket jest już zamknięty.');

  const settings = db.settings(channel.guild.id);
  db.updateTicket(channel.id, {
    status: 'closed',
    closedAt: Date.now(),
    closedBy: actor.id,
    closeReason: reason,
  });

  // odbierz dostęp autorowi i dodanym osobom
  for (const id of [ticket.ownerId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(id, { ViewChannel: false, SendMessages: false }).catch(() => null);
  }
  if (settings.closedCategoryId && channel.guild.channels.cache.has(settings.closedCategoryId)) {
    await channel.setParent(settings.closedCategoryId, { lockPermissions: false }).catch(() => null);
  }

  await channel.send({
    embeds: [
      embed(COLORS.danger)
        .setTitle('🔒 Ticket zamknięty')
        .setDescription(`Zamknięty przez <@${actor.id}>${reason ? `\n**Powód:** ${reason}` : ''}`),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        button('ticket:reopen', 'Otwórz ponownie', '🔓', ButtonStyle.Success),
        button('ticket:transcript', 'Transkrypt', '📄', ButtonStyle.Secondary),
        button('ticket:delete', 'Usuń', '🗑️', ButtonStyle.Danger),
      ),
    ],
  });

  let transcript = null;
  try {
    transcript = await archiveTranscript(channel, ticket, actor);
  } catch (err) {
    console.error('[transkrypt] Błąd generowania:', err);
  }

  // wiadomość prywatna do autora
  const owner = await channel.client.users.fetch(ticket.ownerId).catch(() => null);
  if (owner && (config.defaults.dmTranscript || config.defaults.askForRating)) {
    const dm = embed(COLORS.brand)
      .setTitle(`🎫 Twój ticket na ${channel.guild.name} został zamknięty`)
      .setDescription(
        `**Ticket:** #${String(ticket.number).padStart(4, '0')} (${config.getType(ticket.typeId)?.label ?? ticket.typeId})` +
          `${reason ? `\n**Powód:** ${reason}` : ''}` +
          (config.defaults.askForRating ? '\n\n**Jak oceniasz obsługę?** Kliknij liczbę gwiazdek poniżej.' : ''),
      );
    await owner
      .send({
        embeds: [dm],
        files: config.defaults.dmTranscript && transcript ? [transcript.attachment] : [],
        components: config.defaults.askForRating ? [ratingRow(channel.id)] : [],
      })
      .catch(() => null); // użytkownik ma zablokowane DM
  }

  await sendLog(channel.guild, {
    embeds: [
      embed(COLORS.danger)
        .setTitle('🔒 Zamknięto ticket')
        .addFields(
          { name: 'Ticket', value: `${channel} (#${ticket.number})`, inline: true },
          { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
          { name: 'Zamknął', value: `<@${actor.id}>`, inline: true },
          { name: 'Powód', value: reason?.slice(0, 1024) || '—' },
        ),
    ],
  });
}

async function reopenTicket(channel, actor) {
  const ticket = db.getTicket(channel.id);
  if (!ticket) throw new UserError('To nie jest kanał ticketu.');
  if (ticket.status !== 'closed') throw new UserError('Ten ticket nie jest zamknięty.');

  const settings = db.settings(channel.guild.id);
  if (settings.closedCategoryId && channel.parentId !== settings.categoryId) {
    await channel.setParent(settings.categoryId, { lockPermissions: false }).catch(() => null);
  }
  for (const id of [ticket.ownerId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(id, allow(OWNER_PERMS)).catch(() => null);
  }
  db.updateTicket(channel.id, {
    status: 'open',
    closedAt: null,
    closedBy: null,
    closeReason: null,
    lastActivity: Date.now(),
    lastMessageBy: 'staff',
    warned: false,
  });

  await channel.send({
    content: `<@${ticket.ownerId}>`,
    embeds: [embed(COLORS.success).setDescription(`🔓 Ticket został ponownie otwarty przez <@${actor.id}>.`)],
  });
  await sendLog(channel.guild, {
    embeds: [
      embed(COLORS.success)
        .setTitle('🔓 Ponownie otwarto ticket')
        .addFields(
          { name: 'Ticket', value: `${channel} (#${ticket.number})`, inline: true },
          { name: 'Przez', value: `<@${actor.id}>`, inline: true },
        ),
    ],
  });
}

async function deleteTicket(channel, actor) {
  const ticket = db.getTicket(channel.id);
  if (!ticket) throw new UserError('To nie jest kanał ticketu.');
  if (ticket.status === 'deleted') throw new UserError('Ten ticket jest już usuwany.');

  // jeśli ticket nie był zamknięty, zachowaj transkrypt przed usunięciem
  if (ticket.status === 'open') {
    db.updateTicket(channel.id, { closedAt: Date.now(), closedBy: actor.id, closeReason: 'Usunięty bez zamykania' });
    await archiveTranscript(channel, ticket, actor).catch((err) => console.error('[transkrypt]', err));
  }
  db.updateTicket(channel.id, { status: 'deleted', deletedAt: Date.now(), deletedBy: actor.id });

  const delay = config.defaults.deleteDelaySeconds ?? 5;
  await channel.send({ embeds: [embed(COLORS.danger).setDescription(`🗑️ Kanał zostanie usunięty za **${delay} s**…`)] });
  await sendLog(channel.guild, {
    embeds: [
      embed(COLORS.muted)
        .setTitle('🗑️ Usunięto ticket')
        .addFields(
          { name: 'Ticket', value: `#${channel.name} (#${ticket.number})`, inline: true },
          { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
          { name: 'Usunął', value: `<@${actor.id}>`, inline: true },
          ...(ticket.transcriptUrl ? [{ name: 'Transkrypt', value: `[Pobierz](${ticket.transcriptUrl})` }] : []),
        ),
    ],
  });
  setTimeout(() => channel.delete(`Ticket usunięty przez ${actor.user?.tag ?? actor.tag ?? actor.id}`).catch(() => null), delay * 1000);
}

// ───────────────────────────── zarządzanie ─────────────────────────────

async function claimTicket(channel, member) {
  const ticket = requireOpen(channel);
  if (ticket.claimedBy === member.id) throw new UserError('Już obsługujesz ten ticket.');
  if (ticket.claimedBy && !member.permissions.has(P.Administrator)) {
    throw new UserError(`Ten ticket obsługuje już <@${ticket.claimedBy}>.`);
  }
  db.updateTicket(channel.id, { claimedBy: member.id });
  await refreshControlMessage(channel, ticket);
  await channel.send({ embeds: [embed(COLORS.success).setDescription(`🙋 ${member} przejmuje ten ticket i zajmie się Twoim zgłoszeniem.`)] });
  await sendLog(channel.guild, {
    embeds: [embed(COLORS.info).setTitle('🙋 Przejęto ticket').setDescription(`${member} przejął ${channel} (#${ticket.number})`)],
  });
}

async function unclaimTicket(channel, member) {
  const ticket = requireOpen(channel);
  if (!ticket.claimedBy) throw new UserError('Ten ticket nie jest przez nikogo przejęty.');
  if (ticket.claimedBy !== member.id && !member.permissions.has(P.Administrator)) {
    throw new UserError('Tylko osoba obsługująca ticket (lub administrator) może go odpuścić.');
  }
  db.updateTicket(channel.id, { claimedBy: null });
  await refreshControlMessage(channel, ticket);
  await channel.send({ embeds: [embed(COLORS.warning).setDescription(`↩️ ${member} przestał obsługiwać ten ticket.`)] });
}

async function addUser(channel, user, actor) {
  const ticket = requireOpen(channel);
  if (user.bot) throw new UserError('Nie możesz dodać bota.');
  if (user.id === ticket.ownerId || ticket.participants.includes(user.id)) {
    throw new UserError(`${user} ma już dostęp do tego ticketu.`);
  }
  await channel.permissionOverwrites.edit(user.id, allow(OWNER_PERMS));
  db.updateTicket(channel.id, { participants: [...ticket.participants, user.id] });
  await channel.send({ embeds: [embed(COLORS.success).setDescription(`➕ ${actor} dodał ${user} do ticketu.`)] });
}

async function removeUser(channel, user, actor) {
  const ticket = requireOpen(channel);
  if (user.id === ticket.ownerId) throw new UserError('Nie można usunąć autora ticketu.');
  if (!ticket.participants.includes(user.id)) throw new UserError(`${user} nie jest dodany do tego ticketu.`);
  await channel.permissionOverwrites.delete(user.id);
  db.updateTicket(channel.id, { participants: ticket.participants.filter((id) => id !== user.id) });
  await channel.send({ embeds: [embed(COLORS.warning).setDescription(`➖ ${actor} usunął ${user} z ticketu.`)] });
}

async function setPriority(channel, level, actor) {
  const ticket = requireOpen(channel);
  if (!PRIORITIES[level]) throw new UserError('Nieznany priorytet.');
  db.updateTicket(channel.id, { priority: level });
  await refreshControlMessage(channel, ticket);
  const renamed = await safeRename(channel, channelName(ticket, config.getType(ticket.typeId))).catch(() => ({ ok: false }));
  const p = PRIORITIES[level];
  await channel.send({
    embeds: [
      embed(p.color).setDescription(
        `${p.emoji} ${actor} ustawił priorytet na **${p.label}**.` +
          (renamed.ok ? '' : renamed.wait ? `\n-# Nazwa kanału zaktualizuje się przy następnej zmianie (limit Discorda, ~${renamed.wait} min).` : ''),
      ),
    ],
  });
}

async function renameTicket(channel, name) {
  requireOpen(channel);
  const result = await safeRename(channel, name);
  if (!result.ok) throw new UserError(`Discord pozwala zmienić nazwę kanału 2 razy na 10 minut. Spróbuj za ~${result.wait} min.`);
}

function requireOpen(channel) {
  const ticket = db.getTicket(channel.id);
  if (!ticket) throw new UserError('Tej akcji można użyć tylko na kanale ticketu.');
  if (ticket.status !== 'open') throw new UserError('Ten ticket jest zamknięty.');
  return ticket;
}

// ───────────────────────────── oceny ─────────────────────────────

async function saveRating(client, channelId, userId, stars, comment) {
  const ticket = db.getTicket(channelId);
  if (!ticket || ticket.ownerId !== userId) throw new UserError('Nie możesz ocenić tego ticketu.');
  if (ticket.rating) throw new UserError('Ten ticket został już oceniony. Dziękujemy!');
  db.updateTicket(channelId, { rating: { stars, comment: comment || null, at: Date.now() } });

  const guild = client.guilds.cache.get(ticket.guildId);
  if (guild) {
    await sendLog(guild, {
      embeds: [
        embed(stars >= 4 ? COLORS.success : stars === 3 ? COLORS.warning : COLORS.danger)
          .setTitle('⭐ Nowa ocena obsługi')
          .setDescription(`${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)} (**${stars}/5**)`)
          .addFields(
            { name: 'Ticket', value: `#${ticket.number}`, inline: true },
            { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
            { name: 'Obsługiwał', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
            ...(comment ? [{ name: 'Komentarz', value: comment.slice(0, 1024) }] : []),
          ),
      ],
    });
  }
}

// ───────────────────────────── auto-zamykanie ─────────────────────────────

/**
 * Zamyka tickety, w których zespół odpowiedział, a autor milczy zbyt długo.
 * Ticket czekający na odpowiedź zespołu NIGDY nie jest zamykany automatycznie.
 */
async function runInactivityCheck(client) {
  const now = Date.now();
  for (const ticket of db.tickets((t) => t.status === 'open')) {
    const guild = client.guilds.cache.get(ticket.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(ticket.channelId);
    if (!channel) {
      db.updateTicket(ticket.channelId, { status: 'deleted', deletedAt: now });
      continue;
    }
    const settings = db.settings(guild.id);
    if (!settings.autoCloseHours || settings.autoCloseHours <= 0) continue;
    if (ticket.lastMessageBy !== 'staff') continue;

    const idle = now - ticket.lastActivity;
    const closeAfter = settings.autoCloseHours * 3_600_000;
    const warnAfter = settings.autoCloseWarningHours * 3_600_000;

    try {
      if (idle >= closeAfter) {
        await closeTicket(channel, client.user, `Automatyczne zamknięcie – brak odpowiedzi od ${duration(idle)}`);
      } else if (warnAfter > 0 && warnAfter < closeAfter && idle >= warnAfter && !ticket.warned) {
        db.updateTicket(ticket.channelId, { warned: true });
        await channel.send({
          content: `<@${ticket.ownerId}>`,
          embeds: [
            embed(COLORS.warning)
              .setTitle('⏰ Czy potrzebujesz jeszcze pomocy?')
              .setDescription(`Jeśli nie odpowiesz, ticket zostanie automatycznie zamknięty ${ts(ticket.lastActivity + closeAfter, 'R')}.`),
          ],
        });
      }
    } catch (err) {
      console.error(`[auto-close] ticket ${ticket.channelId}:`, err.message);
    }
  }
}

module.exports = {
  UserError,
  buildPanel,
  buildForm,
  checkCanOpen,
  openTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  claimTicket,
  unclaimTicket,
  addUser,
  removeUser,
  setPriority,
  renameTicket,
  archiveTranscript,
  saveRating,
  runInactivityCheck,
};
