'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { MODULES } = require('../data/modules');
const { CHANNEL_STYLES, CATEGORY_STYLES, PALETTES, EMBED_COLORS } = require('../data/styles');
const { AUTOMOD_OPTIONS } = require('../data/security');
const { MEMBER_TOGGLES, VIEW_OPTIONS, WRITE_OPTIONS } = require('../builder/permissions');
const { CONTENT_OPTIONS, RULE_SECTIONS, PUNISHMENT_STYLES } = require('../builder/content');
const { STAFF_ROLES, ROLE_GROUP_OPTIONS } = require('../data/roles');
const { SIZES, AGES, LANGUAGES, createAnswers, computeDependentDefaults } = require('./defaults');

/**
 * Wczytywanie projektu z pliku JSON (eksport z podsumowania kreatora).
 * Plik pochodzi od użytkownika, więc każde pole jest sprawdzane i przycinane –
 * nieznane lub błędne wartości są pomijane, a brakujące biorą się z ustawień domyślnych.
 * Tryb czyszczenia NIGDY nie jest wczytywany z pliku (zawsze „dodaj”).
 */

const MAX_BYTES = 512 * 1024;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const oneOf = (v, allowed, fallback) => (Object.prototype.hasOwnProperty.call(allowed, v) ? v : fallback);
const subset = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(allowed, x)))] : null);
const strings = (v, max, maxLen) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => x.slice(0, maxLen)) : []);
const int = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);
const color = (v) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : null);

/** Zamienia dowolny obiekt z pliku na bezpieczne odpowiedzi kreatora. */
function sanitizeAnswers(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Plik nie zawiera projektu kreatora.');
  const src = raw.answers && typeof raw.answers === 'object' ? raw.answers : raw;
  if (!SERVER_TYPES[src.type]) throw new Error('Plik nie wygląda na projekt z Kreatora Serwera (brak poprawnego typu serwera).');

  const a = createAnswers(src.type);
  const b = src.basics || {};
  a.basics = {
    name: str(b.name, 100),
    description: str(b.description, 1000),
    audience: str(b.audience, 150),
    iconUrl: /^https?:\/\//i.test(str(b.iconUrl, 400)) ? str(b.iconUrl, 400) : '',
    rename: bool(b.rename, true),
  };
  a.language = oneOf(src.language, LANGUAGES, 'pl');
  a.size = oneOf(src.size, SIZES, 'medium');
  a.age = oneOf(String(src.age), AGES, '13');

  const st = src.style || {};
  a.style = {
    channel: oneOf(st.channel, CHANNEL_STYLES, 'dot'),
    category: oneOf(st.category, CATEGORY_STYLES, 'lines'),
    palette: oneOf(st.palette, PALETTES, 'modern'),
    options: Array.isArray(st.options) ? st.options.filter((o) => ['separators', 'roleEmoji'].includes(o)) : ['separators', 'roleEmoji'],
  };

  // Wartości domyślne dla typu, rozmiaru i wieku z pliku – uzupełniają pola, których w pliku brak.
  const defaults = computeDependentDefaults(a);
  a.modules = subset(src.modules, MODULES) ?? defaults.modules;
  if (a.age !== '18') a.modules = a.modules.filter((m) => m !== 'nsfw');

  const preset = SERVER_TYPES[a.type];
  const sp = src.special || {};
  const extraKeys = Object.fromEntries((preset.extras || []).map((e) => [e.key, true]));
  a.special = {
    items: strings(sp.items, 25, 60),
    options: Array.isArray(sp.options) ? sp.options.filter((o) => ['text', 'extra', 'voice', 'role', 'private'].includes(o)) : defaults['special.options'],
    layout: ['shared', 'separate'].includes(sp.layout) ? sp.layout : defaults['special.layout'],
    extras: subset(sp.extras, extraKeys) ?? defaults['special.extras'],
    info: Object.fromEntries((preset.infoFields || []).map((f) => [f.key, str(sp.info?.[f.key], f.max || 200)])),
  };

  const staffKeys = { ...Object.fromEntries(Object.keys(STAFF_ROLES).map((k) => [k, true])), ...Object.fromEntries((preset.staffExtras || []).map((e) => [e.key, true])) };
  a.staffRoles = subset(src.staffRoles, staffKeys) ?? defaults.staffRoles;
  a.customStaff = (Array.isArray(src.customStaff) ? src.customStaff : []).slice(0, 10)
    // Tak jak w kreatorze: własne role ekipy nie mogą dostać poziomu „Właściciel” (Administrator).
    .map((r) => ({ name: str(r?.name, 80).trim(), color: color(r?.color), level: ['admin', 'mod', 'helper', 'trial', 'none'].includes(r?.level) ? r.level : 'none' }))
    .filter((r) => r.name);
  const groupKeys = { ...Object.fromEntries(Object.keys(ROLE_GROUP_OPTIONS).map((k) => [k, true])), ...Object.fromEntries((preset.specials || []).map((e) => [e.key, true])) };
  a.communityRoles = subset(src.communityRoles, groupKeys) ?? defaults.communityRoles;
  a.customRoles = (Array.isArray(src.customRoles) ? src.customRoles : []).slice(0, 35)
    .map((r) => ({ name: str(r?.name, 80).trim(), color: color(r?.color), self: Boolean(r?.self) }))
    .filter((r) => r.name);
  a.roleNames = Object.fromEntries(['owner', 'admin', 'mod', 'helper', 'member']
    .map((k) => [k, str(src.roleNames?.[k], 60).trim()]).filter(([, v]) => v));

  a.permissions = {
    member: subset(src.permissions?.member, MEMBER_TOGGLES) ?? defaults['permissions.member'],
    notifications: src.permissions?.notifications === 'all' ? 'all' : 'mentions',
  };
  a.channelAccess = {};
  for (const [section, value] of Object.entries(src.channelAccess || {}).slice(0, 20)) {
    if (!/^[a-z]{2,12}$/.test(section) || !value) continue;
    const view = VIEW_OPTIONS[value.view] ? value.view : 'default';
    const write = WRITE_OPTIONS[value.write] ? value.write : 'default';
    if (view !== 'default' || write !== 'default') a.channelAccess[section] = { view, write };
  }

  const sec = src.security || {};
  a.security = {
    verificationLevel: int(sec.verificationLevel, 0, 4, defaults['security.verificationLevel']),
    contentFilter: int(sec.contentFilter, 0, 2, defaults['security.contentFilter']),
    automod: subset(sec.automod, AUTOMOD_OPTIONS) ?? defaults['security.automod'],
    verifyOptions: Array.isArray(sec.verifyOptions) ? sec.verifyOptions.filter((o) => ['captcha', 'age1', 'age7', 'age30', 'log'].includes(o)) : defaults['security.verifyOptions'],
  };

  const c = src.channels || {};
  a.channels = {
    slowmode: int(c.slowmode, 0, 21600, defaults['channels.slowmode']),
    voiceCount: int(c.voiceCount, 0, 10, defaults['channels.voiceCount']),
    voiceLayout: ['open', 'mixed', 'big'].includes(c.voiceLayout) ? c.voiceLayout : defaults['channels.voiceLayout'],
    afkTimeout: [60, 300, 900, 1800, 3600].includes(c.afkTimeout) ? c.afkTimeout : defaults['channels.afkTimeout'],
  };

  const targets = ['new', 'info', 'news', 'special', 'community', 'voice', 'vip', 'staff'];
  a.customCategories = (Array.isArray(src.customCategories) ? src.customCategories : []).slice(0, 10).map((cat) => ({
    target: targets.includes(cat?.target) ? cat.target : 'new',
    name: str(cat?.name, 60).trim(),
    text: strings(cat?.text, 20, 60),
    voice: strings(cat?.voice, 20, 60),
    access: ['public', 'readonly', 'staff', 'vip'].includes(cat?.access) ? cat.access : 'public',
    emoji: str(cat?.emoji, 16) || '📁',
  })).filter((cat) => (cat.target !== 'new' || cat.name) && (cat.text.length || cat.voice.length));

  const ct = src.content || {};
  a.content = {
    panels: subset(ct.panels, CONTENT_OPTIONS) ?? a.content.panels,
    community: ['full', 'basic', 'off'].includes(ct.community) ? ct.community : defaults['content.community'],
    embedColor: oneOf(ct.embedColor, EMBED_COLORS, 'palette'),
  };

  const tx = src.texts || {};
  const ann = tx.announcement;
  a.texts = {
    ruleSections: subset(tx.ruleSections, RULE_SECTIONS) ?? a.texts.ruleSections,
    punishments: oneOf(tx.punishments, PUNISHMENT_STYLES, 'ladder'),
    customRules: strings(tx.customRules, 20, 500),
    customFaq: (Array.isArray(tx.customFaq) ? tx.customFaq : []).slice(0, 15)
      .map((e) => ({ q: str(e?.q, 200).trim(), a: str(e?.a, 900).trim() })).filter((e) => e.q && e.a),
    faqDefaults: bool(tx.faqDefaults, true),
    announcement: ann && typeof ann.text === 'string' && ann.text.trim()
      ? { title: str(ann.title, 200), text: str(ann.text, 3500), ping: ['none', 'role', 'everyone'].includes(ann.ping) ? ann.ping : 'none' }
      : null,
  };

  // Bezpieczeństwo: plik nigdy nie włącza czyszczenia serwera.
  a.mode = { type: 'append', assign: bool(src.mode?.assign, true) };
  // Wczytane wartości traktujemy jak wybrane ręcznie – zmiana rozmiaru ich nie nadpisze.
  a.touched = Object.fromEntries(Object.keys(defaults).map((k) => [k, true]));
  return a;
}

/** Pobiera i wczytuje załącznik z /stworz projekt:<plik>. */
async function loadProjectAttachment(attachment) {
  if (!attachment) return null;
  if (attachment.size > MAX_BYTES) throw new Error('Plik jest za duży (maks. 512 KB).');
  if (!/\.json$/i.test(attachment.name || '') && !String(attachment.contentType || '').includes('json')) {
    throw new Error('To nie jest plik .json – użyj pliku z przycisku „Zapisz projekt” w podsumowaniu kreatora.');
  }
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`Nie udało się pobrać pliku (HTTP ${res.status}).`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Plik jest za duży (maks. 512 KB).');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Plik nie jest poprawnym JSON-em.');
  }
  return sanitizeAnswers(json);
}

module.exports = { sanitizeAnswers, loadProjectAttachment, MAX_BYTES };
