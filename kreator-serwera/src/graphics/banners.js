'use strict';

const E = require('./engine');

/**
 * Style banerów nad treściami (regulamin, informacje, FAQ…).
 * Każdy styl to osobna „scena” rysowana od zera: tło, efekty, ozdoby i typografia z własną czcionką.
 * Wszystko jest deterministyczne (ten sam tytuł = ten sam obrazek) – losowość pochodzi z ziarna.
 */

const W = 1500;
const H = 500;

// ───────────── narzędzia ─────────────

function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generator liczb pseudolosowych (mulberry32) – powtarzalny dla ziarna. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const rgba = (c, a) => {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
};

function toHsl(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Ten sam kolor z inną jasnością/nasyceniem albo przesuniętym odcieniem. */
function tone(c, { h = 0, s = null, l = null } = {}) {
  const [h0, s0, l0] = toHsl(c);
  return fromHsl((h0 + h + 360) % 360, s ?? s0, l ?? l0);
}

/** Kolor akcentu: szary kolor serwera zamieniamy na wyrazisty, żeby efekty świeciły. */
function vivid(c, min = 0.55) {
  const [h, s, l] = toHsl(c);
  return fromHsl(h, Math.max(s, s < 0.12 ? 0 : min), Math.min(0.65, Math.max(0.45, l)));
}

function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
}

/** Szum ziarna filmowego (monochromatyczny) nałożony na obraz. */
function grain(ctx, rand, amount = 0.06, w = W, h = H) {
  const tile = E.createCanvas(256, 256);
  const t = tile.getContext('2d');
  const img = t.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function vignette(ctx, strength = 0.55, color = '0,0,0') {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Szum 1D (suma oktaw) – do grzbietów gór i terenu. */
function ridge(rand, octaves = 5) {
  const layers = [];
  for (let o = 0; o < octaves; o += 1) {
    const n = 4 * 2 ** o;
    layers.push({ amp: 1 / 2 ** o, pts: Array.from({ length: n + 2 }, () => rand()), n });
  }
  const total = layers.reduce((a, l) => a + l.amp, 0);
  return (x) => {
    let v = 0;
    for (const l of layers) {
      const f = x * l.n;
      const i = Math.floor(f);
      const t = f - i;
      const s = t * t * (3 - 2 * t);
      v += (l.pts[i] * (1 - s) + l.pts[i + 1] * s) * l.amp;
    }
    return v / total;
  };
}

function polygon(ctx, cx, cy, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rot + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Największy rozmiar czcionki, przy którym tekst mieści się w szerokości. */
function fit(ctx, text, { family, max, min = 18, width, spacing = 0, bold = false }) {
  let size = max;
  while (size > min && E.measureText(ctx, text, { size, family, spacing, bold }) > width) size -= 2;
  return size;
}

/** Perspektywiczna siatka „podłogi” (synthwave / cyber). */
function perspectiveGrid(ctx, { horizon, color, alpha = 0.8, lines = 26, rows = 14, glow = 12, width = 2 }) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, W, H - horizon);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  const vx = W / 2;
  for (let i = -lines; i <= lines; i += 1) {
    ctx.globalAlpha = alpha * (1 - Math.abs(i) / (lines + 4));
    ctx.beginPath();
    ctx.moveTo(vx + i * 12, horizon);
    ctx.lineTo(vx + i * 150, H + 40);
    ctx.stroke();
  }
  for (let j = 1; j <= rows; j += 1) {
    const t = j / rows;
    const y = horizon + (H - horizon) * t * t;
    ctx.globalAlpha = alpha * Math.min(1, t * 1.6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  const fade = ctx.createLinearGradient(0, horizon, 0, horizon + 70);
  fade.addColorStop(0, 'rgba(0,0,0,0.55)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, horizon, W, 70);
}

// ───────────── style ─────────────

/** ✨ Nowoczesny: miękkie światła w kolorach serwera, szklana plakietka, mocna typografia. */
function modern(ctx, { title, subtitle, emoji, color, rand }) {
  const accent = vivid(color);
  ctx.fillStyle = E.hex(tone(accent, { l: 0.09, s: 0.45 }));
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [x, y, r, c, a] of [
    [W * 0.12, H * 0.1, 520, accent, 0.55],
    [W * 0.55, H * 1.05, 600, tone(accent, { h: 40 }), 0.45],
    [W * 0.95, H * 0.15, 560, tone(accent, { h: -45 }), 0.5],
    [W * 0.75, H * 0.55, 300, tone(accent, { h: 20, l: 0.7 }), 0.25],
  ]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  // Delikatne łuki i siatka kropek
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.arc(W * 0.86, H * 0.5, 120 + i * 70, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let x = 0; x < 8; x += 1) for (let y = 0; y < 5; y += 1) {
    ctx.beginPath();
    ctx.arc(W - 330 + x * 24, 60 + y * 24, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  grain(ctx, rand, 0.05);

  // Szklana plakietka z emoji
  const cx = 250;
  const cy = H / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  E.roundRect(ctx, cx - 135, cy - 135, 270, 270, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.restore();
  E.roundRect(ctx, cx - 135, cy - 135, 270, 270, 64);
  const edge = ctx.createLinearGradient(cx - 135, cy - 135, cx + 135, cy + 135);
  edge.addColorStop(0, 'rgba(255,255,255,0.55)');
  edge.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (emoji) E.drawText(ctx, emoji, cx - 81, cy + 64, { size: 138 });

  const x = 470;
  const width = W - x - 90;
  const up = title.toLocaleUpperCase('pl');
  const size = fit(ctx, up, { family: 'KS Montserrat Black', max: 132, width, spacing: 2 });
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  E.drawText(ctx, up, x, H / 2 + size * 0.28, { size, family: 'KS Montserrat Black', color: '#ffffff', spacing: 2 });
  ctx.restore();
  if (subtitle) {
    const y = H / 2 + size * 0.28 + 74;
    E.roundRect(ctx, x + 4, y - 30, 56, 8, 4);
    ctx.fillStyle = E.hex(tone(accent, { l: 0.75 }));
    ctx.fill();
    E.drawText(ctx, subtitle, x + 80, y - 14, { size: 40, family: 'KS Montserrat Light', color: 'rgba(255,255,255,0.88)', maxWidth: width - 80, spacing: 1 });
  }
}

/** 🛰️ Futurystyczny: cyberpunkowy HUD, neonowa siatka, poświata i efekt glitch. */
function futuristic(ctx, { title, subtitle, emoji, color, rand }) {
  const accent = toHsl(color)[1] < 0.2 ? 0x00e5ff : vivid(color, 0.8);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#03050b');
  bg.addColorStop(0.62, E.hex(tone(accent, { l: 0.07, s: 0.6 })));
  bg.addColorStop(1, '#010206');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Heksagonalna siatka w tle
  ctx.save();
  ctx.strokeStyle = rgba(accent, 0.07);
  ctx.lineWidth = 1.5;
  const r = 34;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 28; col += 1) {
      const x = col * r * 1.75 + (row % 2) * r * 0.87;
      const y = row * r * 1.5;
      if (y > 340) continue;
      polygon(ctx, x, y, r, 6, Math.PI / 6);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Poświata horyzontu i siatka
  const horizon = 345;
  const glow = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 10);
  glow.addColorStop(0, rgba(accent, 0));
  glow.addColorStop(1, rgba(accent, 0.35));
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - 120, W, 130);
  perspectiveGrid(ctx, { horizon, color: E.hex(accent), alpha: 0.75, glow: 14 });
  ctx.fillStyle = E.hex(tone(accent, { l: 0.8 }));
  ctx.fillRect(0, horizon - 1, W, 2);

  // Ramka HUD
  ctx.save();
  ctx.strokeStyle = E.hex(accent);
  ctx.shadowColor = E.hex(accent);
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  const m = 26;
  const L = 70;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * L, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * L);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i += 1) {
    const x = 420 + i * 22;
    ctx.globalAlpha = i % 5 ? 0.35 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x, m + 4);
    ctx.lineTo(x, m + (i % 5 ? 12 : 22));
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 0.85;
  E.drawText(ctx, 'SYS://ONLINE', m + 16, m + 56, { size: 17, family: 'KS Chakra', color: E.hex(accent), spacing: 3 });
  E.drawText(ctx, `ID-${(hashStr(title) % 9000) + 1000}`, W - m - 110, m + 56, { size: 17, family: 'KS Chakra', color: E.hex(accent), spacing: 3, align: 'right' });
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < 4 ? E.hex(accent) : rgba(accent, 0.3);
    ctx.fillRect(W - m - 96 + i * 16, m + 56 - (8 + i * 4), 10, 8 + i * 4);
  }
  E.drawText(ctx, 'N 52°13′  E 21°00′', W - m - 16, H - m - 18, { size: 16, family: 'KS Chakra', color: E.hex(accent), spacing: 3, align: 'right' });
  ctx.globalAlpha = 1;

  // Heksagon z emoji
  const cx = 230;
  const cy = 210;
  ctx.save();
  ctx.shadowColor = E.hex(accent);
  ctx.shadowBlur = 25;
  polygon(ctx, cx, cy, 118, 6, Math.PI / 6);
  ctx.fillStyle = rgba(accent, 0.12);
  ctx.fill();
  ctx.strokeStyle = E.hex(accent);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = E.hex(tone(accent, { l: 0.78 }));
  polygon(ctx, cx, cy, 138, 6, 0);
  ctx.stroke();
  ctx.restore();
  if (emoji) E.drawText(ctx, emoji, cx - 64, cy + 54, { size: 108 });

  // Tytuł z aberracją chromatyczną i poświatą
  const up = title.toLocaleUpperCase('pl');
  const x = 410;
  const width = W - x - 80;
  const size = fit(ctx, up, { family: 'KS Chakra Bold', max: 128, width, spacing: 8 });
  const y = 222 + size * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75;
  E.drawText(ctx, up, x - 5, y, { size, family: 'KS Chakra Bold', color: '#ff2a55', spacing: 8 });
  E.drawText(ctx, up, x + 5, y, { size, family: 'KS Chakra Bold', color: E.hex(accent), spacing: 8 });
  ctx.restore();
  ctx.save();
  ctx.shadowColor = E.hex(accent);
  ctx.shadowBlur = 30;
  E.drawText(ctx, up, x, y, { size, family: 'KS Chakra Bold', color: '#f4fbff', spacing: 8 });
  ctx.restore();
  // Glitch – dwa przesunięte paski tytułu
  for (const [dy, dx] of [[-size * 0.28, 18], [size * 0.05, -14]]) {
    const sy = Math.round(y + dy);
    const strip = ctx.getImageData(x - 10, sy, Math.min(W - x, width + 40), 6);
    ctx.putImageData(strip, x - 10 + dx, sy);
  }
  if (subtitle) {
    const sub = `▸ ${subtitle}`;
    const w = E.drawText(ctx, sub, x + 4, y + 66, { size: 36, family: 'KS Chakra', color: E.hex(tone(accent, { l: 0.78 })), spacing: 4, maxWidth: width - 40 });
    ctx.fillStyle = E.hex(accent);
    ctx.fillRect(x + 14 + w, y + 36, 16, 34);
  }
  // Linie skanowania
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1.4);
  grain(ctx, rand, 0.05);
}

/** 🌆 Neon / Synthwave: zachód słońca lat 80., góry, siatka i chromowany napis. */
function synthwave(ctx, { title, subtitle, rand }) {
  const horizon = 330;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0d0221');
  sky.addColorStop(0.45, '#2a0a4a');
  sky.addColorStop(0.8, '#7a1a78');
  sky.addColorStop(1, '#ff3c8e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = '#0a0118';
  ctx.fillRect(0, horizon, W, H - horizon);
  // Gwiazdy
  for (let i = 0; i < 160; i += 1) {
    const y = rand() * horizon * 0.75;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
    ctx.fillRect(rand() * W, y, rand() < 0.1 ? 2.5 : 1.4, rand() < 0.1 ? 2.5 : 1.4);
  }
  // Słońce w paski (osobna warstwa – paski wycinamy tylko ze słońca, nie z nieba)
  const sx = W * 0.74;
  const sy = 205;
  const sr = 170;
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 1.9);
  halo.addColorStop(0, 'rgba(255,90,170,0.45)');
  halo.addColorStop(1, 'rgba(255,90,170,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, horizon);
  const layer = E.createCanvas(W, H);
  const l = layer.getContext('2d');
  const sun = l.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, '#fff36b');
  sun.addColorStop(0.45, '#ffa23c');
  sun.addColorStop(1, '#ff2e88');
  l.fillStyle = sun;
  l.beginPath();
  l.arc(sx, sy, sr, 0, Math.PI * 2);
  l.fill();
  l.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i += 1) l.fillRect(sx - sr, sy + 18 + i * 21, sr * 2, 4 + i * 2.2);
  l.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, horizon);
  ctx.clip();
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  // Góry z neonową krawędzią
  const hill = ridge(rng(hashStr(title) ^ 77), 5);
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, horizon - 30 - hill(x / W) * 120 * (0.4 + Math.abs(x - W / 2) / W));
  ctx.lineTo(W, horizon);
  ctx.closePath();
  ctx.fillStyle = '#180530';
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = '#ff4fd8';
  ctx.shadowColor = '#ff4fd8';
  ctx.shadowBlur = 16;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  perspectiveGrid(ctx, { horizon, color: '#ff3ccf', alpha: 0.9, glow: 18, width: 2.5 });
  ctx.fillStyle = '#ffd1f4';
  ctx.fillRect(0, horizon - 1, W, 2.5);

  // Chromowany tytuł
  const up = title.toLocaleUpperCase('pl');
  const x = 110;
  const width = W * 0.56;
  const size = fit(ctx, up, { family: 'KS Exo Black Italic', max: 140, width, spacing: 2 });
  const y = 190 + size * 0.2;
  const chrome = ctx.createLinearGradient(0, y - size * 0.8, 0, y + 6);
  chrome.addColorStop(0, '#e8f7ff');
  chrome.addColorStop(0.45, '#7fd8ff');
  chrome.addColorStop(0.5, '#1b1b4a');
  chrome.addColorStop(0.56, '#ffffff');
  chrome.addColorStop(1, '#ff7ad9');
  ctx.save();
  ctx.shadowColor = '#ff2fb4';
  ctx.shadowBlur = 36;
  E.drawText(ctx, up, x, y, { size, family: 'KS Exo Black Italic', color: chrome, spacing: 2, stroke: { color: '#2b0a3d', width: 10 } });
  ctx.restore();
  E.drawText(ctx, up, x, y, { size, family: 'KS Exo Black Italic', color: chrome, spacing: 2 });
  if (subtitle) {
    ctx.save();
    ctx.translate(x + 40, y + 78);
    ctx.rotate(-0.05);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 20;
    E.drawText(ctx, subtitle, 0, 0, { size: 50, family: 'KS Righteous', color: '#b8fbff', maxWidth: width, spacing: 2, stroke: { color: '#00c8ff', width: 3 } });
    ctx.restore();
  }
  grain(ctx, rand, 0.05);
}

/** 🏔️ Realistyczny: kinowy krajobraz o zmierzchu – warstwy gór, mgła, promienie światła, ziarno filmu. */
function realistic(ctx, { title, subtitle, color, rand }) {
  const tint = vivid(color, 0.4);
  const top = mix(0x0a1330, tone(tint, { l: 0.12 }), 0.35);
  const horizonC = mix(0xffa565, tone(tint, { l: 0.7 }), 0.18);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
  sky.addColorStop(0, E.hex(top));
  sky.addColorStop(0.55, E.hex(mix(top, 0x6a4c7a, 0.6)));
  sky.addColorStop(1, E.hex(horizonC));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Gwiazdy wysoko na niebie
  for (let i = 0; i < 120; i += 1) {
    const y = rand() * H * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${(0.15 + rand() * 0.5) * (1 - y / (H * 0.3))})`;
    ctx.fillRect(rand() * W, y, 1.3, 1.3);
  }
  // Słońce za górami i poświata
  const sx = W * 0.68;
  const sy = H * 0.64;
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, 520);
  sun.addColorStop(0, 'rgba(255,244,214,0.95)');
  sun.addColorStop(0.08, 'rgba(255,214,150,0.75)');
  sun.addColorStop(0.35, 'rgba(255,160,90,0.25)');
  sun.addColorStop(1, 'rgba(255,140,80,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  // Promienie światła
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 9; i += 1) {
    const a = -Math.PI * (0.15 + 0.7 * (i / 8)) + (rand() - 0.5) * 0.08;
    const len = 900;
    const spread = 0.025 + rand() * 0.03;
    ctx.fillStyle = `rgba(255,220,170,${0.035 + rand() * 0.04})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - spread) * len, sy + Math.sin(a - spread) * len);
    ctx.lineTo(sx + Math.cos(a + spread) * len, sy + Math.sin(a + spread) * len);
    ctx.fill();
  }
  ctx.restore();
  // Warstwy gór: dalsze jaśniejsze i bardziej zamglone (perspektywa powietrzna); dolina przy słońcu
  const layers = 5;
  const near = mix(0x05070d, tone(tint, { l: 0.05 }), 0.25);
  const haze = mix(horizonC, 0x8a7aa8, 0.45);
  let lastRidge = null;
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const base = H * (0.66 + t * 0.26);
    const height = 110 + t * 70;
    const noise = ridge(rng(hashStr(title) + i * 101), 6);
    const pts = [];
    for (let x = 0; x <= W; x += 4) {
      const valley = 0.35 + 0.65 * Math.min(1, Math.abs(x - sx) / (W * 0.42));
      pts.push([x, base - noise(x / W) ** 1.2 * height * valley * (i === layers - 1 ? 0.7 : 1)]);
    }
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W, H);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, base - height, 0, H);
    fill.addColorStop(0, E.hex(mix(haze, near, 0.25 + t * 0.72)));
    fill.addColorStop(1, E.hex(mix(haze, near, 0.45 + t * 0.55)));
    ctx.fillStyle = fill;
    ctx.fill();
    // Grzbiet oświetlony słońcem
    ctx.save();
    ctx.strokeStyle = `rgba(255,205,150,${0.28 - t * 0.05})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    // Mgła w dolinie
    const fog = ctx.createLinearGradient(0, base - 70, 0, base + 30);
    fog.addColorStop(0, 'rgba(255,225,205,0)');
    fog.addColorStop(0.65, `rgba(255,222,200,${0.16 - t * 0.025})`);
    fog.addColorStop(1, 'rgba(255,225,205,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, base - 70, W, 100);
    lastRidge = pts;
  }
  // Świerki na najbliższym grzbiecie
  ctx.fillStyle = E.hex(mix(near, 0x000000, 0.3));
  for (const [x, y] of lastRidge) {
    if (x % 12 !== 0 || rand() < 0.45) continue;
    const th = 18 + rand() * 34;
    for (let k = 0; k < 4; k += 1) {
      const w = th * (0.42 - k * 0.07);
      const ty = y - th * (k * 0.25);
      ctx.beginPath();
      ctx.moveTo(x - w, ty);
      ctx.lineTo(x, ty - th * 0.45);
      ctx.lineTo(x + w, ty);
      ctx.closePath();
      ctx.fill();
    }
  }
  vignette(ctx, 0.65);
  // Pasy kinowe
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, 26);
  ctx.fillRect(0, H - 26, W, 26);
  grain(ctx, rand, 0.09);

  // Kinowa typografia na środku
  const up = title.toLocaleUpperCase('pl');
  const size = fit(ctx, up, { family: 'KS Bebas', max: 190, width: W - 260, spacing: 22 });
  const y = 200 + size * 0.25;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 6;
  E.drawText(ctx, up, W / 2 + 11, y, { size, family: 'KS Bebas', color: '#fdf7ee', spacing: 22, align: 'center' });
  ctx.restore();
  if (subtitle) {
    const sub = subtitle.toLocaleUpperCase('pl');
    const sy2 = y + 62;
    const w = E.measureText(ctx, sub, { size: 30, family: 'KS Oswald Light', spacing: 10 });
    E.drawText(ctx, sub, W / 2 + 5, sy2, { size: 30, family: 'KS Oswald Light', color: 'rgba(255,245,230,0.9)', spacing: 10, align: 'center', maxWidth: W - 500 });
    ctx.fillStyle = 'rgba(255,245,230,0.6)';
    const half = Math.min(w, W - 500) / 2;
    ctx.fillRect(W / 2 - half - 130, sy2 - 11, 100, 1.5);
    ctx.fillRect(W / 2 + half + 30, sy2 - 11, 100, 1.5);
  }
}

/** 🪐 Kosmiczny: mgławica, gwiazdy z promieniami i planeta z pierścieniem. */
function space(ctx, { title, subtitle, color, rand }) {
  const accent = vivid(color, 0.7);
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, H);
  // Mgławica – wiele miękkich plam światła wzdłuż ukośnego pasa. Rysowana w 1/4 rozdzielczości
  // i powiększana: jest i tak rozmyta, a rysowanie 95 plam w pełnym rozmiarze trwało ~1 s.
  const Q = 4;
  const nebula = E.createCanvas(W / Q, H / Q);
  const n = nebula.getContext('2d');
  n.globalCompositeOperation = 'lighter';
  n.filter = 'blur(1.5px)';
  const colors = [accent, tone(accent, { h: 55 }), tone(accent, { h: -50 }), tone(accent, { h: 170, l: 0.55 })];
  for (let i = 0; i < 95; i += 1) {
    const t = rand();
    const x = (t * W) / Q;
    const y = (H * (0.85 - t * 0.7) + (rand() - 0.5) * 220) / Q;
    const r = (60 + rand() * 230) / Q;
    const c = colors[Math.floor(rand() * colors.length)];
    const g = n.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, 0.08 + rand() * 0.13));
    g.addColorStop(1, rgba(c, 0));
    n.fillStyle = g;
    n.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(nebula, 0, 0, W, H);
  ctx.restore();
  // Ciemne smugi pyłu
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * W;
    const y = H * (0.8 - (x / W) * 0.65) + (rand() - 0.5) * 120;
    const r = 40 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,8,20,0.55)');
    g.addColorStop(1, 'rgba(10,8,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  // Gwiazdy
  for (let i = 0; i < 900; i += 1) {
    const s = rand();
    ctx.fillStyle = s > 0.97 ? '#cfe3ff' : s > 0.94 ? '#ffe9c7' : '#ffffff';
    ctx.globalAlpha = 0.25 + rand() * 0.75;
    const size = rand() < 0.94 ? 1.2 : 2.2;
    ctx.fillRect(rand() * W, rand() * H, size, size);
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i += 1) {
    const x = rand() * W * 0.65;
    const y = rand() * H;
    const r = 8 + rand() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(220,235,255,0.6)');
    g.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(230,240,255,0.55)';
    ctx.fillRect(x - r * 3, y - 0.6, r * 6, 1.2);
    ctx.fillRect(x - 0.6, y - r * 3, 1.2, r * 6);
  }
  // Planeta z pierścieniem
  const px = W * 0.84;
  const py = H * 0.72;
  const pr = 250;
  const pColor = tone(accent, { h: 25, l: 0.5 });
  const ring = (front) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.32);
    ctx.scale(1, 0.22);
    ctx.beginPath();
    if (front) ctx.rect(-pr * 2, 0, pr * 4, pr * 2);
    else ctx.rect(-pr * 2, -pr * 2, pr * 4, pr * 2);
    ctx.clip();
    for (let i = 0; i < 26; i += 1) {
      ctx.strokeStyle = rgba(tone(pColor, { l: 0.65 + rand() * 0.2 }), 0.12 + rand() * 0.3);
      ctx.lineWidth = 3 + rand() * 6;
      ctx.beginPath();
      ctx.arc(0, 0, pr * 1.3 + i * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };
  ring(false);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.clip();
  const body = ctx.createRadialGradient(px - pr * 0.45, py - pr * 0.5, pr * 0.1, px, py, pr * 1.1);
  body.addColorStop(0, E.hex(tone(pColor, { l: 0.72 })));
  body.addColorStop(0.5, E.hex(pColor));
  body.addColorStop(1, E.hex(tone(pColor, { l: 0.12 })));
  ctx.fillStyle = body;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  for (let i = 0; i < 26; i += 1) {
    const band = rand() < 0.3 ? tone(pColor, { h: 30, l: 0.6 }) : tone(pColor, { l: 0.25 + rand() * 0.5 });
    ctx.fillStyle = rgba(band, 0.14 + rand() * 0.22);
    ctx.beginPath();
    ctx.ellipse(px + (rand() - 0.5) * 60, py - pr + rand() * pr * 2, pr * 1.2, 5 + rand() * 18, -0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  const shadow = ctx.createLinearGradient(px - pr * 0.4, py - pr * 0.6, px + pr * 0.8, py + pr * 0.7);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,5,0.92)');
  ctx.fillStyle = shadow;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = E.hex(tone(pColor, { l: 0.7 }));
  ctx.shadowBlur = 40;
  ctx.strokeStyle = rgba(tone(pColor, { l: 0.8 }), 0.6);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, pr, Math.PI * 0.85, Math.PI * 1.65);
  ctx.stroke();
  ctx.restore();
  ring(true);
  vignette(ctx, 0.5);

  const up = title.toLocaleUpperCase('pl');
  const x = 110;
  const width = W * 0.58;
  const size = fit(ctx, up, { family: 'KS Exo Bold', max: 130, width, spacing: 10 });
  const y = H / 2 + size * 0.22;
  ctx.save();
  ctx.shadowColor = E.hex(tone(accent, { l: 0.7 }));
  ctx.shadowBlur = 34;
  E.drawText(ctx, up, x, y, { size, family: 'KS Exo Bold', color: '#ffffff', spacing: 10 });
  ctx.restore();
  if (subtitle) {
    E.drawText(ctx, subtitle.toLocaleUpperCase('pl'), x + 6, y + 64, { size: 30, family: 'KS Montserrat', color: E.hex(tone(accent, { l: 0.85 })), spacing: 9, maxWidth: width });
  }
  grain(ctx, rand, 0.04);
}

/** 🏆 Esport / Gaming: agresywne skosy, linie prędkości, raster i mocny napis z obrysem. */
function esport(ctx, { title, subtitle, emoji, color, rand }) {
  const accent = vivid(color, 0.75);
  const dark = tone(accent, { l: 0.2 });
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, W, H);
  const glowBg = ctx.createRadialGradient(W * 0.7, H * 0.4, 0, W * 0.7, H * 0.4, W * 0.6);
  glowBg.addColorStop(0, rgba(accent, 0.28));
  glowBg.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glowBg;
  ctx.fillRect(0, 0, W, H);
  // Raster z kropek
  ctx.fillStyle = rgba(accent, 0.25);
  for (let y = 20; y < H; y += 22) {
    for (let x = W * 0.45; x < W; x += 22) {
      const r = Math.max(0, ((x - W * 0.45) / (W * 0.55)) * 4.2 - (y / H) * 1.2);
      if (r > 0.3) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Linie prędkości
  for (let i = 0; i < 60; i += 1) {
    const y = rand() * H;
    const x = rand() * W;
    const len = 120 + rand() * 400;
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + rand() * 0.08})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y - len * 0.25);
    ctx.stroke();
  }
  // Wielkie skosy
  const slash = (x0, w, fill) => {
    ctx.beginPath();
    ctx.moveTo(x0, H);
    ctx.lineTo(x0 + w, H);
    ctx.lineTo(x0 + w + 260, 0);
    ctx.lineTo(x0 + 260, 0);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const band = ctx.createLinearGradient(0, 0, 520, H);
  band.addColorStop(0, E.hex(tone(accent, { l: 0.58 })));
  band.addColorStop(1, E.hex(dark));
  slash(-320, 620, band);
  slash(330, 26, E.hex(tone(accent, { l: 0.7 })));
  slash(378, 10, 'rgba(255,255,255,0.8)');
  slash(W - 180, 60, rgba(accent, 0.9));
  slash(W - 100, 14, 'rgba(255,255,255,0.7)');
  // Tarcza z emoji
  const cx = 190;
  const cy = H / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(cx - 120, cy - 130);
  ctx.lineTo(cx + 130, cy - 130);
  ctx.lineTo(cx + 110, cy + 60);
  ctx.lineTo(cx, cy + 150);
  ctx.lineTo(cx - 110, cy + 60);
  ctx.closePath();
  ctx.fillStyle = '#0e1016';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();
  if (emoji) E.drawText(ctx, emoji, cx - 58, cy + 30, { size: 96 });
  // Tytuł z grubym obrysem i przesuniętym cieniem
  const up = title.toLocaleUpperCase('pl');
  const x = 470;
  const width = W - x - 110;
  const size = fit(ctx, up, { family: 'KS Exo Black Italic', max: 150, width, spacing: 1 });
  const y = 250 + size * 0.2;
  E.drawText(ctx, up, x + 10, y + 10, { size, family: 'KS Exo Black Italic', color: E.hex(accent), spacing: 1 });
  E.drawText(ctx, up, x, y, { size, family: 'KS Exo Black Italic', color: '#ffffff', spacing: 1, stroke: { color: '#050608', width: 14 } });
  if (subtitle) {
    const sub = subtitle.toLocaleUpperCase('pl');
    const sw = Math.min(width, E.measureText(ctx, sub, { size: 30, family: 'KS Exo Black Italic', spacing: 3 }) + 70);
    const ty = y + 40;
    ctx.beginPath();
    ctx.moveTo(x + 18, ty);
    ctx.lineTo(x + 18 + sw, ty);
    ctx.lineTo(x + sw, ty + 54);
    ctx.lineTo(x, ty + 54);
    ctx.closePath();
    ctx.fillStyle = E.hex(accent);
    ctx.fill();
    E.drawText(ctx, sub, x + 40, ty + 39, { size: 30, family: 'KS Exo Black Italic', color: '#08090c', spacing: 3, maxWidth: sw - 70 });
  }
  grain(ctx, rand, 0.05);
}

/** 🧱 Pikselowy (Minecraft): prawdziwy pixel-art – bloki trawy, ziemi i kamienia, chmury, napis 8-bit. */
function pixel(ctx, { title, subtitle, emoji, color, rand }) {
  const PX = 5;
  const w = W / PX;
  const h = H / PX;
  const small = E.createCanvas(w, h);
  const s = small.getContext('2d');
  // Niebo w pasach
  const skyBands = ['#6fb4ff', '#7dbcff', '#8cc6ff', '#9dcfff', '#b0d9ff'];
  skyBands.forEach((c, i) => {
    s.fillStyle = c;
    s.fillRect(0, (i * h * 0.62) / skyBands.length, w, (h * 0.62) / skyBands.length + 1);
  });
  s.fillStyle = '#b0d9ff';
  s.fillRect(0, h * 0.6, w, h);
  // Słońce
  s.fillStyle = '#fff8a8';
  s.fillRect(w - 52, 8, 16, 16);
  s.fillStyle = '#ffe14d';
  s.fillRect(w - 50, 10, 12, 12);
  // Chmury
  for (let i = 0; i < 7; i += 1) {
    const cx = Math.floor(rand() * w);
    const cy = 6 + Math.floor(rand() * 26);
    s.fillStyle = '#ffffff';
    s.fillRect(cx, cy, 18 + Math.floor(rand() * 14), 4);
    s.fillRect(cx + 4, cy - 3, 10, 3);
    s.fillStyle = '#e3eefb';
    s.fillRect(cx + 2, cy + 3, 16, 1);
  }
  // Daleki las/wzgórza
  const far = ridge(rng(hashStr(title) + 5), 4);
  for (let x = 0; x < w; x += 1) {
    const top = Math.floor(h * 0.5 + far(x / w) * 16);
    s.fillStyle = '#5c9c6b';
    s.fillRect(x, top, 1, h - top);
  }
  // Teren z bloków 4×4
  const B = 4;
  const ground = ridge(rng(hashStr(title) + 9), 4);
  const cols = Math.ceil(w / B);
  for (let c = 0; c < cols; c += 1) {
    const top = Math.floor((h * 0.6 + ground(c / cols) * 26) / B) * B;
    for (let y = top; y < h; y += B) {
      const depth = (y - top) / B;
      for (let py = 0; py < B; py += 1) {
        for (let px = 0; px < B; px += 1) {
          const r = rand();
          let col;
          if (depth === 0 && py < 2) col = r < 0.3 ? '#4f9e36' : r < 0.6 ? '#62b544' : '#57a93d';
          else if (depth < 3) col = r < 0.2 ? '#6b4a2f' : r < 0.55 ? '#86603d' : '#7a5636';
          else col = r < 0.05 ? '#3a3a3a' : r < 0.35 ? '#7d7d7d' : r < 0.7 ? '#8e8e8e' : '#999999';
          if (depth >= 3 && r > 0.985) col = '#39d3ff';
          s.fillStyle = col;
          s.fillRect(c * B + px, y + py, 1, 1);
        }
      }
    }
    // Kwiatki i trawa
    if (rand() < 0.18) {
      s.fillStyle = rand() < 0.5 ? '#e8e04a' : '#e34848';
      s.fillRect(c * B + 1 + Math.floor(rand() * 2), top - 2, 1, 1);
      s.fillStyle = '#3d8a2c';
      s.fillRect(c * B + 1, top - 1, 2, 1);
    }
    // Drzewa
    if (rand() < 0.14 && c > 45 && c < cols - 2) {
      const tx = c * B + 1;
      s.fillStyle = '#6b4a2f';
      s.fillRect(tx, top - 10, 2, 10);
      s.fillStyle = '#2f7d32';
      s.fillRect(tx - 4, top - 18, 10, 8);
      s.fillRect(tx - 2, top - 21, 6, 3);
      s.fillStyle = '#3f9443';
      s.fillRect(tx - 3, top - 17, 3, 3);
    }
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;

  // Slot z przedmiotem (jak ekwipunek) i pikselowe emoji
  const slot = 190;
  const sx = 90;
  const sy = 70;
  ctx.fillStyle = '#8b8b8b';
  ctx.fillRect(sx, sy, slot, slot);
  ctx.fillStyle = '#373737';
  ctx.fillRect(sx, sy, slot, 10);
  ctx.fillRect(sx, sy, 10, slot);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx + slot - 10, sy, 10, slot);
  ctx.fillRect(sx, sy + slot - 10, slot, 10);
  if (emoji) {
    const tiny = E.createCanvas(24, 24);
    const t = tiny.getContext('2d');
    E.drawText(t, emoji, -1.5, 20, { size: 20 });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, sx + 23, sy + 23, 144, 144);
    ctx.imageSmoothingEnabled = true;
  }
  // Napis 8-bit z twardym cieniem
  const up = title.toLocaleUpperCase('pl');
  const x = 330;
  const width = W - x - 70;
  const size = fit(ctx, up, { family: 'KS Pixel', max: 76, width, spacing: 4 });
  const y = 150 + size * 0.5;
  E.drawText(ctx, up, x + 8, y + 8, { size, family: 'KS Pixel', color: E.hex(tone(vivid(color), { l: 0.18 })), spacing: 4 });
  E.drawText(ctx, up, x, y, { size, family: 'KS Pixel', color: '#ffffff', spacing: 4, stroke: { color: '#1b1b1b', width: 10 } });
  if (subtitle) {
    ctx.save();
    ctx.translate(x + 20, y + 72);
    ctx.rotate(-0.06);
    E.drawText(ctx, subtitle, 4, 4, { size: 30, family: 'KS Pixel', color: '#3f3f00', maxWidth: width - 40 });
    E.drawText(ctx, subtitle, 0, 0, { size: 30, family: 'KS Pixel', color: '#ffff55', maxWidth: width - 40 });
    ctx.restore();
  }
}

/** 📜 Fantasy / RP: postarzały pergamin, ozdobna ramka, pieczęć lakowa i złoty napis. */
function fantasy(ctx, { title, subtitle, emoji, color, rand }) {
  const paper = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.62);
  paper.addColorStop(0, '#f3e4bf');
  paper.addColorStop(0.7, '#e2c893');
  paper.addColorStop(1, '#b8915a');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  // Plamy i włókna papieru
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 30 + rand() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,80,30,${0.03 + rand() * 0.07})`);
    g.addColorStop(1, 'rgba(120,80,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(110,70,30,0.06)';
  for (let i = 0; i < 260; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 20, y + (rand() - 0.5) * 10, x + 40 + rand() * 40, y + (rand() - 0.5) * 8);
    ctx.stroke();
  }
  grain(ctx, rand, 0.12);
  // Nadpalone brzegi
  const burn = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.58);
  burn.addColorStop(0, 'rgba(60,30,5,0)');
  burn.addColorStop(0.85, 'rgba(70,35,8,0.35)');
  burn.addColorStop(1, 'rgba(30,12,2,0.85)');
  ctx.fillStyle = burn;
  ctx.fillRect(0, 0, W, H);
  // Ramka podwójna z ornamentami
  const ink = '#4a2e12';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  const curl = (x, y, sx, sy) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.bezierCurveTo(0, 20, 20, 0, 60, 0);
    ctx.moveTo(10, 50);
    ctx.bezierCurveTo(12, 28, 30, 14, 50, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(62, 4, 6, 0, Math.PI * 2);
    ctx.arc(4, 62, 6, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.restore();
  };
  curl(56, 56, 1, 1);
  curl(W - 56, 56, -1, 1);
  curl(56, H - 56, 1, -1);
  curl(W - 56, H - 56, -1, -1);
  for (const y of [34, H - 34]) {
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f0dcae';
    ctx.fillRect(-14, -14, 28, 28);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(-14, -14, 28, 28);
    ctx.restore();
  }
  // Pieczęć lakowa
  const wax = toHsl(color)[1] < 0.2 ? 0x8b1a1a : tone(vivid(color, 0.6), { l: 0.32 });
  const cx = 230;
  const cy = H / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(40,15,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  for (let i = 0; i <= 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const r = 118 + Math.sin(i * 2.7) * 6 + rand() * 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  const waxG = ctx.createRadialGradient(cx - 40, cy - 40, 10, cx, cy, 130);
  waxG.addColorStop(0, E.hex(tone(wax, { l: 0.5 })));
  waxG.addColorStop(1, E.hex(tone(wax, { l: 0.2 })));
  ctx.fillStyle = waxG;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(tone(wax, { l: 0.12 }), 0.8);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(tone(wax, { l: 0.65 }), 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2, 86, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  if (emoji) {
    ctx.globalAlpha = 0.92;
    E.drawText(ctx, emoji, cx - 52, cy + 44, { size: 88 });
    ctx.globalAlpha = 1;
  }
  // Złoty napis
  const up = title.toLocaleUpperCase('pl');
  const left = 400;
  const width = W - left - 110;
  const mid = left + width / 2;
  const size = fit(ctx, up, { family: 'KS Cinzel Black', max: 118, width, spacing: 6 });
  const y = H / 2 + size * 0.22;
  const gold = ctx.createLinearGradient(0, y - size * 0.8, 0, y + 10);
  gold.addColorStop(0, '#fff3b0');
  gold.addColorStop(0.45, '#e2b13c');
  gold.addColorStop(0.55, '#9c6b12');
  gold.addColorStop(1, '#f5d46b');
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  E.drawText(ctx, up, mid, y, { size, family: 'KS Cinzel Black', color: gold, spacing: 6, align: 'center', stroke: { color: '#3b230a', width: 8 } });
  ctx.restore();
  E.drawText(ctx, up, mid, y, { size, family: 'KS Cinzel Black', color: gold, spacing: 6, align: 'center' });
  if (subtitle) {
    const sy = y + 66;
    E.drawText(ctx, subtitle, mid, sy, { size: 34, family: 'KS Cinzel Bold', color: '#4a2e12', spacing: 4, align: 'center', maxWidth: width - 160 });
    const sw = Math.min(width - 160, E.measureText(ctx, subtitle, { size: 34, family: 'KS Cinzel Bold', spacing: 4 }));
    E.drawText(ctx, '❧', mid - sw / 2 - 50, sy + 2, { size: 34, color: '#4a2e12', align: 'center' });
    E.drawText(ctx, '☙', mid + sw / 2 + 50, sy + 2, { size: 34, color: '#4a2e12', align: 'center' });
  }
}

/** 🫧 Szkło (glassmorphism): kolorowe rozmyte światła i matowa szyba z treścią. */
function glass(ctx, { title, subtitle, emoji, color, rand }) {
  const accent = vivid(color, 0.7);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, E.hex(tone(accent, { l: 0.16 })));
  bg.addColorStop(1, E.hex(tone(accent, { h: 50, l: 0.12 })));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.filter = 'blur(50px)';
  for (const [x, y, r, c] of [
    [W * 0.2, H * 0.25, 230, accent],
    [W * 0.52, H * 0.95, 260, tone(accent, { h: 35, l: 0.58, s: 0.7 })],
    [W * 0.82, H * 0.15, 240, tone(accent, { h: -35, l: 0.6, s: 0.7 })],
    [W * 0.97, H * 0.95, 190, tone(accent, { h: 70, l: 0.62, s: 0.65 })],
  ]) {
    ctx.fillStyle = E.hex(c);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.restore();
  // Matowa szyba: rozmyta kopia tła + biały połysk
  const card = { x: 150, y: 80, w: W - 300, h: H - 160, r: 44 };
  const snapshot = E.createCanvas(W, H);
  snapshot.getContext('2d').drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  E.roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fillStyle = 'rgba(255,255,255,0.01)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  E.roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  ctx.filter = 'blur(28px)';
  ctx.drawImage(snapshot, 0, 0);
  ctx.filter = 'none';
  const sheen = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = sheen;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();
  E.roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  const border = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
  border.addColorStop(0, 'rgba(255,255,255,0.7)');
  border.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Emoji w szklanym kółku
  const cx = card.x + 150;
  const cy = H / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 98, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (emoji) E.drawText(ctx, emoji, cx - 60, cy + 48, { size: 102 });
  const x = cx + 150;
  const width = card.x + card.w - x - 60;
  const up = title.toLocaleUpperCase('pl');
  const size = fit(ctx, up, { family: 'KS Montserrat Black', max: 112, width, spacing: 2 });
  const y = H / 2 + size * 0.12;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 16;
  E.drawText(ctx, up, x, y, { size, family: 'KS Montserrat Black', color: '#ffffff', spacing: 2 });
  ctx.restore();
  if (subtitle) {
    const ty = y + 30;
    const sw = Math.min(width, E.measureText(ctx, subtitle, { size: 30, family: 'KS Montserrat', spacing: 1 }) + 56);
    E.roundRect(ctx, x, ty, sw, 52, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    E.drawText(ctx, subtitle, x + 28, ty + 36, { size: 30, family: 'KS Montserrat', color: '#ffffff', spacing: 1, maxWidth: sw - 56 });
  }
  grain(ctx, rand, 0.035);
}

/** 🖤 Elegancki: głęboka czerń, złote linie i szeroko rozstrzelony, lekki napis. */
function elegant(ctx, { title, subtitle, rand }) {
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
  bg.addColorStop(0, '#1d1c1f');
  bg.addColorStop(1, '#09090b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = -H; x < W; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }
  const gold = ctx.createLinearGradient(0, 0, W, 0);
  gold.addColorStop(0, '#a67c2d');
  gold.addColorStop(0.35, '#f6dc8c');
  gold.addColorStop(0.5, '#c9a24a');
  gold.addColorStop(0.7, '#fbe7a5');
  gold.addColorStop(1, '#9b7226');
  // Cienka ramka z przerwami i romb
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.6;
  const m = 38;
  ctx.beginPath();
  ctx.moveTo(m + 40, m);
  ctx.lineTo(W / 2 - 40, m);
  ctx.moveTo(W / 2 + 40, m);
  ctx.lineTo(W - m - 40, m);
  ctx.moveTo(W - m, m + 40);
  ctx.lineTo(W - m, H - m - 40);
  ctx.moveTo(W - m - 40, H - m);
  ctx.lineTo(m + 40, H - m);
  ctx.moveTo(m, H - m - 40);
  ctx.lineTo(m, m + 40);
  ctx.stroke();
  for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m], [W / 2, m]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
  }
  const up = title.toLocaleUpperCase('pl');
  const size = fit(ctx, up, { family: 'KS Montserrat Light', max: 104, width: W - 300, spacing: 30 });
  const y = H / 2 + size * 0.1;
  E.drawText(ctx, up, W / 2 + 15, y, { size, family: 'KS Montserrat Light', color: '#f4ead5', spacing: 30, align: 'center' });
  if (subtitle) {
    const sub = subtitle.toLocaleUpperCase('pl');
    const sy = y + 70;
    const sw = Math.min(W - 520, E.measureText(ctx, sub, { size: 24, family: 'KS Montserrat', spacing: 14 }));
    E.drawText(ctx, sub, W / 2 + 7, sy, { size: 24, family: 'KS Montserrat', color: gold, spacing: 14, align: 'center', maxWidth: W - 520 });
    ctx.fillStyle = gold;
    ctx.fillRect(W / 2 - sw / 2 - 150, sy - 9, 110, 1.4);
    ctx.fillRect(W / 2 + sw / 2 + 40, sy - 9, 110, 1.4);
  }
  grain(ctx, rand, 0.04);
}

// ───────────── katalog stylów ─────────────

const BANNER_STYLES = {
  nowoczesny: { emoji: '✨', label: 'Nowoczesny', description: 'Miękkie światła w kolorach serwera i szklana plakietka', draw: modern },
  futurystyczny: { emoji: '🛰️', label: 'Futurystyczny (cyber)', description: 'Neonowa siatka, HUD, poświata i efekt glitch', draw: futuristic },
  neon: { emoji: '🌆', label: 'Neon / Synthwave', description: 'Zachód słońca lat 80., siatka i chromowany napis', draw: synthwave },
  realistyczny: { emoji: '🏔️', label: 'Realistyczny (kinowy)', description: 'Góry, mgła, promienie słońca i kinowy napis', draw: realistic },
  kosmos: { emoji: '🪐', label: 'Kosmiczny', description: 'Mgławica, gwiazdy i planeta z pierścieniem', draw: space },
  esport: { emoji: '🏆', label: 'Esport / Gaming', description: 'Ostre skosy, linie prędkości, napis z obrysem', draw: esport },
  pixel: { emoji: '🧱', label: 'Pikselowy (Minecraft)', description: 'Pixel-art z blokami, chmurami i napisem 8-bit', draw: pixel },
  fantasy: { emoji: '📜', label: 'Fantasy / RP', description: 'Pergamin, ornamenty, pieczęć lakowa i złoty napis', draw: fantasy },
  szklo: { emoji: '🫧', label: 'Szkło (glassmorphism)', description: 'Kolorowe rozmyte światła i matowa szyba', draw: glass },
  elegancki: { emoji: '🖤', label: 'Elegancki (luksusowy)', description: 'Czerń, złote linie i rozstrzelony napis', draw: elegant },
};

const DEFAULT_BANNER_STYLE = 'nowoczesny';

/** Styl dopasowany do typu serwera (domyślny wybór w kreatorze). */
const TYPE_BANNER_STYLES = {
  gaming: 'esport', esport: 'esport', minecraft: 'pixel', fivem: 'realistyczny', roleplay: 'fantasy',
  programming: 'futurystyczny', creator: 'neon', music: 'neon', anime: 'szklo', art: 'szklo',
  business: 'elegancki', shop: 'elegancki', trading: 'futurystyczny', support: 'nowoczesny',
  school: 'nowoczesny', community: 'nowoczesny', friends: 'szklo', sport: 'esport',
  movies: 'realistyczny', event: 'kosmos', custom: 'nowoczesny',
};

/** Format pliku: pixel-art jako PNG (ostre piksele), reszta jako JPEG (5–10× mniejszy plik). */
function bannerExt(style) {
  return style === 'pixel' ? 'png' : 'jpg';
}

/**
 * Rysuje baner w wybranym stylu.
 * @returns {Promise<Buffer>} JPEG albo PNG (pixel-art) – rozszerzenie podaje bannerExt(style).
 */
async function renderStyledBanner({ style = DEFAULT_BANNER_STYLE, title, subtitle = '', emoji = '', color = 0x5865f2, width = W }) {
  if (!BANNER_STYLES[style]) style = DEFAULT_BANNER_STYLE;
  const def = BANNER_STYLES[style] || BANNER_STYLES[DEFAULT_BANNER_STYLE];
  await E.preloadEmojis([title, subtitle, emoji]);
  const canvas = E.createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rand = rng(hashStr(`${style}|${title}|${subtitle}`));
  def.draw(ctx, { title: String(title || ''), subtitle: String(subtitle || ''), emoji, color: Number(color) & 0xffffff, rand });
  let out = canvas;
  if (width !== W) {
    out = E.createCanvas(width, Math.round((H * width) / W));
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = style !== 'pixel';
    o.drawImage(canvas, 0, 0, out.width, out.height);
  }
  return bannerExt(style) === 'png' ? out.toBuffer('image/png') : out.toBuffer('image/jpeg', 90);
}

/**
 * Galeria wszystkich stylów na jednym obrazku (do porównania w kreatorze).
 * Wybrany styl jest wyróżniony ramką.
 */
async function renderBannerGallery({ title, subtitle = '', emoji = '', color = 0x5865f2, selected = null }) {
  const keys = Object.keys(BANNER_STYLES);
  const tw = 720;
  const th = Math.round((H * tw) / W);
  const pad = 36;
  const gap = 28;
  const label = 64;
  const cols = 2;
  const rows = Math.ceil(keys.length / cols);
  const width = pad * 2 + cols * tw + (cols - 1) * gap;
  const height = 110 + rows * (th + label + gap) + pad - gap;
  const canvas = E.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, width, height);
  await E.preloadEmojis([...keys.map((k) => BANNER_STYLES[k].emoji), '✅']);
  E.drawText(ctx, 'Style banerów', pad, 72, { size: 44, family: 'KS Montserrat Black', color: '#f2f3f5' });
  E.drawText(ctx, 'wybierz w kroku „Grafika” – baner pojawi się nad regulaminem, informacjami, FAQ…', pad + 360, 70, { size: 22, color: '#949ba4', maxWidth: width - pad * 2 - 360 });
  for (const [i, key] of keys.entries()) {
    const x = pad + (i % cols) * (tw + gap);
    const y = 110 + Math.floor(i / cols) * (th + label + gap);
    const img = await E.loadImage(await renderStyledBanner({ style: key, title, subtitle, emoji, color, width: tw }));
    ctx.save();
    E.roundRect(ctx, x, y, tw, th, 16);
    ctx.clip();
    ctx.drawImage(img, x, y, tw, th);
    ctx.restore();
    const on = key === selected;
    if (on) {
      ctx.strokeStyle = '#5865f2';
      ctx.lineWidth = 6;
      E.roundRect(ctx, x - 3, y - 3, tw + 6, th + 6, 18);
      ctx.stroke();
    }
    const def = BANNER_STYLES[key];
    E.drawText(ctx, `${def.emoji} ${def.label}${on ? '   ✅ wybrany' : ''}`, x + 4, y + th + 38, { size: 26, bold: true, color: on ? '#8ea1ff' : '#f2f3f5', maxWidth: tw - 8 });
  }
  return canvas.toBuffer('image/jpeg', 90);
}

module.exports = {
  BANNER_STYLES, DEFAULT_BANNER_STYLE, TYPE_BANNER_STYLES, renderStyledBanner, renderBannerGallery, bannerExt, BANNER_SIZE: { width: W, height: H },
};
