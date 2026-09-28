'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { MODULES } = require('../data/modules');

/**
 * Domyślne odpowiedzi kreatora. Część pól zależy od typu i rozmiaru serwera –
 * te pola są przeliczane przy zmianie typu/rozmiaru/wieku, ale TYLKO jeśli
 * użytkownik nie zmienił ich ręcznie (śledzimy to w answers.touched).
 */

const SIZES = {
  small: { emoji: '🌱', label: 'Mały', description: 'do ~50 osób – znajomi, mała społeczność' },
  medium: { emoji: '🌿', label: 'Średni', description: '50–500 osób – rosnąca społeczność' },
  large: { emoji: '🌳', label: 'Duży', description: '500–5000 osób – rozbudowana moderacja' },
  huge: { emoji: '🏔️', label: 'Ogromny', description: '5000+ osób – maksymalne bezpieczeństwo' },
};

const AGES = {
  13: { emoji: '🧒', label: 'Od 13 lat', description: 'Minimalny wiek Discorda' },
  16: { emoji: '🧑', label: 'Od 16 lat', description: 'Starsza młodzież i dorośli' },
  18: { emoji: '🔞', label: 'Tylko 18+', description: 'Serwer dla dorosłych (odblokowuje kanał 18+)' },
};

const LANGUAGES = {
  pl: { emoji: '🇵🇱', label: 'Polski', description: 'Kanały, role i wiadomości po polsku' },
  en: { emoji: '🇬🇧', label: 'English', description: 'Channels, roles and messages in English' },
};

const SIZE_MODULES = {
  small: { remove: ['faq', 'changelog', 'polls', 'partnerships', 'boosts', 'stage', 'archive', 'counting', 'qotd', 'introductions', 'giveaways', 'vip'] },
  medium: {},
  large: { add: ['faq', 'boosts', 'partnerships', 'polls', 'stage', 'archive', 'giveaways', 'vip'] },
  huge: { add: ['faq', 'boosts', 'partnerships', 'polls', 'stage', 'archive', 'giveaways', 'vip', 'qotd', 'changelog'] },
};

const SIZE_STAFF = {
  small: ['owner', 'admin', 'mod'],
  medium: ['owner', 'admin', 'mod', 'helper'],
  large: ['owner', 'coowner', 'admin', 'mod', 'helper', 'trial', 'eventmgr', 'partnermgr'],
  huge: ['owner', 'coowner', 'admin', 'mod', 'helper', 'trial', 'eventmgr', 'partnermgr', 'developer', 'designer'],
};

const SIZE_ROLE_GROUPS = {
  small: ['member', 'bots', 'colors', 'notifications'],
  medium: ['member', 'bots', 'colors', 'notifications', 'levels', 'age'],
  large: ['member', 'bots', 'colors', 'notifications', 'levels', 'age', 'vip', 'active', 'veteran', 'partner'],
  huge: ['member', 'bots', 'colors', 'notifications', 'levels', 'age', 'vip', 'active', 'veteran', 'partner'],
};

const SIZE_MEMBER_PERMS = {
  small: ['embeds', 'files', 'externalEmoji', 'threads', 'nickname', 'invites', 'stream', 'activities', 'soundboard', 'voiceMessages', 'polls', 'externalApps', 'voiceStatus'],
  medium: ['embeds', 'files', 'externalEmoji', 'threads', 'nickname', 'invites', 'stream', 'activities', 'soundboard', 'voiceMessages', 'polls', 'externalApps', 'voiceStatus'],
  large: ['embeds', 'files', 'externalEmoji', 'threads', 'nickname', 'invites', 'stream', 'activities', 'soundboard', 'voiceMessages', 'polls'],
  huge: ['embeds', 'externalEmoji', 'threads', 'nickname', 'invites', 'stream', 'activities', 'voiceMessages'],
};

const SIZE_SECURITY = {
  small: { verificationLevel: 1, contentFilter: 2, automod: ['spam', 'mentions', 'scam'] },
  medium: { verificationLevel: 2, contentFilter: 2, automod: ['spam', 'mentions', 'scam', 'invites', 'presetSlurs'] },
  large: { verificationLevel: 2, contentFilter: 2, automod: ['spam', 'mentions', 'scam', 'invites', 'presetSlurs', 'presetSexual', 'presetProfanity'] },
  huge: { verificationLevel: 3, contentFilter: 2, automod: ['spam', 'mentions', 'scam', 'invites', 'presetSlurs', 'presetSexual', 'presetProfanity', 'polishProfanity'] },
};

const SIZE_CHANNELS = {
  small: { slowmode: 0, voiceCount: 2, voiceLayout: 'open', afkTimeout: 300 },
  medium: { slowmode: 0, voiceCount: 3, voiceLayout: 'mixed', afkTimeout: 300 },
  large: { slowmode: 3, voiceCount: 4, voiceLayout: 'mixed', afkTimeout: 600 },
  huge: { slowmode: 5, voiceCount: 6, voiceLayout: 'big', afkTimeout: 900 },
};

const ALL_PANELS = ['rules', 'info', 'verify', 'selfroles', 'tickets', 'welcomeChat', 'staffGuide', 'faq', 'extras'];

function computeModules(preset, size, age) {
  const set = new Set(preset.modules);
  const adjust = SIZE_MODULES[size] || {};
  for (const m of adjust.remove || []) set.delete(m);
  for (const m of adjust.add || []) if (!(preset.never || []).includes(m)) set.add(m);
  if (String(age) !== '18') set.delete('nsfw');
  return Object.keys(MODULES).filter((m) => set.has(m));
}

function computeStaff(preset, size) {
  const base = preset.staffDefaults ? [...preset.staffDefaults] : [...SIZE_STAFF[size]];
  const extras = (preset.staffExtras || []).filter((e) => e.default).map((e) => e.key);
  return [...base, ...extras];
}

function computeRoleGroups(preset, size, age, modules) {
  const set = new Set(SIZE_ROLE_GROUPS[size]);
  for (const g of preset.roleDefaults?.add || []) set.add(g);
  for (const g of preset.roleDefaults?.remove || []) set.delete(g);
  if (String(age) === '18') set.delete('age');
  if (modules.includes('partnerships')) set.add('partner');
  if (modules.includes('vip')) set.add('vip');
  if (modules.includes('verification')) set.add('member');
  for (const s of preset.specials || []) if (s.default) set.add(s.key);
  return [...set];
}

function computeSecurity(preset, size, age) {
  const sec = structuredClone(SIZE_SECURITY[size]);
  if (String(age) === '18') sec.automod = sec.automod.filter((a) => a !== 'presetSexual');
  if (['business', 'school', 'support'].includes(preset.key)) {
    if (!sec.automod.includes('polishProfanity')) sec.automod.push('polishProfanity');
  }
  if (preset.key === 'friends') {
    sec.verificationLevel = 0;
    sec.contentFilter = 1;
    sec.automod = ['scam'];
  }
  return sec;
}

/** Oblicza wszystkie pola zależne od typu, rozmiaru i wieku. */
function computeDependentDefaults(answers) {
  const preset = { key: answers.type, ...SERVER_TYPES[answers.type] };
  const { size, age } = answers;
  const modules = computeModules(preset, size, age);
  const list = preset.list;
  return {
    modules,
    staffRoles: computeStaff(preset, size),
    communityRoles: computeRoleGroups(preset, size, age, modules),
    'permissions.member': [...SIZE_MEMBER_PERMS[size]],
    'security.verificationLevel': computeSecurity(preset, size, age).verificationLevel,
    'security.contentFilter': computeSecurity(preset, size, age).contentFilter,
    'security.automod': computeSecurity(preset, size, age).automod,
    'channels.slowmode': SIZE_CHANNELS[size].slowmode,
    'channels.voiceCount': SIZE_CHANNELS[size].voiceCount,
    'channels.voiceLayout': SIZE_CHANNELS[size].voiceLayout,
    'channels.afkTimeout': SIZE_CHANNELS[size].afkTimeout,
    'content.community': preset.key === 'friends' || size === 'small' ? 'off' : 'full',
    'special.items': list ? [...list.defaults] : [],
    'special.options': list ? [...list.options] : [],
    'special.layout': list ? list.layout : 'shared',
    'special.extras': (preset.extras || []).filter((e) => e.default).map((e) => e.key),
  };
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

/** Pola zależne od typu – resetowane przy zmianie typu serwera. */
const TYPE_FIELDS = ['modules', 'staffRoles', 'communityRoles', 'special.items', 'special.options', 'special.layout', 'special.extras', 'security.automod', 'content.community'];

/**
 * Przelicza domyślne wartości pól, których użytkownik nie ruszał.
 * @param {object} answers
 * @param {{ typeChanged?: boolean }} opts – przy zmianie typu resetujemy też „dotknięte” pola typu.
 */
function applyDefaults(answers, { typeChanged = false } = {}) {
  if (typeChanged) {
    for (const f of TYPE_FIELDS) delete answers.touched[f];
    answers.special.info = {};
    answers.customStaff = answers.customStaff || [];
  }
  const defaults = computeDependentDefaults(answers);
  for (const [path, value] of Object.entries(defaults)) {
    if (!answers.touched[path]) setPath(answers, path, structuredClone(value));
  }
  // Kanał 18+ ma sens tylko na serwerze dla dorosłych – pilnujemy tego zawsze.
  if (String(answers.age) !== '18') answers.modules = answers.modules.filter((m) => m !== 'nsfw');
  return answers;
}

function markTouched(answers, path) {
  answers.touched[path] = true;
}

function createAnswers(type = 'community') {
  const answers = {
    type,
    basics: { name: '', description: '', audience: '', iconUrl: '', rename: true },
    language: 'pl',
    size: 'medium',
    age: '13',
    style: { channel: 'dot', category: 'lines', palette: 'modern', options: ['separators', 'roleEmoji'] },
    modules: [],
    special: { items: [], options: [], layout: 'shared', extras: [], info: {} },
    staffRoles: [],
    customStaff: [],
    communityRoles: [],
    customRoles: [],
    permissions: { member: [], notifications: 'mentions' },
    security: { verificationLevel: 2, contentFilter: 2, automod: [] },
    channels: { slowmode: 0, voiceCount: 3, voiceLayout: 'mixed', afkTimeout: 300 },
    customCategories: [],
    content: { panels: [...ALL_PANELS], community: 'full', embedColor: 'palette' },
    mode: { type: 'append', assign: true },
    touched: {},
  };
  return applyDefaults(answers);
}

module.exports = {
  SIZES,
  AGES,
  LANGUAGES,
  ALL_PANELS,
  createAnswers,
  applyDefaults,
  markTouched,
  computeDependentDefaults,
  getPath,
  setPath,
};
