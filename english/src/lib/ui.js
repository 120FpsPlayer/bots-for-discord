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
    c.addTextDisplayComponents(text(`**📌 Before you open a ticket**\n${p.rules.map((r) => `> ${r}`).join('\n')}`));
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
              .setLabel(p.buttonLabel ?? 'Open')
              .setEmoji(t.emoji ?? '🎫')
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    }
  } else {
    c.addTextDisplayComponents(text('**📂 Choose a category from the list below:**'));
    c.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:open')
          .setPlaceholder('📂 Choose a ticket category…')
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
    footer.push(`⏱️ Average response time: **${avg ? `~${duration(avg)}` : 'no data yet'}**${SPACER}📨 Open tickets: **${open}**`);
  }
  if (footer.length) {
    c.addSeparatorComponents(divider(true));
    c.addTextDisplayComponents(text(footer.map((l) => `-# ${l}`).join('\n')));
  }
  return v2(c);
}

function statusLine(ticket) {
  const p = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const status = ticket.status === 'open' ? '🟢 Open' : '🔴 Closed';
  const claim = ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*waiting to be claimed*';
  return (
    `**Status:** ${status}${SPACER}**Priority:** ${p.emoji} ${p.label}\n` +
    `**Handled by:** ${claim}${SPACER}**Created:** ${ts(ticket.createdAt, 'R')}`
  );
}

function ticketCard(ticket, type, { ownerUser, ownerMember, pingRoles = [], previousCount = 0 } = {}) {
  const p = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const c = new ContainerBuilder().setAccentColor(p.color);

  const status = workingStatus(new Date(ticket.createdAt));
  const intro =
    `## ${type?.emoji ?? '🎫'} ${type?.label ?? 'Ticket'}${SPACER}\`#${pad(ticket.number)}\`\n` +
    `Hi <@${ticket.ownerId}>! 👋 Thanks for reaching out.\n` +
    'Please describe your issue in as much detail as possible and attach screenshots if you can – our team will reply as soon as possible.' +
    (status.open ? '' : `\n-# ${status.text}`);
  c.addSectionComponents(section(intro, ownerUser?.displayAvatarURL({ size: 128 })));

  if (ticket.answers?.length) {
    c.addSeparatorComponents(divider());
    const budget = Math.floor(2400 / ticket.answers.length);
    const answers = ticket.answers
      .map((a) => {
        const value = (a.value || '*no answer*').slice(0, budget) + ((a.value?.length ?? 0) > budget ? '…' : '');
        return `**${a.label}**\n${value.split('\n').map((l) => `> ${l}`).join('\n')}`;
      })
      .join('\n');
    c.addTextDisplayComponents(text(`### 📝 Form\n${answers}`));
  }

  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(statusLine(ticket)));

  if (ticket.participants?.length) {
    c.addTextDisplayComponents(text(`**Added members:** ${ticket.participants.map((id) => `<@${id}>`).join(', ')}`));
  }

  const meta = [];
  if (ownerUser) meta.push(`👤 Account created ${ts(ownerUser.createdAt, 'D')}`);
  if (ownerMember?.joinedAt) meta.push(`📥 Joined server ${ts(ownerMember.joinedAt, 'D')}`);
  meta.push(`🗂️ Previous tickets: ${previousCount}`);
  c.addTextDisplayComponents(text(`-# ${meta.join(' · ')}`));

  if (ticket.status === 'open') {
    c.addSeparatorComponents(divider());
    c.addActionRowComponents(
      row(
        btn('ticket:close', 'Close', '🔒', ButtonStyle.Danger),
        ticket.claimedBy
          ? btn('ticket:unclaim', 'Unclaim', '↩️')
          : btn('ticket:claim', 'Claim', '🙋', ButtonStyle.Success),
        btn('ticket:ping', 'Call support', '🔔'),
        btn('ticket:transcript', 'Transcript', '📄'),
      ),
    );
    c.addActionRowComponents(row(manageSelect(ticket)));
    c.addActionRowComponents(
      row(
        new UserSelectMenuBuilder()
          .setCustomId('ticket:adduser')
          .setPlaceholder('➕ Add someone to the ticket (staff)')
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
    options.push({ label: `Priority: ${p.label}`, value: `prio:${value}`, emoji: p.emoji, description: 'Change the ticket priority' });
  }
  options.push({
    label: 'Ask the author to close',
    value: 'closereq',
    emoji: '📨',
    description: 'The author confirms the issue is resolved',
  });
  for (const t of config.ticketTypes) {
    if (t.id === ticket.typeId || options.length >= 25) continue;
    options.push({ label: `Move to: ${t.label}`.slice(0, 100), value: `move:${t.id}`, emoji: t.emoji ?? '🔁', description: 'Change the ticket category' });
  }
  return new StringSelectMenuBuilder().setCustomId('ticket:manage').setPlaceholder('⚙️ Manage ticket (staff)').addOptions(options);
}

function closedCard(ticket, actorId, { messageCount, transcriptUrl } = {}) {
  const c = new ContainerBuilder().setAccentColor(COLORS.danger);
  c.addTextDisplayComponents(
    text(
      '## 🔒 Ticket closed\n' +
        `Closed by <@${actorId}> ${ts(ticket.closedAt ?? Date.now(), 'R')}` +
        (ticket.closeReason ? `\n**Reason:** ${ticket.closeReason}` : ''),
    ),
  );
  c.addSeparatorComponents(divider());
  const lines = [
    `⏱️ **Duration:** ${duration((ticket.closedAt ?? Date.now()) - ticket.createdAt)}`,
    `⚡ **First response:** ${ticket.firstResponseAt ? `after ${duration(ticket.firstResponseAt - ticket.createdAt)}` : '—'}`,
    `🙋 **Handled by:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—'}`,
  ];
  if (messageCount != null) lines.push(`💬 **Messages:** ${messageCount}`);
  c.addTextDisplayComponents(text(lines.join('\n')));
  c.addSeparatorComponents(divider());
  const buttons = [
    btn('ticket:reopen', 'Reopen', '🔓', ButtonStyle.Success),
    btn('ticket:transcript', 'Transcript', '📄'),
    btn('ticket:delete', 'Delete ticket', '🗑️', ButtonStyle.Danger),
  ];
  if (transcriptUrl) buttons.push(linkBtn(transcriptUrl, 'Download', '⬇️'));
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
        `## 📨 Can we close this ticket?\n<@${ticket.ownerId}>, <@${staffId}> believes your issue has been resolved.\n` +
          'If everything is fine – click **Yes, close it**. If you still need help – just let us know!',
      ),
    );
    c.addActionRowComponents(
      row(
        btn('ticket:closereq_yes', 'Yes, close it', '✅', ButtonStyle.Success),
        btn('ticket:closereq_no', 'No, I still need help', '✋', ButtonStyle.Secondary),
      ),
    );
  } else if (state === 'accepted') {
    c.addTextDisplayComponents(text('✅ **The author confirmed the issue is resolved** – the ticket is being closed.'));
  } else {
    c.addTextDisplayComponents(text(`✋ **<@${ticket.ownerId}> still needs help** – the ticket stays open.`));
  }
  return v2(c, { mentions: { users: state === 'pending' ? [ticket.ownerId] : [] } });
}

function inactivityWarning(ticket, closeAt) {
  const c = new ContainerBuilder().setAccentColor(COLORS.warning);
  c.addTextDisplayComponents(
    text(
      `## ⏰ Do you still need help?\n<@${ticket.ownerId}>, we haven't heard back from you in a while.\n` +
        `This ticket will be **closed automatically ${ts(closeAt, 'R')}** unless you reply or click the button below.`,
    ),
  );
  c.addActionRowComponents(row(btn('ticket:still', 'I still need help', '✋', ButtonStyle.Primary)));
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
