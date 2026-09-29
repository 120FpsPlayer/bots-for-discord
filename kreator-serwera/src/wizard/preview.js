'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { CHANNEL_STYLES, CATEGORY_STYLES, PALETTES } = require('../data/styles');
const { VERIFICATION_LEVELS, CONTENT_FILTERS } = require('../data/security');
const { STAFF_LEVELS } = require('../data/roles');
const { SIZES, AGES, LANGUAGES } = require('./defaults');
const { COMMUNITY_OPTIONS } = require('./steps');
const { field, clip, formatDuration } = require('./ui');
const { describeAccess } = require('../builder/permissions');

const KIND_ICON = { text: '#', announcement: '📢', forum: '🗂️', voice: '🔊', stage: '🎤' };

function hex(color) {
  return color ? `#${color.toString(16).padStart(6, '0').toUpperCase()}` : 'brak';
}

/** Dzieli linie na strony o maksymalnej długości (limit opisu embeda to 4096). */
function paginate(lines, max = 3500) {
  const pages = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > max && current) {
      pages.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current) pages.push(current);
  return pages.length ? pages : ['*pusto*'];
}

function channelPages(bp) {
  const lines = [];
  for (const cat of bp.categories) {
    const privacy = cat.overwrites.some((o) => o.target === '@everyone' && o.deny.includes('ViewChannel')) ? ' 🔒' : '';
    lines.push(`\n📁 **${cat.name}**${privacy}`);
    for (const ch of cat.channels) {
      const notes = [];
      const access = describeAccess(ch.access, ch.kind);
      if (ch.access.view !== 'members') notes.push(access.view);
      if (ch.access.write !== 'all') notes.push(access.write);
      if (ch.access.custom) notes.push('✏️');
      if (ch.slowmode) notes.push(`🐢 ${formatDuration(ch.slowmode)}`);
      if (ch.userLimit) notes.push(`👥 ${ch.userLimit}`);
      if (ch.nsfw) notes.push('🔞');
      if (ch.tags?.length) notes.push(`🏷️ ${ch.tags.length} tagów`);
      if (bp.messages.some((m) => m.channel === ch.key)) notes.push('📨');
      lines.push(`ㅤ${KIND_ICON[ch.kind] || '#'} ${ch.name}${notes.length ? `  ·  *${notes.join(' · ')}*` : ''}`);
    }
  }
  return paginate(lines);
}

function rolePages(bp) {
  const lines = [];
  for (const role of bp.roles) {
    if (role.separator) {
      lines.push(`\n**${role.name}**`);
      continue;
    }
    const notes = [];
    if (role.permissions.includes('Administrator')) notes.push('👑 Administrator');
    else if (role.staff) notes.push(`🛡️ ${STAFF_LEVELS[role.level]?.label || 'ekipa'} (${role.permissions.length} upr.)`);
    else if (role.permissions.length) notes.push(`🔓 ${role.permissions.length} upr.`);
    if (role.hoist) notes.push('📌 wyróżniona');
    if (role.mentionable) notes.push('🔔 pingowalna');
    lines.push(`\`${hex(role.color).padEnd(7)}\` ${role.name}${notes.length ? `  ·  *${notes.join(' · ')}*` : ''}`);
  }
  if (bp.everyone.length) lines.push(`\n**@everyone** · 🔓 ${bp.everyone.length} uprawnień (bez weryfikacji każdy ma podstawowe uprawnienia)`);
  else lines.push('\n**@everyone** · 🔒 brak uprawnień – dostęp dopiero po weryfikacji');
  return paginate(lines);
}

/** Pola embeda podsumowania. */
function summaryFields(session, bp) {
  const a = session.answers;
  const preset = SERVER_TYPES[a.type];
  const st = bp.stats;
  const lvl = VERIFICATION_LEVELS.find((v) => v.value === bp.guild.verificationLevel);
  const flt = CONTENT_FILTERS.find((v) => v.value === bp.guild.explicitContentFilter);
  const fields = [
    field('🏷️ Serwer', [
      `**${a.basics.name || session.env.guildName || '—'}**${a.basics.rename ? '' : ' *(nazwa bez zmian)*'}`,
      `${preset.emoji} ${preset.label}`,
      `${LANGUAGES[a.language].emoji} ${LANGUAGES[a.language].label} · ${SIZES[a.size].emoji} ${SIZES[a.size].label} · ${AGES[a.age].emoji} ${AGES[a.age].label}`,
    ].join('\n'), true),
    field('🎨 Wygląd', [
      `Kanały: ${CHANNEL_STYLES[a.style.channel].label}`,
      `Kategorie: ${CATEGORY_STYLES[a.style.category].label}`,
      `Paleta: ${PALETTES[a.style.palette].emoji} ${PALETTES[a.style.palette].label}`,
    ].join('\n'), true),
    field('📊 Struktura', [
      `📁 **${st.categories}** kategorii`,
      `💬 **${st.text}** tekstowych${st.forums ? ` (w tym ${st.forums} forów)` : ''}`,
      `🔊 **${st.voice}** głosowych`,
      `🎭 **${st.roles}** ról${st.separators ? ` (w tym ${st.separators} separatorów)` : ''}`,
      `📨 **${st.messages}** wiadomości (tekst + przycisk weryfikacji)`,
      `🤖 **${st.automod}** reguł AutoMod`,
    ].join('\n'), true),
    field('🛡️ Bezpieczeństwo', [
      `Weryfikacja Discorda: ${lvl?.emoji} ${lvl?.label}`,
      `Filtr multimediów: ${flt?.emoji} ${flt?.label}`,
      `Weryfikacja przyciskiem: ${bp.meta.gate ? `✅${bp.meta.verify?.captcha ? ' + pytanie' : ''}${bp.meta.verify?.minAgeDays ? ` + konto ${bp.meta.verify.minAgeDays} d.` : ''}${bp.meta.verify?.logChannel ? ' + logi' : ''}` : '❌'}`,
      `Społeczność: ${COMMUNITY_OPTIONS[a.content.community].emoji} ${COMMUNITY_OPTIONS[a.content.community].label}`,
    ].join('\n'), true),
    field('⚙️ Budowa', [
      a.mode.type === 'wipe' ? '🧨 **Czyszczenie + budowa od zera**' : '➕ Dodanie do obecnej struktury',
      `⏱️ Szacowany czas: ~${formatDuration(bp.estimatedSeconds)}`,
      `👑 Nadanie ról: ${a.mode.assign ? 'tak' : 'nie'}`,
    ].join('\n'), true),
  ];
  const t = a.texts || {};
  const punish = { ladder: 'stopniowanie kar', points: 'punkty ostrzeżeń', strict: 'zero tolerancji' }[t.punishments] || 'stopniowanie kar';
  fields.push(field('📜 Regulamin i teksty', [
    `📜 ${(t.ruleSections || []).length} paragrafów • ⚖️ ${punish}`,
    `✍️ własne zasady: **${(t.customRules || []).length}** • ❓ własne FAQ: **${(t.customFaq || []).length}**`,
    `📢 pierwsze ogłoszenie: ${t.announcement ? '**tak**' : 'nie'}`,
    Object.keys(a.roleNames || {}).length ? `✏️ zmienione nazwy ról: ${Object.values(a.roleNames).join(', ')}` : null,
  ].filter(Boolean).join('\n'), true));
  const custom = Object.keys(a.channelAccess || {}).length;
  fields.push(field('🔑 Uprawnienia kanałów', [
    `💬 **${st.open}** otwartych – członkowie widzą i piszą`,
    `👁️ **${st.readonly}** tylko do odczytu (lub wątki / bez mówienia)`,
    `🔒 **${st.hidden}** ukrytych – tylko ekipa, zarząd, VIP lub rola`,
    `⚙️ **${st.overwrites}** nadpisań uprawnień ustawi bot${custom ? ` • ✏️ zmienione sekcje: ${custom}` : ' • ustawienia zalecane'}`,
  ].join('\n'), true));
  if (bp.errors.length) fields.push(field('❌ Do poprawy przed budową', bp.errors.map((e) => `• ${e}`).join('\n')));
  if (bp.warnings.length) fields.push(field(`⚠️ Uwagi (${bp.warnings.length})`, clip(bp.warnings.map((w) => `• ${w}`).join('\n'), 1024)));
  return fields;
}

module.exports = { channelPages, rolePages, summaryFields, paginate, hex };
