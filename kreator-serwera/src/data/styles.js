'use strict';

/**
 * Style nazewnictwa kanałów i kategorii oraz palety kolorów ról.
 * Każdy styl ma podgląd, który kreator pokazuje w panelu.
 */

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
  ą: 'ᴀ̨', ć: 'ᴄ́', ę: 'ᴇ̨', ł: 'ᴌ', ń: 'ɴ́', ó: 'ᴏ́', ś: 'ꜱ́', ź: 'ᴢ́', ż: 'ᴢ̇',
};

function toSmallCaps(text) {
  return Array.from(text.toLocaleLowerCase('pl')).map((c) => SMALL_CAPS[c] ?? c).join('');
}

/**
 * Style kanałów. `text` formatuje kanał tekstowy (nazwa jest już "slugiem"),
 * `voice` – kanał głosowy (nazwa może mieć spacje i wielkie litery).
 * `pos` = { first, last } – używane przez styl drzewka.
 */
const CHANNEL_STYLES = {
  minimal: {
    label: 'Minimalistyczny',
    emoji: '▫️',
    description: 'Czyste nazwy bez emoji – elegancko i profesjonalnie.',
    text: (emoji, name) => name,
    voice: (emoji, name) => name,
  },
  dot: {
    label: 'Emoji z kropką',
    emoji: '💬',
    description: 'Najpopularniejszy styl: emoji・nazwa',
    text: (emoji, name) => `${emoji}・${name}`,
    voice: (emoji, name) => `${emoji}・${name}`,
  },
  bar: {
    label: 'Emoji z kreską',
    emoji: '📍',
    description: 'Wyraźny separator: emoji┃nazwa',
    text: (emoji, name) => `${emoji}┃${name}`,
    voice: (emoji, name) => `${emoji}┃${name}`,
  },
  bracket: {
    label: 'Nawiasy japońskie',
    emoji: '🎴',
    description: 'Estetyczny styl: 『emoji』nazwa',
    text: (emoji, name) => `『${emoji}』${name}`,
    voice: (emoji, name) => `『${emoji}』${name}`,
  },
  tree: {
    label: 'Drzewko',
    emoji: '🌳',
    description: 'Kanały połączone liniami: ╭ ├ ╰',
    text: (emoji, name, pos = {}) => `${treeGlyph(pos)}${emoji}・${name}`,
    voice: (emoji, name, pos = {}) => `${treeGlyph(pos)}${emoji}・${name}`,
  },
  fancy: {
    label: 'Kapitaliki (ꜰᴀɴᴄʏ)',
    emoji: '✨',
    description: 'Ozdobna czcionka: emoji︱ᴋᴀᴘɪᴛᴀʟɪᴋɪ',
    text: (emoji, name) => `${emoji}︱${toSmallCaps(name)}`,
    voice: (emoji, name) => `${emoji}︱${toSmallCaps(name)}`,
  },
};

function treeGlyph({ first, last }) {
  if (first && last) return '╰';
  if (first) return '╭';
  if (last) return '╰';
  return '├';
}

/** Style kategorii (Discord i tak wyświetla kategorie wielkimi literami). */
const CATEGORY_STYLES = {
  plain: {
    label: 'Zwykły',
    emoji: '🔤',
    description: 'INFORMACJE',
    format: (emoji, name) => name,
  },
  emoji: {
    label: 'Z emoji',
    emoji: '📌',
    description: '📌 INFORMACJE',
    format: (emoji, name) => `${emoji} ${name}`,
  },
  lines: {
    label: 'Linie',
    emoji: '➖',
    description: '━━ 📌 INFORMACJE ━━',
    format: (emoji, name) => `━━ ${emoji} ${name} ━━`,
  },
  bracket: {
    label: 'Nawiasy',
    emoji: '🔲',
    description: '〔 📌 INFORMACJE 〕',
    format: (emoji, name) => `〔 ${emoji} ${name} 〕`,
  },
  tree: {
    label: 'Gałąź',
    emoji: '🌿',
    description: '╭─── 📌 INFORMACJE',
    format: (emoji, name) => `╭─── ${emoji} ${name}`,
  },
  stars: {
    label: 'Gwiazdki',
    emoji: '✴️',
    description: '✦ 📌 INFORMACJE ✦',
    format: (emoji, name) => `✦ ${emoji} ${name} ✦`,
  },
};

/**
 * Palety kolorów ról. Klucze odpowiadają "slotom" kolorów używanym w katalogu ról.
 * Uwaga: kolor 0 oznacza w Discordzie "brak koloru", dlatego czarny to 0x010101.
 */
const PALETTES = {
  modern: {
    label: 'Nowoczesna',
    emoji: '🌈',
    description: 'Żywe, czytelne kolory – uniwersalny wybór',
    embed: 0x5865f2,
    owner: 0xffc300, coowner: 0xff9f1a, management: 0xff6b35, admin: 0xe74c3c, mod: 0x3498db,
    helper: 0x2ecc71, trial: 0x1abc9c, func: 0x9b59b6, func2: 0xe056fd, staffExtra: 0x00a8ff,
    bots: 0x7f8c8d, vip: 0xe91e63, partner: 0x00bcd4, special: 0xf368e0, active: 0xff7043,
    veteran: 0x8e44ad, member: 0, access: 0x48dbfb,
    levels: [0x95a5a6, 0xf39c12],
  },
  pastel: {
    label: 'Pastelowa',
    emoji: '🍬',
    description: 'Delikatne, jasne barwy – przytulny klimat',
    embed: 0xa0c4ff,
    owner: 0xffd6a5, coowner: 0xfdffb6, management: 0xffc8a2, admin: 0xffadad, mod: 0xa0c4ff,
    helper: 0xcaffbf, trial: 0x9bf6ff, func: 0xbdb2ff, func2: 0xffc6ff, staffExtra: 0xb5ead7,
    bots: 0xc7ceea, vip: 0xffc6ff, partner: 0x9bf6ff, special: 0xf1c0e8, active: 0xffb4a2,
    veteran: 0xcdb4db, member: 0, access: 0xa2d2ff,
    levels: [0xe2ece9, 0xffd6a5],
  },
  neon: {
    label: 'Neonowa',
    emoji: '⚡',
    description: 'Jaskrawe, świecące kolory – gamingowy vibe',
    embed: 0xbc13fe,
    owner: 0xfff01f, coowner: 0xffac1c, management: 0xff5f1f, admin: 0xff0055, mod: 0x00e5ff,
    helper: 0x39ff14, trial: 0x00ffc8, func: 0xbc13fe, func2: 0xff44cc, staffExtra: 0x1f51ff,
    bots: 0x8a8aff, vip: 0xff00ff, partner: 0x00ffff, special: 0xff6ec7, active: 0xff3131,
    veteran: 0x9d00ff, member: 0, access: 0x04d9ff,
    levels: [0x00ffc8, 0xff00ff],
  },
  mono: {
    label: 'Monochromatyczna',
    emoji: '🖤',
    description: 'Odcienie bieli i szarości – minimalizm',
    embed: 0x2b2d31,
    owner: 0xffffff, coowner: 0xf2f2f2, management: 0xe6e6e6, admin: 0xd9d9d9, mod: 0xbfbfbf,
    helper: 0xa6a6a6, trial: 0x8c8c8c, func: 0xcccccc, func2: 0xb3b3b3, staffExtra: 0x999999,
    bots: 0x737373, vip: 0xe0e0e0, partner: 0xc4c4c4, special: 0xd4d4d4, active: 0xb0b0b0,
    veteran: 0x9a9a9a, member: 0, access: 0xbdbdbd,
    levels: [0x5c5c5c, 0xffffff],
  },
  warm: {
    label: 'Ciepła',
    emoji: '🔥',
    description: 'Złoto, czerwień i pomarańcz',
    embed: 0xff7f50,
    owner: 0xffd700, coowner: 0xffbf00, management: 0xff8c00, admin: 0xff4500, mod: 0xff6347,
    helper: 0xffa07a, trial: 0xf4a460, func: 0xdc143c, func2: 0xff69b4, staffExtra: 0xcd853f,
    bots: 0xa0522d, vip: 0xff1493, partner: 0xffa500, special: 0xff7f50, active: 0xff4500,
    veteran: 0xb22222, member: 0, access: 0xffb347,
    levels: [0xffe4b5, 0xff4500],
  },
  cool: {
    label: 'Chłodna',
    emoji: '❄️',
    description: 'Błękity, turkusy i fiolety',
    embed: 0x1e90ff,
    owner: 0x00bfff, coowner: 0x87cefa, management: 0x6495ed, admin: 0x4169e1, mod: 0x1e90ff,
    helper: 0x20b2aa, trial: 0x48d1cc, func: 0x9370db, func2: 0xba55d3, staffExtra: 0x5f9ea0,
    bots: 0x708090, vip: 0x7b68ee, partner: 0x40e0d0, special: 0xb0e0e6, active: 0x00ced1,
    veteran: 0x483d8b, member: 0, access: 0x87ceeb,
    levels: [0xb0c4de, 0x0000cd],
  },
  royal: {
    label: 'Królewska',
    emoji: '👑',
    description: 'Złoto i purpura – prestiżowy wygląd',
    embed: 0x9b59b6,
    owner: 0xd4af37, coowner: 0xc5a028, management: 0xb8860b, admin: 0x9b30ff, mod: 0x7b68ee,
    helper: 0x8a2be2, trial: 0xba55d3, func: 0xdaa520, func2: 0xda70d6, staffExtra: 0x6a5acd,
    bots: 0x778899, vip: 0xffd700, partner: 0xdda0dd, special: 0xee82ee, active: 0xff8c00,
    veteran: 0x4b0082, member: 0, access: 0xb39ddb,
    levels: [0xc0c0c0, 0xd4af37],
  },
};

/** Kolory do samodzielnego wyboru przez członków (grupa „Kolory”). */
const COLOR_ROLES = [
  { key: 'red', name: { pl: 'Czerwony', en: 'Red' }, emoji: '🔴', color: 0xe74c3c },
  { key: 'orange', name: { pl: 'Pomarańczowy', en: 'Orange' }, emoji: '🟠', color: 0xe67e22 },
  { key: 'yellow', name: { pl: 'Żółty', en: 'Yellow' }, emoji: '🟡', color: 0xf1c40f },
  { key: 'lime', name: { pl: 'Limonkowy', en: 'Lime' }, emoji: '🍏', color: 0xa3e635 },
  { key: 'green', name: { pl: 'Zielony', en: 'Green' }, emoji: '🟢', color: 0x2ecc71 },
  { key: 'mint', name: { pl: 'Miętowy', en: 'Mint' }, emoji: '🌿', color: 0x1abc9c },
  { key: 'sky', name: { pl: 'Błękitny', en: 'Sky blue' }, emoji: '💧', color: 0x5dade2 },
  { key: 'blue', name: { pl: 'Niebieski', en: 'Blue' }, emoji: '🔵', color: 0x3498db },
  { key: 'navy', name: { pl: 'Granatowy', en: 'Navy' }, emoji: '🌌', color: 0x34495e },
  { key: 'purple', name: { pl: 'Fioletowy', en: 'Purple' }, emoji: '🟣', color: 0x9b59b6 },
  { key: 'pink', name: { pl: 'Różowy', en: 'Pink' }, emoji: '🌸', color: 0xff69b4 },
  { key: 'white', name: { pl: 'Biały', en: 'White' }, emoji: '⚪', color: 0xffffff },
  { key: 'gray', name: { pl: 'Szary', en: 'Gray' }, emoji: '🔘', color: 0x95a5a6 },
  { key: 'black', name: { pl: 'Czarny', en: 'Black' }, emoji: '⚫', color: 0x010101 },
];

/** Kolory embedów (wiadomości bota na budowanym serwerze). */
const EMBED_COLORS = {
  palette: { label: 'Z palety ról', emoji: '🎨', color: null },
  blurple: { label: 'Discord Blurple', emoji: '🟦', color: 0x5865f2 },
  red: { label: 'Czerwony', emoji: '🟥', color: 0xe74c3c },
  green: { label: 'Zielony', emoji: '🟩', color: 0x2ecc71 },
  gold: { label: 'Złoty', emoji: '🟨', color: 0xf1c40f },
  purple: { label: 'Fioletowy', emoji: '🟪', color: 0x9b59b6 },
  orange: { label: 'Pomarańczowy', emoji: '🟧', color: 0xe67e22 },
  dark: { label: 'Ciemny (niewidoczny pasek)', emoji: '⬛', color: 0x2b2d31 },
};

/** Liniowa interpolacja koloru – do gradientu ról poziomów. */
function lerpColor(from, to, t) {
  const f = [(from >> 16) & 255, (from >> 8) & 255, from & 255];
  const s = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
  const c = f.map((v, i) => Math.round(v + (s[i] - v) * t));
  const value = (c[0] << 16) | (c[1] << 8) | c[2];
  return value === 0 ? 0x010101 : value;
}

module.exports = {
  CHANNEL_STYLES,
  CATEGORY_STYLES,
  PALETTES,
  COLOR_ROLES,
  EMBED_COLORS,
  toSmallCaps,
  lerpColor,
};
