'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, OverwriteType, PermissionFlagsBits,
} = require('discord.js');
const { slugify } = require('../builder/naming');

/**
 * System ticketów (bez bazy danych):
 *   tk:o:<język>:<idRól.oddzielone.kropką>  – otwarcie zgłoszenia (panel)
 *   tk:c:<język>                            – prośba o zamknięcie
 *   tk:y:<język>                            – potwierdzenie zamknięcia
 *   tk:n:<język>                            – anulowanie zamknięcia
 *   tk:l:<język>                            – przejęcie zgłoszenia przez ekipę
 * Właściciel zgłoszenia jest zapisany w temacie kanału jako [ticket:<id>].
 */

const OPEN_COOLDOWN_MS = 60_000;
const openCooldowns = new Map();
const TAG = (userId) => `[ticket:${userId}]`;

function ownerOf(channel) {
  return channel?.topic?.match(/\[ticket:(\d{17,20})\]/)?.[1] ?? null;
}

function isStaffHere(interaction) {
  const perms = interaction.channel?.permissionsFor(interaction.member);
  return Boolean(perms?.has(PermissionFlagsBits.ManageMessages));
}

function ephemeral(interaction, description, color = 0x2b2d31) {
  const payload = { embeds: [new EmbedBuilder().setColor(color).setDescription(description)], flags: MessageFlags.Ephemeral };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
}

async function openTicket(interaction, lang, roleList) {
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const { guild, user } = interaction;

  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic?.includes(TAG(user.id)));
  if (existing) {
    return ephemeral(interaction, T(`📌 Masz już otwarte zgłoszenie: ${existing}`, `📌 You already have an open ticket: ${existing}`), 0xfee75c);
  }
  const last = openCooldowns.get(user.id) || 0;
  if (Date.now() - last < OPEN_COOLDOWN_MS) {
    return ephemeral(interaction, T('⏳ Odczekaj chwilę przed otwarciem kolejnego zgłoszenia.', '⏳ Please wait before opening another ticket.'), 0xfee75c);
  }
  openCooldowns.set(user.id, Date.now());

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const supportIds = (roleList || '').split('.').filter((id) => guild.roles.cache.has(id)).slice(0, 4);
  const me = guild.members.me ?? await guild.members.fetchMe();
  const parent = interaction.channel?.parent;
  const staffPerms = [
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages,
  ];

  const channel = await guild.channels.create({
    name: `ticket-${slugify(user.username, 40)}`,
    type: ChannelType.GuildText,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
    topic: T(`Zgłoszenie użytkownika ${user.tag} ${TAG(user.id)}`, `Ticket of ${user.tag} ${TAG(user.id)}`),
    permissionOverwrites: [
      { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
      },
      ...supportIds.map((id) => ({ id, type: OverwriteType.Role, allow: staffPerms })),
      { id: me.id, type: OverwriteType.Member, allow: [...staffPerms, PermissionFlagsBits.ManageChannels] },
    ],
    reason: T(`Ticket: ${user.tag}`, `Ticket: ${user.tag}`),
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(T('🎫 Nowe zgłoszenie', '🎫 New ticket'))
    .setDescription(T(
      `Cześć ${user}! 👋\nOpisz dokładnie swoją sprawę – dołącz zrzuty ekranu lub linki, jeśli to możliwe. Ekipa odpowie najszybciej, jak to możliwe.`,
      `Hi ${user}! 👋\nDescribe your issue in detail – add screenshots or links if possible. The staff will reply as soon as possible.`,
    ))
    .addFields(
      { name: T('👤 Autor', '👤 Author'), value: `${user} (\`${user.id}\`)`, inline: true },
      { name: T('🕒 Utworzono', '🕒 Created'), value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: T('Zamknij zgłoszenie, gdy sprawa zostanie rozwiązana.', 'Close the ticket once the issue is solved.') });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tk:c:${lang}`).setLabel(T('Zamknij', 'Close')).setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tk:l:${lang}`).setLabel(T('Przejmij', 'Claim')).setEmoji('🙋').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: [`${user}`, ...supportIds.map((id) => `<@&${id}>`)].join(' '),
    embeds: [embed],
    components: [buttons],
    allowedMentions: { users: [user.id], roles: supportIds },
  });

  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(T(`✅ Utworzono zgłoszenie: ${channel}`, `✅ Ticket created: ${channel}`))],
  });
}

async function requestClose(interaction, lang) {
  const T = (pl, en) => (lang === 'en' ? en : pl);
  if (interaction.user.id !== ownerOf(interaction.channel) && !isStaffHere(interaction)) {
    return ephemeral(interaction, T('🔒 Zgłoszenie może zamknąć tylko jego autor lub ekipa.', '🔒 Only the author or staff can close this ticket.'), 0xed4245);
  }
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(T('❓ Na pewno zamknąć zgłoszenie? Kanał zostanie usunięty.', '❓ Close this ticket? The channel will be deleted.'))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tk:y:${lang}`).setLabel(T('Tak, zamknij', 'Yes, close')).setEmoji('✅').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tk:n:${lang}`).setLabel(T('Anuluj', 'Cancel')).setStyle(ButtonStyle.Secondary),
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function confirmClose(interaction, lang) {
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const channel = interaction.channel;
  if (interaction.user.id !== ownerOf(channel) && !isStaffHere(interaction)) {
    return ephemeral(interaction, T('🔒 Brak uprawnień.', '🔒 Not allowed.'), 0xed4245);
  }
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(T('🔒 Zamykam zgłoszenie…', '🔒 Closing the ticket…'))], components: [] });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(T(`🔒 Zgłoszenie zamknięte przez ${interaction.user}. Kanał zostanie usunięty za 5 sekund.`, `🔒 Ticket closed by ${interaction.user}. This channel will be deleted in 5 seconds.`))],
    allowedMentions: { parse: [] },
  });
  setTimeout(() => {
    channel.delete(T(`Ticket zamknięty przez ${interaction.user.tag}`, `Ticket closed by ${interaction.user.tag}`)).catch(() => {});
  }, 5000);
  return undefined;
}

async function claimTicket(interaction, lang) {
  const T = (pl, en) => (lang === 'en' ? en : pl);
  if (!isStaffHere(interaction)) {
    return ephemeral(interaction, T('🔒 Zgłoszenie może przejąć tylko ekipa.', '🔒 Only staff can claim tickets.'), 0xed4245);
  }
  const [original] = interaction.message.embeds;
  const embed = EmbedBuilder.from(original).addFields({ name: T('🙋 Przejęte przez', '🙋 Claimed by'), value: `${interaction.user}`, inline: true });
  const rows = interaction.message.components.map((r) => ActionRowBuilder.from(r));
  for (const component of rows[0]?.components || []) {
    if (component.data.custom_id?.startsWith('tk:l:')) component.setDisabled(true);
  }
  return interaction.update({ embeds: [embed], components: rows });
}

async function handleTicket(interaction) {
  const [, action, lang = 'pl', arg] = interaction.customId.split(':');
  switch (action) {
    case 'o': return openTicket(interaction, lang, arg);
    case 'c': return requestClose(interaction, lang);
    case 'y': return confirmClose(interaction, lang);
    case 'n': return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(lang === 'en' ? 'Cancelled.' : 'Anulowano.')], components: [] });
    case 'l': return claimTicket(interaction, lang);
    default: return undefined;
  }
}

module.exports = { handleTicket, ownerOf };
