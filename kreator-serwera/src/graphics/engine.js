'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('../utils/logger');

const log = createLogger('grafika');

/**
 * Silnik grafiki: @napi-rs/canvas (Skia) + czcionka DejaVu Sans + emoji Twemoji (SVG).
 * Wszystko jest dołączone do bota (nie korzysta z czcionek systemu), więc obrazki wyglądają
 * tak samo na Wispbyte, Windowsie i Linuksie. Jeśli biblioteka graficzna nie zadziała na danym
 * hostingu, bot działa dalej – po prostu bez obrazków (available() zwraca false).
 */

let lib = null;
let loadError = null;
try {
  lib = require('@napi-rs/canvas');
} catch (err) {
  loadError = err;
}

const FONT = 'Kreator Sans';
const FONT_BOLD = 'Kreator Sans Bold';

/**
 * Czcionki banerów (assets/fonts, licencja SIL OFL). Nazwa rodziny → plik.
 * Brakujące znaki (np. ramki ╭├ w nazwach) dobierane są automatycznie z DejaVu Sans.
 */
const DISPLAY_FONTS = {
  'KS Chakra Bold': 'ChakraPetch_700Bold.ttf',
  'KS Chakra': 'ChakraPetch_500Medium.ttf',
  'KS Exo Bold': 'Exo2_800ExtraBold.ttf',
  'KS Exo Black Italic': 'Exo2_900Black_Italic.ttf',
  'KS Bebas': 'BebasNeue_400Regular.ttf',
  'KS Oswald Light': 'Oswald_300Light.ttf',
  'KS Oswald': 'Oswald_500Medium.ttf',
  'KS Cinzel Black': 'Cinzel_900Black.ttf',
  'KS Cinzel Bold': 'Cinzel_700Bold.ttf',
  'KS Pixel': 'PressStart2P_400Regular.ttf',
  'KS Montserrat Black': 'Montserrat_800ExtraBold.ttf',
  'KS Montserrat Light': 'Montserrat_300Light.ttf',
  'KS Montserrat': 'Montserrat_500Medium.ttf',
  'KS Righteous': 'Righteous_400Regular.ttf',
};
const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
let ready = null;
let emojiDir = null;

function init() {
  if (ready !== null) return ready;
  if (!lib) {
    log.warn(`Grafika wyłączona – biblioteka @napi-rs/canvas niedostępna (${loadError?.message?.split('\n')[0]}).`);
    ready = false;
    return ready;
  }
  try {
    const fonts = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
    lib.GlobalFonts.registerFromPath(path.join(fonts, 'DejaVuSans.ttf'), FONT);
    lib.GlobalFonts.registerFromPath(path.join(fonts, 'DejaVuSans-Bold.ttf'), FONT_BOLD);
    for (const [family, file] of Object.entries(DISPLAY_FONTS)) {
      const full = path.join(FONTS_DIR, file);
      if (fs.existsSync(full)) lib.GlobalFonts.registerFromPath(full, family);
      else log.warn(`Brak czcionki ${file} – banery użyją czcionki zapasowej.`);
    }
    emojiDir = path.dirname(require.resolve('@twemoji/svg/package.json'));
    ready = true;
  } catch (err) {
    loadError = err;
    log.warn(`Grafika wyłączona – brak czcionek lub emoji (${err.message}).`);
    ready = false;
  }
  return ready;
}

/** Czy można generować obrazki na tym hostingu. */
function available() {
  return init();
}

function unavailableReason() {
  init();
  return loadError ? String(loadError.message).split('\n')[0] : null;
}

// ───────────── emoji ─────────────

const segmenter = new Intl.Segmenter('pl', { granularity: 'grapheme' });
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const isEmoji = (g) => EMOJI_RE.test(g);

/** Nazwa pliku Twemoji: kody znaków (hex) połączone „-”, bez FE0F, chyba że to sekwencja ZWJ. */
function emojiFileName(g) {
  const cps = [...g].map((c) => c.codePointAt(0).toString(16));
  return `${(cps.includes('200d') ? cps : cps.filter((c) => c !== 'fe0f')).join('-')}.svg`;
}

const emojiCache = new Map();

async function loadEmoji(g) {
  if (emojiCache.has(g)) return emojiCache.get(g);
  let img = null;
  try {
    const file = path.join(emojiDir, emojiFileName(g));
    // SVG ma 36×36 – rasteryzujemy w 512×512, żeby duże emoji (np. na banerach) były ostre.
    if (fs.existsSync(file)) {
      const svg = fs.readFileSync(file, 'utf8').replace(/^<svg(?![^>]*\swidth=)/, '<svg width="512" height="512"');
      img = await lib.loadImage(Buffer.from(svg));
    }
  } catch {
    img = null;
  }
  emojiCache.set(g, img);
  return img;
}

/** Wczytuje emoji ze wszystkich tekstów (rysowanie jest potem synchroniczne). */
async function preloadEmojis(texts) {
  if (!init()) return;
  const wanted = new Set();
  for (const t of texts) for (const { segment } of segmenter.segment(String(t ?? ''))) if (isEmoji(segment)) wanted.add(segment);
  await Promise.all([...wanted].map(loadEmoji));
}

// ───────────── tekst z emoji ─────────────

/** Znaki spoza czcionki (japońskie nawiasy/kropki ze stylów nazw) → najbliższe odpowiedniki. */
const SUBSTITUTE = { '・': '·', '『': '⟦', '』': '⟧', '︱': '│', '〔': '[', '〕': ']', '️': '' };

function runsOf(text) {
  const runs = [];
  for (const { segment } of segmenter.segment(String(text ?? ''))) {
    if (isEmoji(segment)) {
      runs.push({ emoji: segment });
    } else {
      const t = [...segment].map((c) => SUBSTITUTE[c] ?? c).join('');
      const last = runs[runs.length - 1];
      if (last && last.text !== undefined) last.text += t;
      else runs.push({ text: t });
    }
  }
  return runs;
}

/** Czcionka CSS: wybrana rodzina + DejaVu jako zapas dla znaków, których ona nie ma. */
const fontSpec = (size, bold, family = null) => (family
  ? `${size}px "${family}", "${bold ? FONT_BOLD : FONT}", "${FONT}"`
  : `${size}px "${bold ? FONT_BOLD : FONT}"`);
const emojiBox = (size) => Math.round(size * 1.18);

function measureText(ctx, text, { size = 16, bold = false, family = null, spacing = 0 } = {}) {
  ctx.font = fontSpec(size, bold, family);
  ctx.letterSpacing = `${spacing}px`;
  let w = 0;
  for (const r of runsOf(text)) w += r.emoji ? emojiBox(size) + 2 + spacing : ctx.measureText(r.text).width;
  ctx.letterSpacing = '0px';
  return Math.max(0, w - spacing);
}

/** Przycina tekst do szerokości (z „…”). */
function fitText(ctx, text, maxWidth, opts) {
  if (measureText(ctx, text, opts) <= maxWidth) return text;
  const graphemes = [...segmenter.segment(String(text))].map((s) => s.segment);
  while (graphemes.length && measureText(ctx, `${graphemes.join('')}…`, opts) > maxWidth) graphemes.pop();
  return `${graphemes.join('').trimEnd()}…`;
}

/**
 * Rysuje tekst z emoji (emoji jako obrazki Twemoji). y = linia bazowa. Zwraca szerokość.
 * Emoji muszą być wcześniej wczytane przez preloadEmojis().
 */
/**
 * Rysuje tekst z emoji. Opcje: family (czcionka z DISPLAY_FONTS), spacing (odstęp liter w px),
 * stroke { color, width } – obrys pod tekstem, color może być gradientem.
 */
function drawText(ctx, text, x, y, {
  size = 16, bold = false, color = '#dbdee1', maxWidth = Infinity, align = 'left', family = null, spacing = 0, stroke = null,
} = {}) {
  const opts = { size, bold, family, spacing };
  const shown = Number.isFinite(maxWidth) ? fitText(ctx, text, maxWidth, opts) : text;
  const width = measureText(ctx, shown, opts);
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.font = fontSpec(size, bold, family);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${spacing}px`;
  for (const r of runsOf(shown)) {
    if (r.emoji) {
      const box = emojiBox(size);
      const img = emojiCache.get(r.emoji);
      if (img) ctx.drawImage(img, cx + 1, y - box * 0.84, box, box);
      cx += box + 2 + spacing;
    } else {
      if (stroke) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.width;
        ctx.strokeStyle = stroke.color;
        ctx.strokeText(r.text, cx, y);
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(r.text, cx, y);
      cx += ctx.measureText(r.text).width;
    }
  }
  ctx.letterSpacing = '0px';
  return width;
}

// ───────────── pomocnicze ─────────────

const hex = (n) => `#${(Number(n) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;

/** Rozjaśnia (amount > 0) albo przyciemnia (amount < 0) kolor. */
function shade(color, amount) {
  const n = Number(color) & 0xffffff;
  const ch = (v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return hex((ch(n >> 16 & 255) << 16) | (ch(n >> 8 & 255) << 8) | ch(n & 255));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createCanvas(w, h) {
  if (!init()) throw new Error('Grafika niedostępna na tym hostingu.');
  return lib.createCanvas(Math.ceil(w), Math.ceil(h));
}

async function loadImage(src) {
  if (!init()) throw new Error('Grafika niedostępna na tym hostingu.');
  return lib.loadImage(src);
}

/** Jasność koloru 0–1 (do czytelności ciemnych kolorów na ciemnym tle). */
function luminance(color) {
  const n = Number(color) & 0xffffff;
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
}

/** Pierwsze litery nazwy (bez emoji i ozdobników) – do ikony serwera. */
function initials(name) {
  const words = String(name || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) {
    // CraftLand → CL, Kraina → KR
    const caps = words[0].match(/\p{Lu}/gu) || [];
    return (caps.length >= 2 ? caps.slice(0, 2).join('') : words[0].slice(0, 2)).toLocaleUpperCase('pl');
  }
  return (words[0][0] + words[1][0]).toLocaleUpperCase('pl');
}

module.exports = {
  available, unavailableReason, createCanvas, loadImage, preloadEmojis, drawText, measureText, fitText,
  runsOf, emojiFileName, isEmoji, hex, shade, luminance, roundRect, initials, FONT, FONT_BOLD, fontSpec, DISPLAY_FONTS,
};
