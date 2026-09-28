const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('./config');
const db = require('./db');
const ui = require('./ui');
const { createTranscript } = require('./transcript');
const { openDeniedReason } = require('./permissions');
const {
  COLORS,
  PRIORITIES,
  embed,
  logEmbed,
  staffRoleIds,
  isAdmin,
  safeRename,
  channelName,
  duration,
  pad,
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
const lastOpened = new Map(); // anty-spam: guildId:userId -> timestamp

const D = config.defaults;

// ───────────────────────────── panel ─────────────────────────────

const buildPanel = (guild, style) => ui.panelPayload(guild, style);

/** Odświeża wszystkie panele jednego serwera (statystyki, godziny pracy). */
async function refreshGuildPanels(guild) {
  for (const panel of db.panels(guild.id)) {
    const channel = guild.channels.cache.get(panel.channelId);
    if (!channel) {
      db.removePanel(guild.id, panel.messageId);
      continue;
    }
    const message = await channel.messages.fetch(panel.messageId).catch((e) => (e.code === 10008 ? null : undefined));
    if (message === null) {
      db.removePanel(guild.id, panel.messageId); // panel został usunięty
      continue;
    }
    if (!message) continue;
    await message
      .edit(buildPanel(guild, panel.style))
      .catch((err) => console.warn(`[panel] Nie udało się odświeżyć panelu w #${channel.name}:`, err.message));
  }
}

/** Odświeża panele na wszystkich serwerach (wywoływane cyklicznie). */
async function refreshPanels(client) {
  for (const guildId of db.allGuildIds()) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await refreshGuildPanels(guild);
  }
}

/**
 * Odświeża panele chwilę po zmianie (otwarcie, zamknięcie, pierwsza odpowiedź).
 * Kilka zmian w krótkim czasie = jedno odświeżenie.
 */
const panelTimers = new Map();
function schedulePanelRefresh(guild) {
  if (!guild || panelTimers.has(guild.id)) return;
  panelTimers.set(
    guild.id,
    setTimeout(() => {
      panelTimers.delete(guild.id);
      refreshGuildPanels(guild).catch((err) => console.warn('[panel]', err.message));
    }, 3000),
  );
}

function buildForm(type, origin) {
  const modal = new ModalBuilder().setCustomId(`ticket:form:${type.id}:${origin}`).setTitle(`${type.emoji ?? ''} ${type.label}`.trim().slice(0, 45));
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
    return 'System ticketów nie jest jeszcze skonfigurowany. Administrator musi użyć komendy `/setup auto` lub `/setup ustaw`.';
  }
  const roleError = openDeniedReason(member);
  if (roleError) return roleError;
  if (db.isBlacklisted(member.guild.id, member.id)) {
    const entry = db.blacklist(member.guild.id).find((b) => b.userId === member.id);
    return `Masz blokadę na tworzenie ticketów.${entry?.reason ? `\n**Powód:** ${entry.reason}` : ''}`;
  }
  const open = db.tickets((t) => t.guildId === member.guild.id && t.ownerId === member.id && t.status === 'open');
  if (settings.maxOpenTicketsPerUser > 0 && open.length >= settings.maxOpenTicketsPerUser) {
    return `Osiągnięto limit otwartych ticketów (**${settings.maxOpenTicketsPerUser}**).\nTwoje tickety: ${open
      .map((t) => `<#${t.channelId}>`)
      .join(', ')}`;
  }
  const cooldown = (D.openCooldownSeconds ?? 0) * 1000;
  const last = lastOpened.get(`${member.guild.id}:${member.id}`);
  if (cooldown && last && Date.now() - last < cooldown && !isAdmin(member)) {
    return `Zwolnij trochę! Kolejny ticket możesz otworzyć ${ts(last + cooldown, 'R')}.`;
  }
  return null;
}

/** Buduje przypiętą kartę ticketu z aktualnymi danymi. */
async function renderCard(guild, ticket, pingRoles = []) {
  const ownerUser = await guild.client.users.fetch(ticket.ownerId).catch(() => null);
  const ownerMember = await guild.members.fetch(ticket.ownerId).catch(() => null);
  const previousCount = db.tickets(
    (t) => t.guildId === guild.id && t.ownerId === ticket.ownerId && t.channelId !== ticket.channelId,
  ).length;
  return ui.ticketCard(ticket, config.getType(ticket.typeId), { ownerUser, ownerMember, pingRoles, previousCount });
}

async function refreshControlMessage(channel, ticket) {
  if (!ticket.controlMessageId) return;
  const msg = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (!msg) return;
  const payload = await renderCard(channel.guild, ticket);
  delete payload.allowedMentions; // edycja i tak nikogo nie oznacza
  await msg.edit(payload).catch((err) => console.warn('[karta] Nie udało się odświeżyć:', err.message));
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
    const draft = { number, priority: 'normal', ownerName: member.user.username };

    const channel = await guild.channels.create({
      name: channelName(draft, type),
      type: ChannelType.GuildText,
      parent: settings.categoryId,
      topic: `${type.emoji ?? '🎫'} ${type.label} · #${pad(number)} · ${member.user.tag} (${member.id})`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: guild.members.me.id, allow: BOT_PERMS },
        { id: member.id, allow: OWNER_PERMS },
        ...staffRoles.map((id) => ({ id, allow: STAFF_PERMS })),
      ],
      reason: `Ticket #${number} otwarty przez ${member.user.tag}`,
    });

    const now = Date.now();
    lastOpened.set(key, now);
    const ticket = db.createTicket({
      channelId: channel.id,
      guildId: guild.id,
      number,
      typeId: type.id,
      ownerId: member.id,
      ownerName: member.user.username,
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
      lastStaffPing: null,
      closeRequest: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      rating: null,
      transcriptUrl: null,
      controlMessageId: null,
    });

    const pings = settings.pingStaffOnOpen ? staffRoles : [];
    const msg = await channel.send(await renderCard(guild, ticket, pings));
    db.updateTicket(channel.id, { controlMessageId: msg.id });
    schedulePanelRefresh(guild);
    await msg.pin().catch(() => null);

    if (D.dmOnOpen) {
      await member
        .send({
          embeds: [
            embed(COLORS.success)
              .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
              .setTitle(`${type.emoji ?? '🎫'} Twój ticket został utworzony`)
              .setDescription(
                `**Kategoria:** ${type.label}\n**Numer:** \`#${pad(number)}\`\n\n` +
                  'Zespół odpowie najszybciej, jak to możliwe. Powiadomimy Cię, gdy ticket zostanie zamknięty.',
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(channel.url).setLabel('Przejdź do ticketu').setEmoji('🎫'),
            ),
          ],
        })
        .catch(() => null);
    }

    await sendLog(guild, {
      embeds: [
        logEmbed(COLORS.success, '📥 Otwarto ticket', member.user)
          .setThumbnail(member.user.displayAvatarURL())
          .addFields(
            { name: 'Ticket', value: `${channel}\n\`#${pad(number)}\``, inline: true },
            { name: 'Kategoria', value: `${type.emoji ?? ''} ${type.label}`, inline: true },
            { name: 'Autor', value: `${member}\n\`${member.id}\``, inline: true },
            ...answers.slice(0, 3).map((a) => ({ name: a.label, value: (a.value || '—').slice(0, 300) })),
          ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(channel.url).setLabel('Przejdź').setEmoji('🎫'),
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
  const owner = await channel.client.users.fetch(ticket.ownerId).catch(() => null);

  const summary = logEmbed(COLORS.info, `📄 Transkrypt · #${channel.name}`, owner)
    .addFields(
      { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
      { name: 'Kategoria', value: `${type?.emoji ?? ''} ${type?.label ?? ticket.typeId}`, inline: true },
      { name: 'Obsługiwał', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
      { name: 'Zamknął', value: actor ? `<@${actor.id}>` : '—', inline: true },
      { name: 'Czas trwania', value: duration(Date.now() - ticket.createdAt), inline: true },
      { name: 'Wiadomości', value: `${messageCount} · ${participants.size} os.`, inline: true },
    );
  if (ticket.closeReason) summary.addFields({ name: 'Powód zamknięcia', value: ticket.closeReason.slice(0, 1024) });

  let url = null;
  const target = settings.transcriptChannelId
    ? await channel.guild.channels.fetch(settings.transcriptChannelId).catch(() => null)
    : null;
  if (target?.isTextBased()) {
    const sent = await target.send({ embeds: [summary], files: [attachment] }).catch(() => null);
    url = sent?.attachments.first()?.url ?? null;
    if (url) db.updateTicket(channel.id, { transcriptUrl: url });
  }
  return { attachment, messageCount, url };
}

// ───────────────────────────── zamykanie ─────────────────────────────

function ratingRow(channelId) {
  const labels = ['Słabo', 'Tak sobie', 'OK', 'Dobrze', 'Świetnie'];
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`rate:${channelId}:${n}`)
        .setLabel(`${n} · ${labels[n - 1]}`)
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
    closeRequest: null,
  });

  schedulePanelRefresh(channel.guild);

  let transcript = null;
  try {
    transcript = await archiveTranscript(channel, ticket, actor);
  } catch (err) {
    console.error('[transkrypt] Błąd generowania:', err);
  }

  // odbierz dostęp autorowi i dodanym osobom
  for (const id of [ticket.ownerId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(id, { ViewChannel: false, SendMessages: false }).catch(() => null);
  }
  if (settings.closedCategoryId && channel.guild.channels.cache.has(settings.closedCategoryId)) {
    await channel.setParent(settings.closedCategoryId, { lockPermissions: false }).catch(() => null);
  }

  await refreshControlMessage(channel, ticket);
  await channel.send(ui.closedCard(ticket, actor.id, { messageCount: transcript?.messageCount, transcriptUrl: transcript?.url }));

  // wiadomość prywatna do autora
  const owner = await channel.client.users.fetch(ticket.ownerId).catch(() => null);
  const type = config.getType(ticket.typeId);
  if (owner && (D.dmTranscript || D.askForRating)) {
    const dm = embed(COLORS.brand)
      .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() ?? undefined })
      .setTitle('🔒 Twój ticket został zamknięty')
      .setDescription(
        `Dziękujemy za kontakt, **${owner.globalName ?? owner.username}**! 💙` +
          (D.askForRating ? '\n\n**Jak oceniasz obsługę?** Kliknij ocenę poniżej – to zajmie 5 sekund i bardzo nam pomoże.' : ''),
      )
      .addFields(
        { name: 'Ticket', value: `\`#${pad(ticket.number)}\``, inline: true },
        { name: 'Kategoria', value: `${type?.emoji ?? ''} ${type?.label ?? ticket.typeId}`, inline: true },
        { name: 'Czas trwania', value: duration(ticket.closedAt - ticket.createdAt), inline: true },
        { name: 'Obsługiwał', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
        { name: 'Zamknął', value: `<@${actor.id}>`, inline: true },
      );
    if (reason) dm.addFields({ name: 'Powód', value: reason.slice(0, 1024) });
    if (D.dmTranscript && transcript) dm.addFields({ name: '📄 Transkrypt', value: 'W załączniku – otwórz plik w przeglądarce.' });
    await owner
      .send({
        embeds: [dm],
        files: D.dmTranscript && transcript ? [transcript.attachment] : [],
        components: D.askForRating ? [ratingRow(channel.id)] : [],
      })
      .catch(() => null); // użytkownik ma zablokowane DM
  }

  const links = [];
  if (transcript?.url) links.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(transcript.url).setLabel('Transkrypt').setEmoji('📄'));
  links.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(channel.url).setLabel('Kanał').setEmoji('🎫'));
  await sendLog(channel.guild, {
    embeds: [
      logEmbed(COLORS.danger, '🔒 Zamknięto ticket', owner)
        .addFields(
          { name: 'Ticket', value: `${channel}\n\`#${pad(ticket.number)}\``, inline: true },
          { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
          { name: 'Zamknął', value: `<@${actor.id}>`, inline: true },
          { name: 'Obsługiwał', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
          { name: 'Czas trwania', value: duration(ticket.closedAt - ticket.createdAt), inline: true },
          { name: 'Wiadomości', value: String(transcript?.messageCount ?? '—'), inline: true },
          { name: 'Powód', value: reason?.slice(0, 1024) || '—' },
        ),
    ],
    components: [new ActionRowBuilder().addComponents(links)],
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
  await refreshControlMessage(channel, ticket);
  schedulePanelRefresh(channel.guild);

  await channel.send(
    ui.notice(COLORS.success, `## 🔓 Ticket ponownie otwarty\n<@${ticket.ownerId}>, <@${actor.id}> ponownie otworzył Twoje zgłoszenie.`, {
      mentions: { users: [ticket.ownerId] },
    }),
  );
  await sendLog(channel.guild, {
    embeds: [
      logEmbed(COLORS.success, '🔓 Ponownie otwarto ticket', actor.user ?? actor).addFields(
        { name: 'Ticket', value: `${channel} (\`#${pad(ticket.number)}\`)`, inline: true },
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
  schedulePanelRefresh(channel.guild);

  const delay = D.deleteDelaySeconds ?? 5;
  await channel.send(
    ui.notice(COLORS.danger, `🗑️ **Ticket zostanie usunięty ${ts(Date.now() + delay * 1000, 'R')}**\n-# Transkrypt został zapisany.`),
  );
  await sendLog(channel.guild, {
    embeds: [
      logEmbed(COLORS.muted, '🗑️ Usunięto ticket', actor.user ?? actor).addFields(
        { name: 'Ticket', value: `#${channel.name} (\`#${pad(ticket.number)}\`)`, inline: true },
        { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
        { name: 'Usunął', value: `<@${actor.id}>`, inline: true },
      ),
    ],
    components: ticket.transcriptUrl
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(ticket.transcriptUrl).setLabel('Transkrypt').setEmoji('📄'),
          ),
        ]
      : [],
  });
  setTimeout(() => channel.delete(`Ticket usunięty przez ${actor.user?.tag ?? actor.tag ?? actor.id}`).catch(() => null), delay * 1000);
}

// ───────────────────────────── prośba o zamknięcie ─────────────────────────────

async function requestClose(channel, staff) {
  const ticket = requireOpen(channel);
  if (ticket.closeRequest) throw new UserError('Prośba o zamknięcie już czeka na odpowiedź autora.');
  const msg = await channel.send(ui.closeRequestCard(ticket, staff.id));
  db.updateTicket(channel.id, { closeRequest: { by: staff.id, messageId: msg.id, at: Date.now() }, lastMessageBy: 'staff', lastActivity: Date.now() });
}

async function answerCloseRequest(channel, member, accepted, message) {
  const ticket = requireOpen(channel);
  if (!ticket.closeRequest) throw new UserError('Ta prośba jest już nieaktualna.');
  await message.edit(ui.closeRequestCard(ticket, ticket.closeRequest.by, accepted ? 'accepted' : 'denied')).catch(() => null);
  const by = ticket.closeRequest.by;
  db.updateTicket(channel.id, { closeRequest: null });
  if (accepted) {
    await closeTicket(channel, member, 'Autor potwierdził rozwiązanie sprawy');
  } else {
    db.updateTicket(channel.id, { lastMessageBy: 'owner', lastActivity: Date.now(), warned: false });
    await channel.send(ui.notice(COLORS.warning, `🔔 <@${by}>, autor nadal potrzebuje pomocy.`, { mentions: { users: [by] } }));
  }
}

// ───────────────────────────── zarządzanie ─────────────────────────────

async function claimTicket(channel, member) {
  const ticket = requireOpen(channel);
  if (ticket.claimedBy === member.id) throw new UserError('Już obsługujesz ten ticket.');
  if (ticket.claimedBy && !isAdmin(member)) throw new UserError(`Ten ticket obsługuje już <@${ticket.claimedBy}>.`);
  const previous = ticket.claimedBy;
  db.updateTicket(channel.id, { claimedBy: member.id });
  await refreshControlMessage(channel, ticket);
  await channel.send(
    ui.notice(
      COLORS.success,
      `### 🙋 ${member.displayName} zajmie się Twoim zgłoszeniem\n<@${ticket.ownerId}>, od teraz Twoim ticketem opiekuje się ${member}.` +
        (previous ? `\n-# Przejęte od <@${previous}>` : ''),
      { thumbnail: member.displayAvatarURL({ size: 128 }) },
    ),
  );
  await sendLog(channel.guild, {
    embeds: [logEmbed(COLORS.info, '🙋 Przejęto ticket', member.user).setDescription(`${member} przejął ${channel} (\`#${pad(ticket.number)}\`)`)],
  });
}

async function unclaimTicket(channel, member) {
  const ticket = requireOpen(channel);
  if (!ticket.claimedBy) throw new UserError('Ten ticket nie jest przez nikogo przejęty.');
  if (ticket.claimedBy !== member.id && !isAdmin(member)) {
    throw new UserError('Tylko osoba obsługująca ticket (lub administrator) może go odpuścić.');
  }
  db.updateTicket(channel.id, { claimedBy: null });
  await refreshControlMessage(channel, ticket);
  await channel.send(ui.notice(COLORS.warning, `↩️ ${member} przestał obsługiwać ten ticket – czeka na nową osobę z supportu.`));
}

async function addUsers(channel, users, actor) {
  const ticket = requireOpen(channel);
  const added = [];
  for (const user of users) {
    if (user.bot || user.id === ticket.ownerId || ticket.participants.includes(user.id)) continue;
    await channel.permissionOverwrites.edit(user.id, allow(OWNER_PERMS));
    ticket.participants.push(user.id);
    added.push(user.id);
  }
  if (!added.length) throw new UserError('Wybrane osoby mają już dostęp do ticketu (lub są botami).');
  db.updateTicket(channel.id, { participants: ticket.participants });
  await refreshControlMessage(channel, ticket);
  await channel.send(
    ui.notice(COLORS.success, `➕ ${actor} dodał do ticketu: ${added.map((id) => `<@${id}>`).join(', ')}`, { mentions: { users: added } }),
  );
  return added.length;
}

const addUser = (channel, user, actor) => addUsers(channel, [user], actor);

async function removeUser(channel, user, actor) {
  const ticket = requireOpen(channel);
  if (user.id === ticket.ownerId) throw new UserError('Nie można usunąć autora ticketu.');
  if (!ticket.participants.includes(user.id)) throw new UserError(`${user} nie jest dodany do tego ticketu.`);
  await channel.permissionOverwrites.delete(user.id);
  db.updateTicket(channel.id, { participants: ticket.participants.filter((id) => id !== user.id) });
  await refreshControlMessage(channel, ticket);
  await channel.send(ui.notice(COLORS.warning, `➖ ${actor} usunął ${user} z ticketu.`));
}

async function setPriority(channel, level, actor) {
  const ticket = requireOpen(channel);
  if (!PRIORITIES[level]) throw new UserError('Nieznany priorytet.');
  if (ticket.priority === level) throw new UserError('Ticket ma już ten priorytet.');
  db.updateTicket(channel.id, { priority: level });
  await refreshControlMessage(channel, ticket);
  const renamed = await safeRename(channel, channelName(ticket, config.getType(ticket.typeId))).catch(() => ({ ok: false }));
  const p = PRIORITIES[level];
  await channel.send(
    ui.notice(
      p.color,
      `${p.emoji} ${actor} zmienił priorytet na **${p.label}**.` +
        (renamed.wait ? `\n-# Nazwa kanału zaktualizuje się przy następnej zmianie (limit Discorda, ~${renamed.wait} min).` : ''),
    ),
  );
}

async function moveTicket(channel, typeId, actor) {
  const ticket = requireOpen(channel);
  const from = config.getType(ticket.typeId);
  const to = config.getType(typeId);
  if (!to) throw new UserError('Nie ma takiej kategorii.');
  if (to.id === ticket.typeId) throw new UserError('Ticket jest już w tej kategorii.');

  const guild = channel.guild;
  const oldRoles = new Set(staffRoleIds(guild.id, from));
  const newRoles = new Set(staffRoleIds(guild.id, to));
  for (const id of newRoles) {
    if (guild.roles.cache.has(id)) await channel.permissionOverwrites.edit(id, allow(STAFF_PERMS)).catch(() => null);
  }
  for (const id of oldRoles) {
    if (!newRoles.has(id)) await channel.permissionOverwrites.delete(id).catch(() => null);
  }

  db.updateTicket(channel.id, { typeId: to.id });
  await refreshControlMessage(channel, ticket);
  const renamed = await safeRename(channel, channelName(ticket, to)).catch(() => ({ ok: false }));
  const pings = [...newRoles].filter((id) => !oldRoles.has(id) && guild.roles.cache.has(id));
  await channel.send(
    ui.notice(
      COLORS.info,
      `🔁 ${actor} przeniósł ticket: **${from?.emoji ?? ''} ${from?.label ?? '?'}** → **${to.emoji ?? ''} ${to.label}**` +
        (pings.length ? `\n🔔 ${pings.map((id) => `<@&${id}>`).join(' ')}` : '') +
        (renamed.wait ? `\n-# Nazwa kanału zmieni się później (limit Discorda, ~${renamed.wait} min).` : ''),
      { mentions: { roles: pings } },
    ),
  );
}

async function renameTicket(channel, name) {
  requireOpen(channel);
  const result = await safeRename(channel, name);
  if (!result.ok) throw new UserError(`Discord pozwala zmienić nazwę kanału 2 razy na 10 minut. Spróbuj za ~${result.wait} min.`);
}

/** Autor „woła" support – z cooldownem, żeby nie spamować. */
async function pingStaff(channel, member) {
  const ticket = requireOpen(channel);
  if (ticket.ownerId !== member.id) throw new UserError('Tylko autor ticketu może wezwać support.');
  const after = (D.pingStaffAfterMinutes ?? 10) * 60_000;
  const cooldown = (D.pingStaffCooldownMinutes ?? 30) * 60_000;
  if (Date.now() - ticket.createdAt < after) {
    throw new UserError(`Daj nam chwilę 🙂 Support możesz wezwać ${ts(ticket.createdAt + after, 'R')}.`);
  }
  if (ticket.lastMessageBy === 'staff') throw new UserError('Support już Ci odpowiedział – sprawdź ostatnie wiadomości.');
  if (ticket.lastStaffPing && Date.now() - ticket.lastStaffPing < cooldown) {
    throw new UserError(`Support został już wezwany. Kolejne wezwanie możliwe ${ts(ticket.lastStaffPing + cooldown, 'R')}.`);
  }
  db.updateTicket(channel.id, { lastStaffPing: Date.now() });
  const roles = ticket.claimedBy ? [] : staffRoleIds(channel.guild.id, config.getType(ticket.typeId)).filter((id) => channel.guild.roles.cache.has(id));
  const who = ticket.claimedBy ? `<@${ticket.claimedBy}>` : roles.map((id) => `<@&${id}>`).join(' ') || 'Support';
  await channel.send(
    ui.notice(COLORS.warning, `🔔 ${who} – <@${ticket.ownerId}> czeka na odpowiedź od ${duration(Date.now() - ticket.lastActivity)}.`, {
      mentions: { users: ticket.claimedBy ? [ticket.claimedBy] : [], roles },
    }),
  );
}

async function stillNeedHelp(channel, member, message) {
  const ticket = requireOpen(channel);
  if (ticket.ownerId !== member.id) throw new UserError('Ten przycisk jest dla autora ticketu.');
  db.updateTicket(channel.id, { lastMessageBy: 'owner', lastActivity: Date.now(), warned: false });
  await message
    .edit(ui.notice(COLORS.success, `✋ <@${ticket.ownerId}> nadal potrzebuje pomocy – automatyczne zamknięcie anulowane.`))
    .catch(() => null);
}

async function sendSnippet(channel, snippet, staff) {
  const ticket = requireOpen(channel);
  const content = snippet.content
    .replaceAll('{user}', `<@${ticket.ownerId}>`)
    .replaceAll('{staff}', `${staff}`)
    .replaceAll('{server}', channel.guild.name);
  await channel.send(
    ui.notice(COLORS.brand, `${content}\n-# 💬 ${staff.displayName} · ${snippet.name}`, {
      thumbnail: staff.displayAvatarURL({ size: 128 }),
      mentions: { users: [ticket.ownerId] },
    }),
  );
  const patch = { lastActivity: Date.now(), lastMessageBy: 'staff', warned: false };
  if (!ticket.firstResponseAt) {
    patch.firstResponseAt = Date.now();
    schedulePanelRefresh(channel.guild);
  }
  db.updateTicket(channel.id, patch);
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
    const user = await client.users.fetch(userId).catch(() => null);
    await sendLog(guild, {
      embeds: [
        logEmbed(stars >= 4 ? COLORS.success : stars === 3 ? COLORS.warning : COLORS.danger, '⭐ Nowa ocena obsługi', user)
          .setDescription(`## ${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}\n**${stars}/5**`)
          .addFields(
            { name: 'Ticket', value: `\`#${pad(ticket.number)}\``, inline: true },
            { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
            { name: 'Obsługiwał', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
            ...(comment ? [{ name: 'Komentarz', value: `>>> ${comment.slice(0, 1000)}` }] : []),
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
        await channel.send(ui.inactivityWarning(ticket, ticket.lastActivity + closeAfter));
      }
    } catch (err) {
      console.error(`[auto-close] ticket ${ticket.channelId}:`, err.message);
    }
  }
}

module.exports = {
  UserError,
  refreshControlMessage,
  buildPanel,
  refreshPanels,
  refreshGuildPanels,
  schedulePanelRefresh,
  buildForm,
  checkCanOpen,
  openTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  requestClose,
  answerCloseRequest,
  claimTicket,
  unclaimTicket,
  addUser,
  addUsers,
  removeUser,
  setPriority,
  moveTicket,
  renameTicket,
  pingStaff,
  stillNeedHelp,
  sendSnippet,
  archiveTranscript,
  saveRating,
  runInactivityCheck,
};
