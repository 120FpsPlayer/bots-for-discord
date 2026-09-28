const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const config = require('./config');
const db = require('./db');
const { COLORS, PRIORITIES, pad, ts, duration, workingStatus, avgResponseTime } = require('./utils');

const SPACER = ' ';

const text = (content) => new TextDisplayBuilder().setContent(content.slice(0, 4000));
const divider = (large = false) =>
  new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
const gap = () => new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);
const btn = (id, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const linkBtn = (url, label, emoji) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label).setEmoji(emoji);
const row = (...components) => new ActionRowBuilder().addComponents(...components);

function section(content, thumbnailUrl) {
  const s = new SectionBuilder().addTextDisplayComponents(text(content));
  if (thumbnailUrl) s.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
  return s;
}

function v2(container, { mentions } = {}) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: mentions ?? { parse: [] },
  };
}

function notice(color, content, { thumbnail, buttons, mentions } = {}) {
  const c = new ContainerBuilder().setAccentColor(color);
  if (thumbnail) c.addSectionComponents(section(content, thumbnail));
  else c.addTextDisplayComponents(text(content));
  if (buttons?.length) c.addActionRowComponents(row(...buttons));
  return v2(c, { mentions });
}

function panelPayload(guild, style = 'buttons') {
  const p = config.panel;
  const types = config.ticketTypes;
  const useSections = style !== 'select' && types.length <= 8;

  const c = new ContainerBuilder().setAccentColor(COLORS.brand);
  if (p.image) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.image)));
  }

  const header = `# ${p.title}\n${p.description}`;
  const logo = config.brand.logo ?? guild.iconURL({ size: 256 });
  if (logo) c.addSectionComponents(section(header, logo));
  else c.addTextDisplayComponents(text(header));

  if (p.rules.length) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(`**📌 Zanim otworzysz ticket**\n${p.rules.map((r) => `> ${r}`).join('\n')}`));
  }

  c.addSeparatorComponents(divider(true));

  if (useSections) {
    for (const t of types) {
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${t.emoji ?? '🎫'} ${t.label}\n-# ${t.description ?? '​'}`))
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`ticket:open:${t.id}`)
              .setLabel(p.buttonLabel ?? 'Otwórz')
              .setEmoji(t.emoji ?? '🎫')
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    }
  } else {
    c.addTextDisplayComponents(text('**📂 Wybierz kategorię z listy poniżej:**'));
    c.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:open')
          .setPlaceholder('📂 Wybierz kategorię zgłoszenia…')
          .addOptions(
            types.map((t) => ({ label: t.label, value: t.id, description: t.description?.slice(0, 100), emoji: t.emoji })),
          ),
      ),
    );
  }

  const footer = [];
  const status = workingStatus();
  if (status.text) footer.push(status.text);
  if (p.showStats !== false) {
    const avg = avgResponseTime(guild.id);
    const open = db.tickets((t) => t.guildId === guild.id && t.status === 'open').length;
    footer.push(`⏱️ Średni czas odpowiedzi: **${avg ? `~${duration(avg)}` : 'brak danych'}**${SPACER}📨 Otwarte tickety: **${open}**`);
  }
  if (footer.length) {
    c.addSeparatorComponents(divider(true));
    c.addTextDisplayComponents(text(footer.map((l) => `-# ${l}`).join('\n')));
  }
  return v2(c);
}

function statusLine(ticket) {
  const p = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const status = ticket.status === 'open' ? '🟢 Otwarty' : '🔴 Zamknięty';
  const claim = ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*oczekuje na przejęcie*';
  return (
    `**Status:** ${status}${SPACER}**Priorytet:** ${p.emoji} ${p.label}\n` +
    `**Obsługuje:** ${claim}${SPACER}**Utworzono:** ${ts(ticket.createdAt, 'R')}`
  );
}

function ticketCard(ticket, type, { ownerUser, ownerMember, pingRoles = [], previousCount = 0 } = {}) {
  const p = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const c = new ContainerBuilder().setAccentColor(p.color);

  const status = workingStatus(new Date(ticket.createdAt));
  const intro =
    `## ${type?.emoji ?? '🎫'} ${type?.label ?? 'Ticket'}${SPACER}\`#${pad(ticket.number)}\`\n` +
    `Cześć <@${ticket.ownerId}>! 👋 Dziękujemy za kontakt.\n` +
    'Opisz sprawę jak najdokładniej i dołącz zrzuty ekranu, jeśli to możliwe – zespół odpowie tak szybko, jak to możliwe.' +
    (status.open ? '' : `\n-# ${status.text}`);
  c.addSectionComponents(section(intro, ownerUser?.displayAvatarURL({ size: 128 })));

  if (ticket.answers?.length) {
    c.addSeparatorComponents(divider());
    const budget = Math.floor(2400 / ticket.answers.length);
    const answers = ticket.answers
      .map((a) => {
        const value = (a.value || '*brak odpowiedzi*').slice(0, budget) + ((a.value?.length ?? 0) > budget ? '…' : '');
        return `**${a.label}**\n${value.split('\n').map((l) => `> ${l}`).join('\n')}`;
      })
      .join('\n');
    c.addTextDisplayComponents(text(`### 📝 Formularz\n${answers}`));
  }

  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(statusLine(ticket)));

  if (ticket.participants?.length) {
    c.addTextDisplayComponents(text(`**Dodane osoby:** ${ticket.participants.map((id) => `<@${id}>`).join(', ')}`));
  }

  const meta = [];
  if (ownerUser) meta.push(`👤 Konto od ${ts(ownerUser.createdAt, 'D')}`);
  if (ownerMember?.joinedAt) meta.push(`📥 Na serwerze od ${ts(ownerMember.joinedAt, 'D')}`);
  meta.push(`🗂️ Poprzednie tickety: ${previousCount}`);
  c.addTextDisplayComponents(text(`-# ${meta.join(' · ')}`));

  if (ticket.status === 'open') {
    c.addSeparatorComponents(divider());
    c.addActionRowComponents(
      row(
        btn('ticket:close', 'Zamknij', '🔒', ButtonStyle.Danger),
        ticket.claimedBy
          ? btn('ticket:unclaim', 'Odpuść', '↩️')
          : btn('ticket:claim', 'Przejmij', '🙋', ButtonStyle.Success),
        btn('ticket:ping', 'Wezwij support', '🔔'),
        btn('ticket:transcript', 'Transkrypt', '📄'),
      ),
    );
    c.addActionRowComponents(row(manageSelect(ticket)));
    c.addActionRowComponents(
      row(
        new UserSelectMenuBuilder()
          .setCustomId('ticket:adduser')
          .setPlaceholder('➕ Dodaj osobę do ticketu (support)')
          .setMinValues(1)
          .setMaxValues(5),
      ),
    );
  }

  if (pingRoles.length) c.addTextDisplayComponents(text(`-# 🔔 ${pingRoles.map((id) => `<@&${id}>`).join(' ')}`));

  return v2(c, { mentions: { users: [ticket.ownerId], roles: pingRoles } });
}

function manageSelect(ticket) {
  const options = [];
  for (const [value, p] of Object.entries(PRIORITIES)) {
    if (value === ticket.priority) continue;
    options.push({ label: `Priorytet: ${p.label}`, value: `prio:${value}`, emoji: p.emoji, description: 'Zmień priorytet ticketu' });
  }
  options.push({
    label: 'Poproś autora o zamknięcie',
    value: 'closereq',
    emoji: '📨',
    description: 'Autor potwierdzi, że sprawa jest rozwiązana',
  });
  for (const t of config.ticketTypes) {
    if (t.id === ticket.typeId || options.length >= 25) continue;
    options.push({ label: `Przenieś do: ${t.label}`.slice(0, 100), value: `move:${t.id}`, emoji: t.emoji ?? '🔁', description: 'Zmień kategorię ticketu' });
  }
  return new StringSelectMenuBuilder().setCustomId('ticket:manage').setPlaceholder('⚙️ Zarządzanie ticketem (support)').addOptions(options);
}

function closedCard(ticket, actorId, { messageCount, transcriptUrl } = {}) {
  const c = new ContainerBuilder().setAccentColor(COLORS.danger);
  c.addTextDisplayComponents(
    text(
      '## 🔒 Ticket zamknięty\n' +
        `Zamknięty przez <@${actorId}> ${ts(ticket.closedAt ?? Date.now(), 'R')}` +
        (ticket.closeReason ? `\n**Powód:** ${ticket.closeReason}` : ''),
    ),
  );
  c.addSeparatorComponents(divider());
  const lines = [
    `⏱️ **Czas trwania:** ${duration((ticket.closedAt ?? Date.now()) - ticket.createdAt)}`,
    `⚡ **Pierwsza odpowiedź:** ${ticket.firstResponseAt ? `po ${duration(ticket.firstResponseAt - ticket.createdAt)}` : '—'}`,
    `🙋 **Obsługiwał:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—'}`,
  ];
  if (messageCount != null) lines.push(`💬 **Wiadomości:** ${messageCount}`);
  c.addTextDisplayComponents(text(lines.join('\n')));
  c.addSeparatorComponents(divider());
  const buttons = [
    btn('ticket:reopen', 'Otwórz ponownie', '🔓', ButtonStyle.Success),
    btn('ticket:transcript', 'Transkrypt', '📄'),
    btn('ticket:delete', 'Usuń ticket', '🗑️', ButtonStyle.Danger),
  ];
  if (transcriptUrl) buttons.push(linkBtn(transcriptUrl, 'Pobierz', '⬇️'));
  c.addActionRowComponents(row(...buttons));
  return v2(c);
}

function closeRequestCard(ticket, staffId, state = 'pending') {
  const c = new ContainerBuilder().setAccentColor(
    state === 'pending' ? COLORS.warning : state === 'accepted' ? COLORS.success : COLORS.danger,
  );
  if (state === 'pending') {
    c.addTextDisplayComponents(
      text(
        `## 📨 Czy możemy zamknąć ticket?\n<@${ticket.ownerId}>, <@${staffId}> uważa, że Twoja sprawa została rozwiązana.\n` +
          'Jeśli wszystko jest w porządku – kliknij **Tak, zamknij**. Jeśli nadal potrzebujesz pomocy – daj znać!',
      ),
    );
    c.addActionRowComponents(
      row(
        btn('ticket:closereq_yes', 'Tak, zamknij', '✅', ButtonStyle.Success),
        btn('ticket:closereq_no', 'Nie, potrzebuję pomocy', '✋', ButtonStyle.Secondary),
      ),
    );
  } else if (state === 'accepted') {
    c.addTextDisplayComponents(text('✅ **Autor potwierdził rozwiązanie sprawy** – ticket zostaje zamknięty.'));
  } else {
    c.addTextDisplayComponents(text(`✋ **<@${ticket.ownerId}> nadal potrzebuje pomocy** – ticket pozostaje otwarty.`));
  }
  return v2(c, { mentions: { users: state === 'pending' ? [ticket.ownerId] : [] } });
}

function inactivityWarning(ticket, closeAt) {
  const c = new ContainerBuilder().setAccentColor(COLORS.warning);
  c.addTextDisplayComponents(
    text(
      `## ⏰ Czy potrzebujesz jeszcze pomocy?\n<@${ticket.ownerId}>, od dłuższego czasu nie otrzymaliśmy od Ciebie odpowiedzi.\n` +
        `Ticket zostanie **automatycznie zamknięty ${ts(closeAt, 'R')}**, chyba że odpiszesz lub klikniesz przycisk poniżej.`,
    ),
  );
  c.addActionRowComponents(row(btn('ticket:still', 'Nadal potrzebuję pomocy', '✋', ButtonStyle.Primary)));
  return v2(c, { mentions: { users: [ticket.ownerId] } });
}

module.exports = {
  v2,
  text,
  divider,
  gap,
  section,
  notice,
  btn,
  linkBtn,
  row,
  panelPayload,
  ticketCard,
  closedCard,
  closeRequestCard,
  inactivityWarning,
};
