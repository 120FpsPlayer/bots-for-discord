'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

/** Kolory interfejsu kreatora. */
const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  neutral: 0x2b2d31,
  build: 0xeb459e,
};

const BRAND = '🛠️ Kreator Serwera';

/** customId komponentu kreatora: wz:<sesja>:<rodzaj>:<id>[:<arg>] (max 100 znaków). */
function cid(session, kind, id, arg) {
  return ['wz', session.id, kind, id, arg].filter((p) => p !== undefined && p !== null).join(':').slice(0, 100);
}

function progressBar(current, total, width = 14) {
  const ratio = Math.max(0, Math.min(1, total ? current / total : 0));
  const filled = Math.round(ratio * width);
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)} ${Math.round(ratio * 100)}%`;
}

function clip(text, max) {
  if (text === null || text === undefined) return '';
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function yesNo(value) {
  return value ? '✅ Tak' : '❌ Nie';
}

/**
 * Pole embeda z automatycznym przycinaniem (limit 1024 znaków).
 * Pusty tekst zamienia na myślnik, bo Discord nie przyjmuje pustych pól.
 */
function field(name, value, inline = false) {
  return { name: clip(name, 256), value: clip(value || '—', 1024), inline };
}

function embed({ title, description, color = COLORS.primary, fields = [], footer }) {
  const e = new EmbedBuilder().setColor(color).setAuthor({ name: BRAND });
  if (title) e.setTitle(clip(title, 256));
  if (description) e.setDescription(clip(description, 4096));
  if (fields.length) e.addFields(fields.slice(0, 25));
  if (footer) e.setFooter({ text: clip(footer, 2048) });
  return e;
}

/**
 * Tworzy wiersz z menu wyboru.
 * options: [{ value, label, description?, emoji?, default? }]
 */
function selectRow(customId, { placeholder, options, min = 1, max = 1, disabled = false }) {
  const safe = options.slice(0, 25).map((o) => {
    const opt = { label: clip(o.label, 100), value: String(o.value).slice(0, 100) };
    if (o.description) opt.description = clip(o.description, 100);
    if (o.emoji) opt.emoji = o.emoji;
    if (o.default) opt.default = true;
    return opt;
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(clip(placeholder, 150))
    .setMinValues(Math.min(min, safe.length))
    .setMaxValues(Math.max(1, Math.min(max, safe.length)))
    .setDisabled(disabled)
    .addOptions(safe);
  return new ActionRowBuilder().addComponents(menu);
}

function button(customId, label, { style = ButtonStyle.Secondary, emoji, disabled = false } = {}) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(clip(label, 80)).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function linkButton(url, label, emoji) {
  const b = new ButtonBuilder().setURL(url).setLabel(clip(label, 80)).setStyle(ButtonStyle.Link);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(buttons.filter(Boolean).slice(0, 5));
}

/**
 * Buduje modal z polami. fields: [{ id, label, description?, style: 'short'|'paragraph', value?,
 *   placeholder?, required?, min?, max? } | { id, label, description?, select: { options, min, max } }]
 */
function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(clip(title, 45));
  const labels = fields.slice(0, 5).map((f) => {
    const label = new LabelBuilder().setLabel(clip(f.label, 45));
    if (f.description) label.setDescription(clip(f.description, 100));
    if (f.upload) {
      // Wgrywanie pliku prosto w formularzu (np. logo serwera).
      label.setFileUploadComponent(new FileUploadBuilder()
        .setCustomId(f.id)
        .setMinValues(f.upload.min ?? 0)
        .setMaxValues(f.upload.max ?? 1)
        .setRequired(Boolean(f.required)));
    } else if (f.select) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(f.id)
        .setMinValues(f.select.min ?? 1)
        .setMaxValues(f.select.max ?? 1)
        .setRequired(f.required !== false)
        .addOptions(f.select.options.slice(0, 25).map((o) => ({
          label: clip(o.label, 100), value: o.value, description: o.description ? clip(o.description, 100) : undefined,
          emoji: o.emoji, default: Boolean(o.default),
        })));
      if (f.placeholder) menu.setPlaceholder(clip(f.placeholder, 150));
      label.setStringSelectMenuComponent(menu);
    } else {
      const input = new TextInputBuilder()
        .setCustomId(f.id)
        .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(Boolean(f.required));
      if (f.max) input.setMaxLength(f.max);
      if (f.min) input.setMinLength(f.min);
      if (f.placeholder) input.setPlaceholder(clip(f.placeholder, 100));
      if (f.value) input.setValue(clip(f.value, f.max || 4000));
      label.setTextInputComponent(input);
    }
    return label;
  });
  m.addLabelComponents(labels);
  return m;
}

/** Bezpieczne odczytanie pola tekstowego z modala. */
function modalText(interaction, id) {
  try {
    return (interaction.fields.getTextInputValue(id) ?? '').trim();
  } catch {
    return '';
  }
}

/** Pliki wgrane w formularzu (tablica załączników; pusta, gdy nic nie wgrano). */
function modalFiles(interaction, id) {
  try {
    const files = interaction.fields.getUploadedFiles(id);
    return files ? [...files.values()] : [];
  } catch {
    return [];
  }
}

function modalSelect(interaction, id) {
  try {
    return interaction.fields.getStringSelectValues(id) ?? [];
  } catch {
    return [];
  }
}

// ───────────── Odpowiedzi na interakcje ─────────────

/** Czy interakcja dotyczy istniejącej wiadomości (przycisk, menu, formularz otwarty przyciskiem). */
function fromMessage(interaction) {
  return Boolean(interaction.isMessageComponent?.() || (interaction.isModalSubmit?.() && interaction.isFromMessage()));
}

/**
 * Potwierdza interakcję od razu, jeszcze bez nowej treści. Discord czeka na pierwszą odpowiedź
 * tylko 3 s od kliknięcia – na wolnym hostingu formularz pokazałby „Coś poszło nie tak”, mimo że
 * bot zrobił swoje. Treść wysyła się potem przez respond().
 */
async function acknowledge(interaction) {
  if (interaction.deferred || interaction.replied) return;
  if (fromMessage(interaction)) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

/** Pokazuje ramkę: podmienia wiadomość (update), a po acknowledge() – edytuje ją (editReply). */
function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (fromMessage(interaction)) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

module.exports = {
  COLORS,
  BRAND,
  ButtonStyle,
  cid,
  progressBar,
  clip,
  yesNo,
  field,
  embed,
  selectRow,
  button,
  linkButton,
  row,
  modal,
  modalText,
  modalSelect,
  modalFiles,
  acknowledge,
  respond,
  formatDuration,
};
