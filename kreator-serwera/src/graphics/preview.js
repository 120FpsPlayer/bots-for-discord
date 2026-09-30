'use strict';

const E = require('./engine');

/**
 * Podgląd serwera jako obrazek PNG w stylu Discorda:
 * nagłówek z ikoną i nazwą, lista kanałów (z ikonami i dostępem), lista ról (w kolorach) i statystyki.
 * Służy kupującemu do sprawdzenia serwera przed budową, a sprzedawcy – do portfolio i reklam.
 */

const C = {
  bg: '#1e1f22', panel: '#2b2d31', panelHead: '#232428', text: '#dbdee1', strong: '#f2f3f5',
  muted: '#949ba4', icon: '#80848e', divider: '#3f4147', chip: '#383a40',
};
const PAD = 28;
const GAP = 20;
const HEADER = 200;
const COL_CH = 420;
const COL_ROLE = 360;
const COL_INFO = 380;
const ROW = 34;
const CAT = 42;
const ROLE_ROW = 32;
const SEP_ROW = 36;
const TITLE = 50;
const MAX_COL = 2300;

const VIEW_TAG = { staff: 'ekipa', mods: 'moderacja', admins: 'zarząd', vip: 'VIP', role: 'rola', verify: 'nowi' };
const WRITE_TAG = { readonly: 'odczyt', readonlyStaff: 'odczyt', threads: 'wątki', bots: 'boty', listen: 'słuchanie' };
const LEVEL_TAG = { owner: 'właściciel', admin: 'admin', mod: 'moderator', helper: 'pomocnik', trial: 'próbny' };

function accessTag(ch) {
  const a = ch.access || {};
  if (VIEW_TAG[a.view]) return `🔒 ${VIEW_TAG[a.view]}`;
  if (WRITE_TAG[a.write]) return `👁️ ${WRITE_TAG[a.write]}`;
  return '';
}

// ───────────── ikony kanałów (wektorowe, jak w Discordzie) ─────────────

function drawChannelIcon(ctx, kind, x, y, locked) {
  ctx.save();
  ctx.fillStyle = C.icon;
  ctx.strokeStyle = C.icon;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (kind === 'voice') {
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 7); ctx.lineTo(x + 6, y + 7); ctx.lineTo(x + 11, y + 2); ctx.lineTo(x + 11, y + 18); ctx.lineTo(x + 6, y + 13); ctx.lineTo(x + 2, y + 13);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 12, y + 10, 4, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 12, y + 10, 8, -Math.PI / 3, Math.PI / 3); ctx.stroke();
  } else if (kind === 'stage') {
    ctx.beginPath(); ctx.arc(x + 10, y + 10, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 10, y + 10, 6, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 10, y + 10, 9.5, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  } else if (kind === 'forum') {
    E.roundRect(ctx, x + 1, y + 2, 13, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 4, y + 11); ctx.lineTo(x + 3, y + 15); ctx.lineTo(x + 8, y + 11); ctx.fill();
    E.roundRect(ctx, x + 7, y + 7, 12, 9, 3); ctx.lineWidth = 1.8; ctx.stroke();
  } else if (kind === 'announcement') {
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 7); ctx.lineTo(x + 8, y + 7); ctx.lineTo(x + 17, y + 2); ctx.lineTo(x + 17, y + 17); ctx.lineTo(x + 8, y + 12); ctx.lineTo(x + 2, y + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(x + 5, y + 12, 3, 6);
  } else {
    E.drawText(ctx, '#', x + 2, y + 17, { size: 21, color: C.icon });
  }
  if (locked) {
    ctx.fillStyle = C.panel;
    ctx.beginPath(); ctx.arc(x + 17, y + 16, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.icon;
    ctx.fillRect(x + 13, y + 15, 8, 6);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x + 17, y + 15, 2.6, Math.PI, 0); ctx.stroke();
  }
  ctx.restore();
}

// ───────────── układ kolumn ─────────────

/** Dzieli listę elementów na kolumny o maksymalnej wysokości (nie rozcina kategorii, jeśli się da). */
function splitColumns(items, heightOf, isBreak = () => true) {
  const cols = [[]];
  let h = 0;
  for (const item of items) {
    const ih = heightOf(item);
    if (h + ih > MAX_COL && cols[cols.length - 1].length && isBreak(item)) {
      cols.push([]);
      h = 0;
    }
    cols[cols.length - 1].push(item);
    h += ih;
  }
  return cols;
}

function panel(ctx, x, y, w, h, title) {
  E.roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = C.panel;
  ctx.fill();
  if (title) {
    ctx.save();
    E.roundRect(ctx, x, y, w, TITLE, 14);
    ctx.clip();
    ctx.fillStyle = C.panelHead;
    ctx.fillRect(x, y, w, TITLE);
    ctx.restore();
    E.drawText(ctx, title, x + 18, y + 32, { size: 17, bold: true, color: C.strong, maxWidth: w - 36 });
  }
}

/**
 * @param {object} bp blueprint
 * @param {object} opts { guildName, icon (Buffer|null), extras: string[] – dodatkowe linie w statystykach }
 * @returns {Promise<Buffer>} PNG
 */
async function renderPreview(bp, { guildName, icon = null, extras = [] } = {}) {
  const name = bp.guild?.name || guildName || 'Serwer';
  const color = bp.meta?.embedColor ?? 0x5865f2;

  // Elementy kolumn
  const chItems = [];
  for (const cat of bp.categories) {
    if (!cat.root) chItems.push({ cat });
    for (const ch of cat.channels) chItems.push({ ch });
  }
  const roleItems = bp.roles.map((r) => ({ role: r }));
  const st = bp.stats || {};
  const infoRows = [
    ['📁', 'Kategorie', st.categories],
    ['💬', 'Kanały tekstowe', (st.text ?? 0) - (st.forums ?? 0)],
    ['🗂️', 'Fora', st.forums],
    ['🔊', 'Kanały głosowe', st.voice],
    ['🎭', 'Role', (st.roles ?? 0) - (st.separators ?? 0)],
    ['🔑', 'Ustawione uprawnienia', st.overwrites],
    ['🤖', 'Reguły AutoMod', st.automod],
    ['📨', 'Wiadomości', st.messages],
    ['🌟', 'Społeczność', bp.guild?.community ? 'tak' : 'nie'],
    ['🧭', 'Onboarding', bp.onboarding ? `${bp.onboarding.prompts.length} pytań` : 'nie'],
    ['✅', 'Weryfikacja', bp.meta?.gate ? 'tak' : 'nie'],
    ...extras.map((line) => [null, line, null]),
  ];

  const chCols = splitColumns(chItems, (i) => (i.cat ? CAT : ROW), (i) => Boolean(i.cat));
  const roleCols = splitColumns(roleItems, (i) => (i.role.separator ? SEP_ROW : ROLE_ROW), (i) => Boolean(i.role.separator));
  const colHeight = (col, hOf) => TITLE + 12 + col.reduce((n, i) => n + hOf(i), 0) + 12;
  const chHeights = chCols.map((c) => colHeight(c, (i) => (i.cat ? CAT : ROW)));
  const roleHeights = roleCols.map((c) => colHeight(c, (i) => (i.role.separator ? SEP_ROW : ROLE_ROW)));
  const infoHeight = TITLE + 16 + infoRows.length * 38 + 40 + 64 + 60;
  const bodyH = Math.max(...chHeights, ...roleHeights, infoHeight);
  const width = PAD * 2 + chCols.length * (COL_CH + GAP) + roleCols.length * (COL_ROLE + GAP) + COL_INFO;
  const height = HEADER + PAD * 2 + bodyH + 44;

  await E.preloadEmojis([
    name, ...bp.categories.map((c) => c.name), ...bp.categories.flatMap((c) => c.channels.map((ch) => ch.name)),
    ...bp.roles.map((r) => r.name), ...infoRows.map((r) => r[0]), '🔒👁️',
  ]);

  const canvas = E.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  // ── Nagłówek (baner w kolorze serwera)
  const hx = PAD;
  const hy = PAD;
  const hw = width - PAD * 2;
  ctx.save();
  E.roundRect(ctx, hx, hy, hw, HEADER, 18);
  ctx.clip();
  const g = ctx.createLinearGradient(hx, hy, hx + hw, hy + HEADER);
  g.addColorStop(0, E.shade(color, 0.15));
  g.addColorStop(1, E.shade(color, -0.55));
  ctx.fillStyle = g;
  ctx.fillRect(hx, hy, hw, HEADER);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  for (let i = -2; i < hw / 60; i += 1) {
    ctx.beginPath();
    ctx.moveTo(hx + i * 60, hy + HEADER); ctx.lineTo(hx + i * 60 + 30, hy + HEADER); ctx.lineTo(hx + i * 60 + 30 + HEADER, hy); ctx.lineTo(hx + i * 60 + HEADER, hy);
    ctx.fill();
  }
  ctx.restore();

  const iconSize = 128;
  const ix = hx + 36;
  const iy = hy + (HEADER - iconSize) / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2, 0, Math.PI * 2); ctx.clip();
  let drewIcon = false;
  if (icon) {
    try {
      ctx.drawImage(await E.loadImage(icon), ix, iy, iconSize, iconSize);
      drewIcon = true;
    } catch {
      drewIcon = false;
    }
  }
  if (!drewIcon) {
    ctx.fillStyle = E.shade(color, -0.25);
    ctx.fillRect(ix, iy, iconSize, iconSize);
    E.drawText(ctx, E.initials(name) || '?', ix + iconSize / 2, iy + iconSize / 2 + 20, { size: 54, bold: true, color: '#ffffff', align: 'center' });
  }
  ctx.restore();

  const tx = ix + iconSize + 32;
  E.drawText(ctx, name, tx, hy + 84, { size: 40, bold: true, color: '#ffffff', maxWidth: hw - (tx - hx) - 36 });
  const sub = [bp.meta?.typeLabel, bp.meta?.language === 'en' ? 'English' : 'Polski', bp.meta?.mode === 'wipe' ? 'budowa od zera' : null].filter(Boolean).join('  •  ');
  E.drawText(ctx, sub, tx, hy + 122, { size: 19, color: 'rgba(255,255,255,0.85)', maxWidth: hw - (tx - hx) - 36 });
  let cx = tx;
  for (const chip of [`📁 ${st.categories ?? 0}`, `💬 ${st.text ?? 0}`, `🔊 ${st.voice ?? 0}`, `🎭 ${(st.roles ?? 0) - (st.separators ?? 0)}`]) {
    await E.preloadEmojis([chip]);
    const w = E.measureText(ctx, chip, { size: 17, bold: true }) + 26;
    E.roundRect(ctx, cx, hy + 142, w, 34, 17);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    E.drawText(ctx, chip, cx + 13, hy + 165, { size: 17, bold: true, color: '#ffffff' });
    cx += w + 10;
  }

  // ── Kanały
  const top = HEADER + PAD * 2;
  let x = PAD;
  chCols.forEach((col, i) => {
    panel(ctx, x, top, COL_CH, chHeights[i], chCols.length > 1 ? `Kanały (${i + 1}/${chCols.length})` : 'Kanały');
    let y = top + TITLE + 12;
    for (const item of col) {
      if (item.cat) {
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x + 14, y + 22); ctx.lineTo(x + 18, y + 26); ctx.lineTo(x + 22, y + 22); ctx.stroke();
        E.drawText(ctx, item.cat.name.toLocaleUpperCase('pl'), x + 28, y + 30, { size: 13, bold: true, color: C.muted, maxWidth: COL_CH - 44 });
        y += CAT;
      } else {
        const ch = item.ch;
        const tag = accessTag(ch);
        const locked = tag.startsWith('🔒');
        drawChannelIcon(ctx, ch.kind, x + 14, y + 7, locked);
        const tagW = tag ? E.measureText(ctx, tag, { size: 12 }) + 10 : 0;
        E.drawText(ctx, ch.name, x + 46, y + 23, { size: 16, color: locked ? C.muted : C.text, maxWidth: COL_CH - 60 - tagW });
        if (tag) E.drawText(ctx, tag, x + COL_CH - 14, y + 22, { size: 12, color: C.muted, align: 'right' });
        y += ROW;
      }
    }
    x += COL_CH + GAP;
  });

  // ── Role
  roleCols.forEach((col, i) => {
    panel(ctx, x, top, COL_ROLE, roleHeights[i], roleCols.length > 1 ? `Role (${i + 1}/${roleCols.length})` : 'Role');
    let y = top + TITLE + 12;
    for (const { role } of col) {
      if (role.separator) {
        ctx.fillStyle = C.divider;
        ctx.fillRect(x + 16, y + 17, COL_ROLE - 32, 1);
        const label = ` ${role.label || role.name} `.toLocaleUpperCase('pl');
        const w = E.measureText(ctx, label, { size: 12, bold: true });
        ctx.fillStyle = C.panel;
        ctx.fillRect(x + (COL_ROLE - w) / 2 - 6, y + 8, w + 12, 18);
        E.drawText(ctx, label, x + COL_ROLE / 2, y + 22, { size: 12, bold: true, color: C.muted, align: 'center' });
        y += SEP_ROW;
      } else {
        const rc = role.color ? E.hex(role.color) : '#99aab5';
        ctx.fillStyle = rc;
        ctx.beginPath(); ctx.arc(x + 24, y + 16, 7, 0, Math.PI * 2); ctx.fill();
        const tag = LEVEL_TAG[role.level] || '';
        const tagW = tag ? E.measureText(ctx, tag, { size: 12 }) + 10 : 0;
        // Bardzo ciemne kolory (np. granatowy, czarny) rozjaśniamy w napisie, żeby dało się je przeczytać.
        const textColor = !role.color ? C.text : E.luminance(role.color) < 0.3 ? E.shade(role.color, 0.5) : rc;
        E.drawText(ctx, role.name, x + 40, y + 22, { size: 16, bold: Boolean(role.hoist), color: textColor, maxWidth: COL_ROLE - 56 - tagW });
        if (tag) E.drawText(ctx, tag, x + COL_ROLE - 14, y + 21, { size: 12, color: C.muted, align: 'right' });
        y += ROLE_ROW;
      }
    }
    x += COL_ROLE + GAP;
  });

  // ── Statystyki
  panel(ctx, x, top, COL_INFO, bodyH, 'Podsumowanie');
  let y = top + TITLE + 16;
  for (const [emoji, label, value] of infoRows) {
    if (emoji) E.drawText(ctx, emoji, x + 18, y + 22, { size: 17 });
    E.drawText(ctx, label, x + (emoji ? 50 : 18), y + 22, { size: 16, color: C.text, maxWidth: COL_INFO - (emoji ? 140 : 36) });
    if (value !== null && value !== undefined) E.drawText(ctx, String(value), x + COL_INFO - 18, y + 22, { size: 16, bold: true, color: C.strong, align: 'right' });
    y += 38;
  }
  // Paleta kolorów ról
  y += 12;
  E.drawText(ctx, 'Kolory ról', x + 18, y + 18, { size: 13, bold: true, color: C.muted });
  const colors = [...new Set(bp.roles.filter((r) => r.color && !r.separator).map((r) => r.color))].slice(0, 12);
  colors.forEach((c, i) => {
    ctx.fillStyle = E.hex(c);
    E.roundRect(ctx, x + 18 + i * 28, y + 30, 22, 22, 6);
    ctx.fill();
  });
  y += 76;
  E.drawText(ctx, '🔒 ukryty kanał   👁️ tylko odczyt', x + 18, y + 18, { size: 13, color: C.muted, maxWidth: COL_INFO - 36 });

  // ── Stopka
  E.drawText(ctx, `Podgląd • Kreator Serwera • ${new Date().toLocaleDateString('pl-PL')}`, width - PAD, height - 18, { size: 13, color: C.muted, align: 'right' });

  return canvas.toBuffer('image/png');
}

module.exports = { renderPreview };
