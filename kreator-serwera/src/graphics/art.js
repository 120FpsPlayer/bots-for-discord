'use strict';

const E = require('./engine');

/**
 * Grafiki tworzone podczas budowy: banery nad treściami (regulamin, informacje…),
 * ikona serwera z inicjałów i paczka emoji serwera (odznaki w kolorze serwera).
 */

// ───────────── Banery ─────────────

/** Baner dla rodzaju wiadomości: [emoji, tytuł PL, tytuł EN]. */
const BANNERS = {
  rules: ['📜', 'Regulamin', 'Rules'],
  info: ['ℹ️', 'Informacje', 'Information'],
  faq: ['❓', 'FAQ', 'FAQ'],
  rolesInfo: ['🎭', 'Role serwera', 'Server roles'],
  welcomeChat: ['👋', 'Witaj!', 'Welcome!'],
  staffGuide: ['🛡️', 'Poradnik ekipy', 'Staff guide'],
  boosts: ['💎', 'Boosty', 'Boosts'],
  partnerships: ['🤝', 'Partnerstwa', 'Partnerships'],
  suggestions: ['💡', 'Propozycje', 'Suggestions'],
  qotd: ['❔', 'Pytanie dnia', 'Question of the day'],
  counting: ['🔢', 'Liczenie', 'Counting'],
  announcement: ['📢', 'Ogłoszenie', 'Announcement'],
};

function bannerFor(kind, lang = 'pl') {
  const b = BANNERS[kind];
  return b ? { emoji: b[0], title: lang === 'en' ? b[2] : b[1] } : null;
}

/**
 * Baner 1000×280 w kolorze serwera: gradient, ozdobne pasy, duże emoji i tytuł.
 * @returns {Promise<Buffer>} PNG
 */
async function renderBanner({ title, subtitle = '', emoji = '', color = 0x5865f2, width = 1000, height = 280 }) {
  await E.preloadEmojis([emoji, title, subtitle]);
  const canvas = E.createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, E.shade(color, 0.12));
  g.addColorStop(0.55, E.shade(color, -0.3));
  g.addColorStop(1, E.shade(color, -0.7));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // Ozdoby: ukośne pasy i koła
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < width / 70 + 4; i += 1) {
    const x = i * 70 - height;
    ctx.beginPath();
    ctx.moveTo(x, height); ctx.lineTo(x + 34, height); ctx.lineTo(x + 34 + height, 0); ctx.lineTo(x + height, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 0.08;
  ctx.beginPath(); ctx.arc(width - 90, 40, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(width - 250, height + 60, 140, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Przyciemnienie dołu i pasek akcentu
  const shadow = ctx.createLinearGradient(0, height * 0.55, 0, height);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = E.shade(color, 0.35);
  ctx.fillRect(0, height - 8, width, 8);

  // Emoji w kole
  let textX = 64;
  if (emoji) {
    const cx = 64 + 90;
    const cy = height / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(cx, cy, 92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    E.drawText(ctx, emoji, cx - 58, cy + 48, { size: 100 });
    textX = cx + 92 + 44;
  }

  // Tytuł (zmniejszany, aż się zmieści) i podtytuł
  const maxW = width - textX - 56;
  const upper = String(title).toLocaleUpperCase('pl');
  let size = 76;
  while (size > 30 && E.measureText(ctx, upper, { size, bold: true }) > maxW) size -= 2;
  const titleY = subtitle ? height / 2 + size * 0.2 : height / 2 + size * 0.36;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  E.drawText(ctx, upper, textX, titleY, { size, bold: true, color: '#ffffff', maxWidth: maxW });
  ctx.restore();
  if (subtitle) E.drawText(ctx, subtitle, textX + 2, titleY + 50, { size: 28, color: 'rgba(255,255,255,0.88)', maxWidth: maxW });

  return canvas.toBuffer('image/png');
}

// ───────────── Ikona serwera ─────────────

/**
 * Ikona 512×512 z inicjałów nazwy (albo emoji, jeśli nazwa nie ma liter).
 * @returns {Promise<Buffer>} PNG
 */
async function renderIcon({ name, color = 0x5865f2, emoji = '' }) {
  const size = 512;
  const text = E.initials(name) || '';
  await E.preloadEmojis([emoji]);
  const canvas = E.createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, E.shade(color, 0.25));
  g.addColorStop(1, E.shade(color, -0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(size * 0.85, size * 0.12, 210, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.1, size * 0.95, 170, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 34, 0, Math.PI * 2); ctx.stroke();

  if (text) {
    let fs = text.length > 1 ? 210 : 260;
    while (fs > 80 && E.measureText(ctx, text, { size: fs, bold: true }) > size - 150) fs -= 6;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    E.drawText(ctx, text, size / 2, size / 2 + fs * 0.36, { size: fs, bold: true, color: '#ffffff', align: 'center' });
    ctx.restore();
  } else if (emoji) {
    E.drawText(ctx, emoji, size / 2 - 115, size / 2 + 105, { size: 200 });
  }
  return canvas.toBuffer('image/png');
}

// ───────────── Paczka emoji serwera ─────────────

/** Odznaki tekstowe pod typ serwera (nazwa emoji = tekst małymi literami). */
const TYPE_BADGES = {
  gaming: ['GG', 'EZ', 'AFK', 'GLHF'],
  minecraft: ['MC', 'PVP', 'IP'],
  rp: ['RP', 'IC', 'OOC'],
  esport: ['GG', 'MVP', 'WIN'],
  programming: ['JS', 'PY', 'BUG', 'PR'],
  school: ['A+', 'HW', 'OK'],
  business: ['OK', 'TODO', 'KPI'],
  creator: ['LIVE', 'SUB', 'NEW'],
  music: ['DJ', 'LIVE', 'MIX'],
  anime: ['UWU', 'OWO', 'ANI'],
  fantasy: ['RPG', 'XP', 'LVL'],
  shop: ['SALE', 'NEW', 'PRO'],
  friends: ['LOL', 'XD', 'GG'],
  art: ['ART', 'WIP', 'NEW'],
  support: ['FAQ', 'FIX', 'BUG'],
  community: ['LOL', 'GG', 'XD'],
  sport: ['GYM', 'PR', 'WIN'],
  movies: ['10', 'TOP', 'NEW'],
  trading: ['BUY', 'SELL', 'PNL'],
  event: ['LIVE', 'NOW', 'NEW'],
};
const BASE_BADGES = ['NEW', 'HOT', 'VIP', 'TOP'];

const EMOJI_SIZE = 128;

function emojiCanvas() {
  const canvas = E.createCanvas(EMOJI_SIZE, EMOJI_SIZE);
  return { canvas, ctx: canvas.getContext('2d') };
}

function circle(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
}

function strokePath(ctx, points, width = 14) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function badge(ctx, text, color) {
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, E.shade(color, 0.15));
  g.addColorStop(1, E.shade(color, -0.35));
  ctx.fillStyle = g;
  E.roundRect(ctx, 4, 22, 120, 84, 22);
  ctx.fill();
  let size = 56;
  while (size > 18 && E.measureText(ctx, text, { size, bold: true }) > 104) size -= 2;
  E.drawText(ctx, text, 64, 64 + size * 0.36, { size, bold: true, color: '#ffffff', align: 'center' });
}

/**
 * Paczka emoji w kolorze serwera: statusy, znaczniki (tak/nie/uwaga/info), strzałka, kropka
 * i odznaki tekstowe dopasowane do typu serwera.
 * @returns {Promise<Array<{ name: string, buffer: Buffer }>>}
 */
async function renderEmojiPack({ type, color = 0x5865f2 }) {
  const out = [];
  const add = (name, draw) => {
    const { canvas, ctx } = emojiCanvas();
    draw(ctx);
    out.push({ name, buffer: canvas.toBuffer('image/png') });
  };

  add('online', (ctx) => circle(ctx, '#23a55a'));
  add('zaraz', (ctx) => {
    circle(ctx, '#f0b232');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(38, 40, 40, 0, Math.PI * 2); ctx.fill();
  });
  add('zajety', (ctx) => {
    circle(ctx, '#f23f43');
    ctx.fillStyle = '#ffffff';
    E.roundRect(ctx, 26, 54, 76, 20, 10); ctx.fill();
  });
  add('offline', (ctx) => {
    ctx.strokeStyle = '#80848e'; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(64, 64, 45, 0, Math.PI * 2); ctx.stroke();
  });
  add('tak', (ctx) => { circle(ctx, '#23a55a'); strokePath(ctx, [[36, 66], [56, 86], [94, 44]]); });
  add('nie', (ctx) => { circle(ctx, '#f23f43'); strokePath(ctx, [[42, 42], [86, 86]]); strokePath(ctx, [[86, 42], [42, 86]]); });
  add('uwaga', (ctx) => {
    ctx.fillStyle = '#f0b232';
    ctx.beginPath(); ctx.moveTo(64, 8); ctx.lineTo(124, 116); ctx.lineTo(4, 116); ctx.closePath(); ctx.fill();
    strokePath(ctx, [[64, 48], [64, 78]], 14);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(64, 98, 8, 0, Math.PI * 2); ctx.fill();
  });
  add('info', (ctx) => {
    circle(ctx, '#5865f2');
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(64, 38, 9, 0, Math.PI * 2); ctx.fill();
    strokePath(ctx, [[64, 58], [64, 92]], 16);
  });
  add('strzalka', (ctx) => {
    ctx.fillStyle = E.hex(color);
    ctx.beginPath();
    ctx.moveTo(12, 48); ctx.lineTo(70, 48); ctx.lineTo(70, 22); ctx.lineTo(118, 64); ctx.lineTo(70, 106); ctx.lineTo(70, 80); ctx.lineTo(12, 80);
    ctx.closePath(); ctx.fill();
  });
  add('kropka', (ctx) => {
    ctx.fillStyle = E.hex(color);
    ctx.beginPath(); ctx.arc(64, 64, 30, 0, Math.PI * 2); ctx.fill();
  });

  const texts = [...new Set([...(TYPE_BADGES[type] || []), ...BASE_BADGES])];
  for (const text of texts) {
    const name = text.toLowerCase().replace('+', 'plus').replace(/[^a-z0-9_]/g, '');
    if (name.length < 2 || out.some((e) => e.name === name)) continue;
    add(name, (ctx) => badge(ctx, text, color));
  }
  return out;
}

module.exports = { renderBanner, renderIcon, renderEmojiPack, bannerFor, BANNERS, TYPE_BADGES };
