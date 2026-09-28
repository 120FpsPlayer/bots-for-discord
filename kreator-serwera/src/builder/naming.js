'use strict';

const { CHANNEL_STYLES, CATEGORY_STYLES } = require('../data/styles');

/**
 * Zamienia dowolny tekst na poprawną nazwę kanału tekstowego:
 * małe litery, spacje → myślniki, bez znaków, których Discord nie akceptuje.
 * Polskie znaki i emoji zostają.
 */
function slugify(text, max = 90) {
  let slug = String(text ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('pl')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > max) slug = slug.slice(0, max).replace(/-+$/g, '');
  return slug || 'kanal';
}

/** Czyści nazwę kanału głosowego / kategorii / roli (bez znaków kontrolnych, max długość). */
function cleanName(text, max = 90) {
  const cleaned = String(text ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/@(everyone|here)/gi, '$1')
    .trim();
  return cleaned.slice(0, max).trim();
}

function formatTextChannel(styleKey, emoji, slug, pos) {
  const style = CHANNEL_STYLES[styleKey] ?? CHANNEL_STYLES.dot;
  return truncateName(style.text(emoji || '💬', slug, pos));
}

function formatVoiceChannel(styleKey, emoji, name, pos) {
  const style = CHANNEL_STYLES[styleKey] ?? CHANNEL_STYLES.dot;
  return truncateName(style.voice(emoji || '🔊', name, pos));
}

function formatCategory(styleKey, emoji, name) {
  const style = CATEGORY_STYLES[styleKey] ?? CATEGORY_STYLES.lines;
  return truncateName(style.format(emoji || '📁', String(name).toLocaleUpperCase('pl')));
}

function formatRoleName(emoji, name, withEmoji) {
  return truncateName(withEmoji && emoji ? `${emoji} ${name}` : name);
}

function formatSeparator(name) {
  return truncateName(`━━━━━ ✦ ${String(name).toLocaleUpperCase('pl')} ✦ ━━━━━`);
}

function truncateName(name, max = 100) {
  const chars = Array.from(name);
  return chars.length > max ? chars.slice(0, max).join('') : name;
}

/**
 * Parsuje listę wpisaną przez użytkownika (przecinki, średniki lub nowe linie).
 * Usuwa duplikaty (bez względu na wielkość liter) i puste wpisy.
 */
function parseList(text, { max = 25, maxLength = 60 } = {}) {
  const seen = new Set();
  const items = [];
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const item = cleanName(raw.replace(/^[-•*#\d.)\s]+(?=\S)/, ''), maxLength);
    if (!item) continue;
    const key = item.toLocaleLowerCase('pl');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}

/** Odczytuje kolor w formacie #RRGGBB / RRGGBB / #RGB. Zwraca liczbę albo null. */
function parseColor(text) {
  const match = String(text ?? '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const value = Number.parseInt(hex, 16);
  return value === 0 ? 0x010101 : value;
}

const LEVEL_WORDS = {
  admin: ['admin', 'administrator', 'administracja'],
  mod: ['mod', 'moderator', 'moderacja'],
  helper: ['pomoc', 'pomocnik', 'helper', 'support', 'wsparcie'],
  trial: ['trial', 'próbny', 'probny', 'okres-próbny'],
  none: ['brak', 'none', 'zwykła', 'zwykla', 'bez'],
};

/**
 * Parsuje własne role, po jednej w linii, np.:
 *   „Streamer, #9146FF”
 *   „Opiekun Discorda | #00FF00 | mod”
 * Zwraca [{ name, color, level }].
 */
function parseCustomRoles(text, { max = 15, withLevel = false } = {}) {
  const roles = [];
  const seen = new Set();
  for (const rawLine of String(text ?? '').split(/\n+/)) {
    const parts = rawLine.split(/[|,;]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    let color = null;
    let level = 'none';
    const nameParts = [];
    for (const part of parts) {
      const parsedColor = parseColor(part);
      if (parsedColor !== null && /^#?[0-9a-f]{3,6}$/i.test(part)) { color = parsedColor; continue; }
      const lower = part.toLocaleLowerCase('pl');
      const levelKey = withLevel ? Object.keys(LEVEL_WORDS).find((k) => LEVEL_WORDS[k].includes(lower)) : null;
      if (levelKey) { level = levelKey; continue; }
      nameParts.push(part);
    }
    const name = cleanName(nameParts.join(' '), 80);
    if (!name) continue;
    const key = name.toLocaleLowerCase('pl');
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push({ name, color, level });
    if (roles.length >= max) break;
  }
  return roles;
}

function isValidUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = {
  slugify,
  cleanName,
  formatTextChannel,
  formatVoiceChannel,
  formatCategory,
  formatRoleName,
  formatSeparator,
  parseList,
  parseColor,
  parseCustomRoles,
  isValidUrl,
  truncateName,
};
