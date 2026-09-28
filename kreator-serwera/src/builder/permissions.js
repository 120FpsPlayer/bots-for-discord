'use strict';

const { PermissionFlagsBits } = require('discord.js');

/**
 * Uprawnienia są w blueprincie zapisywane jako nazwy (np. 'SendMessages'),
 * żeby eksport JSON był czytelny. Zamiana na bity następuje dopiero przy budowaniu.
 */

/** Podstawowe uprawnienia każdego członka – bez nich serwer nie działa. */
const MEMBER_CORE = [
  'ViewChannel', 'ReadMessageHistory', 'SendMessages', 'SendMessagesInThreads', 'AddReactions',
  'UseApplicationCommands', 'Connect', 'Speak', 'UseVAD', 'RequestToSpeak',
];

/** Uprawnienia członków, które można włączyć/wyłączyć w kreatorze. */
const MEMBER_TOGGLES = {
  embeds: { emoji: '🔗', label: 'Osadzanie linków', description: 'Podglądy linków (embed) w wiadomościach', perms: ['EmbedLinks'] },
  files: { emoji: '📎', label: 'Wysyłanie plików', description: 'Wyłączone = pliki tylko w kanałach mediów', perms: ['AttachFiles'] },
  externalEmoji: { emoji: '😎', label: 'Zewnętrzne emoji i naklejki', description: 'Emoji/naklejki z innych serwerów (Nitro)', perms: ['UseExternalEmojis', 'UseExternalStickers'] },
  threads: { emoji: '🧵', label: 'Tworzenie wątków', description: 'Publiczne wątki pod wiadomościami', perms: ['CreatePublicThreads'] },
  nickname: { emoji: '🏷️', label: 'Zmiana własnego nicku', description: 'Członkowie mogą zmienić swój pseudonim', perms: ['ChangeNickname'] },
  invites: { emoji: '📨', label: 'Tworzenie zaproszeń', description: 'Członkowie mogą zapraszać innych', perms: ['CreateInstantInvite'] },
  stream: { emoji: '📹', label: 'Kamera i udostępnianie ekranu', description: 'Go Live / wideo na kanałach głosowych', perms: ['Stream'] },
  activities: { emoji: '🕹️', label: 'Aktywności', description: 'Gry i aplikacje na kanałach głosowych', perms: ['UseEmbeddedActivities'] },
  soundboard: { emoji: '🔉', label: 'Soundboard', description: 'Dźwięki z soundboardu (także zewnętrzne)', perms: ['UseSoundboard', 'UseExternalSounds'] },
  voiceMessages: { emoji: '🎙️', label: 'Wiadomości głosowe', description: 'Nagrywanie wiadomości głosowych', perms: ['SendVoiceMessages'] },
  polls: { emoji: '📊', label: 'Ankiety', description: 'Tworzenie ankiet przez członków', perms: ['SendPolls'] },
  externalApps: { emoji: '🧩', label: 'Aplikacje zewnętrzne', description: 'Komendy aplikacji użytkownika (user apps)', perms: ['UseExternalApps'] },
  voiceStatus: { emoji: '📝', label: 'Status kanału głosowego', description: 'Ustawianie statusu kanału głosowego', perms: ['SetVoiceChannelStatus'] },
  events: { emoji: '📅', label: 'Tworzenie wydarzeń', description: 'Członkowie mogą planować wydarzenia', perms: ['CreateEvents'] },
  expressions: { emoji: '😀', label: 'Dodawanie emoji', description: 'Członkowie mogą dodawać emoji i naklejki', perms: ['CreateGuildExpressions'] },
};

const ALL_MEMBER = [...MEMBER_CORE, ...Object.values(MEMBER_TOGGLES).flatMap((t) => t.perms)];

/** Uprawnienia ról personelu według poziomu. */
const STAFF_PERMISSIONS = {
  owner: ['Administrator'],
  admin: [
    ...ALL_MEMBER, 'ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers', 'ManageMessages', 'PinMessages',
    'ManageNicknames', 'ManageWebhooks', 'ManageGuildExpressions', 'ManageEvents', 'ManageThreads', 'CreatePrivateThreads',
    'ModerateMembers', 'ViewAuditLog', 'ViewGuildInsights', 'MentionEveryone', 'MuteMembers', 'DeafenMembers', 'MoveMembers',
    'PrioritySpeaker', 'BypassSlowmode',
  ],
  mod: [
    ...ALL_MEMBER, 'KickMembers', 'BanMembers', 'ManageMessages', 'PinMessages', 'ManageNicknames', 'ManageThreads',
    'CreatePrivateThreads', 'ModerateMembers', 'ViewAuditLog', 'MentionEveryone', 'MuteMembers', 'DeafenMembers', 'MoveMembers',
    'ManageEvents', 'BypassSlowmode', 'PrioritySpeaker',
  ],
  helper: [...ALL_MEMBER, 'ManageMessages', 'PinMessages', 'ManageThreads', 'ModerateMembers', 'MuteMembers', 'MoveMembers', 'BypassSlowmode'],
  trial: [...ALL_MEMBER, 'ManageMessages', 'ModerateMembers', 'MoveMembers'],
  event: [...ALL_MEMBER, 'ManageEvents'],
  partner: [...ALL_MEMBER],
  developer: [...ALL_MEMBER, 'ManageWebhooks', 'ViewAuditLog'],
  designer: [...ALL_MEMBER, 'ManageGuildExpressions'],
  none: [...ALL_MEMBER],
};

/** Uprawnienia, których NIGDY nie nadajemy przez panel ról / weryfikację (zabezpieczenie). */
const DANGEROUS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers', 'ManageMessages',
  'ManageWebhooks', 'ModerateMembers', 'MentionEveryone', 'ManageNicknames', 'ManageThreads', 'ViewAuditLog',
  'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ManageGuildExpressions', 'ManageEvents',
];

const SEND_SET = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'];
const POST_SET = ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'EmbedLinks', 'AttachFiles', 'MentionEveryone'];

const unique = (list) => [...new Set(list)];

/** Zamienia listę nazw uprawnień na BigInt. Nieznane nazwy są ignorowane. */
function toBits(names = []) {
  let bits = 0n;
  for (const name of names) {
    const flag = PermissionFlagsBits[name];
    if (flag !== undefined) bits |= flag;
  }
  return bits;
}

function ow(target, allow = [], deny = []) {
  return { target, allow: unique(allow), deny: unique(deny) };
}

/**
 * Scala listy nadpisań. Późniejsze wpisy wygrywają przy konflikcie
 * (np. allow z profilu kanału nadpisuje deny z kategorii).
 */
function mergeOverwrites(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      const current = map.get(entry.target) || { target: entry.target, allow: new Set(), deny: new Set() };
      for (const p of entry.allow || []) { current.allow.add(p); current.deny.delete(p); }
      for (const p of entry.deny || []) { current.deny.add(p); current.allow.delete(p); }
      map.set(entry.target, current);
    }
  }
  return [...map.values()]
    .map((e) => ({ target: e.target, allow: [...e.allow], deny: [...e.deny] }))
    .filter((e) => e.allow.length || e.deny.length);
}

/** Profile, które same decydują o widoczności kanału (nie dziedziczą kategorii). */
const VISIBILITY_PROFILES = new Set(['staff', 'admin', 'adminPost', 'logs', 'vip', 'private']);

/**
 * Buduje nadpisania uprawnień dla profilu.
 * g = grupy ról: { admins, mods, staff, member, vip, bots }, gate = czy działa weryfikacja,
 * filesOff = czy pliki są wyłączone globalnie (wtedy kanały mediów je włączają).
 */
function profileOverwrites(profile, g, { posters = [], access = [], gate = false, filesOff = false } = {}) {
  const E = '@everyone';
  const allowFor = (keys, perms) => unique(keys).map((k) => ow(k, perms));
  // W kanałach tylko do odczytu piszą: administracja, wskazane role (np. Event Manager) i boty (np. feedy newsów).
  const writers = unique([...g.admins, ...posters, ...g.bots]);

  switch (profile) {
    case 'public':
      return [];
    case 'media':
      return filesOff ? [ow(E, ['AttachFiles', 'EmbedLinks'])] : [];
    case 'readonly':
      return [ow(E, [], SEND_SET), ...allowFor(writers, POST_SET)];
    case 'rules':
      return gate
        ? [ow(E, ['ViewChannel', 'ReadMessageHistory'], [...SEND_SET, 'AddReactions']), ...allowFor(writers, POST_SET)]
        : [ow(E, [], SEND_SET), ...allowFor(writers, POST_SET)];
    case 'verify':
      return [
        ow(E, ['ViewChannel', 'ReadMessageHistory'], [...SEND_SET, 'AddReactions', 'UseApplicationCommands']),
        ...(g.member.length ? [ow(g.member[0], [], ['ViewChannel'])] : []),
        ...allowFor(g.admins, POST_SET),
      ];
    case 'threadsOnly':
      return [ow(E, ['SendMessagesInThreads'], ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads']), ...allowFor(writers, POST_SET)];
    case 'staff':
      return [ow(E, [], ['ViewChannel']), ...allowFor(g.staff, ['ViewChannel'])];
    case 'admin':
      return [ow(E, [], ['ViewChannel']), ...allowFor(g.admins, ['ViewChannel'])];
    case 'adminPost':
      return [ow(E, [], ['ViewChannel', ...SEND_SET]), ...allowFor(g.staff, ['ViewChannel']), ...allowFor(g.admins, POST_SET)];
    case 'logs':
      return [
        ow(E, [], ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads', 'AddReactions']),
        ...allowFor(g.mods, ['ViewChannel', 'ReadMessageHistory']),
        ...allowFor(g.bots, ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory']),
      ];
    case 'vip':
      return [ow(E, [], ['ViewChannel']), ...allowFor([...g.vip, '@booster', ...g.staff], ['ViewChannel'])];
    case 'private':
      return [ow(E, [], ['ViewChannel']), ...allowFor([...access, ...g.staff], ['ViewChannel'])];
    case 'afk':
      return [ow(E, [], ['Speak', 'Stream', 'UseSoundboard', 'UseEmbeddedActivities', 'SendMessages'])];
    case 'quiet':
      return [ow(E, [], ['Speak', 'UseSoundboard'])];
    default:
      return [];
  }
}

// ───────────── Dostęp do kanałów (krok „Dostęp do kanałów” w kreatorze) ─────────────

/** Kto widzi kanał. `mods`, `role` i `verify` wynikają z ustawień zalecanych – nie da się ich wybrać ręcznie. */
const VIEW_OPTIONS = {
  members: { emoji: '👥', label: 'Wszyscy członkowie', short: 'członkowie', description: 'Widzą wszyscy (po weryfikacji, jeśli jest włączona)' },
  unverified: { emoji: '🌍', label: 'Wszyscy, także przed weryfikacją', short: 'wszyscy (też niezweryfikowani)', description: 'Widoczne od razu po wejściu na serwer' },
  vip: { emoji: '💎', label: 'VIP, partnerzy, boosterzy + ekipa', short: 'VIP + ekipa', description: 'Ukryte przed zwykłymi członkami' },
  staff: { emoji: '🛡️', label: 'Tylko ekipa', short: 'tylko ekipa', description: 'Widzi tylko administracja i moderacja' },
  admins: { emoji: '🔒', label: 'Tylko zarząd', short: 'tylko zarząd', description: 'Widzą tylko administratorzy' },
};
const VIEW_LABELS = {
  ...Object.fromEntries(Object.entries(VIEW_OPTIONS).map(([k, v]) => [k, `${v.emoji} ${v.short}`])),
  mods: '🛡️ moderacja',
  role: '🔒 tylko z rolą',
  verify: '✅ tylko niezweryfikowani',
};

/** Kto może pisać (w kanałach głosowych: mówić). */
const WRITE_OPTIONS = {
  all: { emoji: '✍️', label: 'Każdy, kto widzi, może pisać', short: 'piszą wszyscy', description: 'Na głosowych: każdy może mówić' },
  readonly: { emoji: '👁️', label: 'Tylko odczyt – pisze zarząd', short: 'odczyt (pisze zarząd)', description: 'Członkowie tylko czytają (na głosowych: tylko słuchają)' },
  readonlyStaff: { emoji: '🛡️', label: 'Tylko odczyt – pisze cała ekipa', short: 'odczyt (pisze ekipa)', description: 'Pisać mogą wszyscy z ekipy' },
  threads: { emoji: '🧵', label: 'Tylko odpowiedzi w wątkach', short: 'tylko w wątkach', description: 'Nowe wiadomości pisze ekipa, członkowie odpowiadają w wątkach' },
};
const WRITE_LABELS = {
  ...Object.fromEntries(Object.entries(WRITE_OPTIONS).map(([k, v]) => [k, `${v.emoji} ${v.short}`])),
  bots: '🤖 piszą boty',
  none: '🚫 bez pisania',
  listen: '🔇 bez mówienia',
};

const VOICE_WRITE_LABELS = {
  all: '🎙️ mówią wszyscy',
  readonly: '🔇 mówi tylko zarząd',
  readonlyStaff: '🔇 mówi tylko ekipa',
  listen: '🔇 bez mówienia',
};

/** Czytelny opis dostępu kanału, np. „👥 członkowie · 👁️ odczyt (pisze zarząd)”. */
function describeAccess(access, kind = 'text') {
  const voice = kind === 'voice' || kind === 'stage';
  const write = (voice && VOICE_WRITE_LABELS[access.write]) || WRITE_LABELS[access.write];
  return { view: VIEW_LABELS[access.view], write, text: `${VIEW_LABELS[access.view]} · ${write}` };
}

const PROFILE_VIEW = {
  staff: 'staff', adminPost: 'staff', admin: 'admins', logs: 'mods', vip: 'vip', private: 'role', verify: 'verify',
};
const PROFILE_WRITE = {
  readonly: 'readonly', rules: 'readonly', adminPost: 'readonly', threadsOnly: 'threads', logs: 'bots', verify: 'none', afk: 'listen', quiet: 'listen',
};

/** Kanały, których uprawnień nie zmieniają ustawienia sekcji (bez nich serwer by się „zepsuł”). */
function isProtectedChannel(profile, gate) {
  return profile === 'verify' || profile === 'admin' || profile === 'private' || (profile === 'rules' && gate);
}

/** Zalecany (domyślny) dostęp kanału wynikający z jego profilu i profilu kategorii. */
function defaultAccess(channelProfile, categoryProfile, gate) {
  let view = PROFILE_VIEW[channelProfile] || PROFILE_VIEW[categoryProfile] || 'members';
  if (channelProfile === 'rules' && gate) view = 'unverified';
  let write = PROFILE_WRITE[channelProfile];
  if (!write) write = ['public', 'media'].includes(channelProfile) ? (PROFILE_WRITE[categoryProfile] || 'all') : 'all';
  return { view, write };
}

/**
 * Buduje nadpisania z pary (kto widzi, kto pisze).
 * kind = rodzaj kanału (głosowe: „pisanie” = mówienie), posters = role, które mogą pisać w kanale tylko do odczytu.
 */
function accessOverwrites(view, write, g, { kind = 'text', posters = [], gate = false } = {}) {
  const E = '@everyone';
  const voice = kind === 'voice' || kind === 'stage';
  const allowFor = (keys, perms) => unique(keys).map((k) => ow(k, perms));
  const out = [];

  // Kto widzi
  if (view === 'unverified') {
    out.push(ow(E, voice ? ['ViewChannel', 'Connect'] : ['ViewChannel', 'ReadMessageHistory']));
  } else if (view === 'vip') {
    out.push(ow(E, [], ['ViewChannel']), ...allowFor([...g.vip, '@booster', ...g.staff], ['ViewChannel']));
  } else if (view === 'staff') {
    out.push(ow(E, [], ['ViewChannel']), ...allowFor(g.staff, ['ViewChannel']));
  } else if (view === 'mods') {
    out.push(ow(E, [], ['ViewChannel']), ...allowFor(g.mods, ['ViewChannel', 'ReadMessageHistory']));
  } else if (view === 'admins') {
    out.push(ow(E, [], ['ViewChannel']), ...allowFor(g.admins, ['ViewChannel']));
  }

  // Kto pisze / mówi
  const writersFor = (base) => unique([...base, ...posters, ...g.bots]);
  if (voice) {
    const speakers = write === 'readonlyStaff' ? writersFor(g.staff) : writersFor(g.admins);
    if (write === 'readonly' || write === 'readonlyStaff' || write === 'listen') {
      out.push(ow(E, [], ['Speak', 'Stream', 'UseSoundboard']), ...allowFor(write === 'listen' ? [] : speakers, ['ViewChannel', 'Connect', 'Speak', 'Stream']));
    } else if (view === 'unverified' && gate) {
      out.push(ow(E, ['Speak', 'UseVAD']));
    }
    return mergeOverwrites(out);
  }
  if (write === 'readonly' || write === 'readonlyStaff') {
    out.push(ow(E, [], SEND_SET), ...allowFor(writersFor(write === 'readonlyStaff' ? g.staff : g.admins), POST_SET));
  } else if (write === 'threads') {
    out.push(ow(E, ['SendMessagesInThreads'], ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads']), ...allowFor(writersFor(g.admins), POST_SET));
  } else if (write === 'bots') {
    out.push(ow(E, [], [...SEND_SET, 'AddReactions']), ...allowFor(g.bots, ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory']));
  } else if (write === 'all' && view === 'unverified' && gate) {
    out.push(ow(E, ['SendMessages', 'SendMessagesInThreads', 'AddReactions']));
  }
  return mergeOverwrites(out);
}

module.exports = {
  VIEW_OPTIONS,
  VIEW_LABELS,
  WRITE_OPTIONS,
  WRITE_LABELS,
  describeAccess,
  isProtectedChannel,
  defaultAccess,
  accessOverwrites,
  MEMBER_CORE,
  MEMBER_TOGGLES,
  ALL_MEMBER,
  STAFF_PERMISSIONS,
  DANGEROUS,
  SEND_SET,
  VISIBILITY_PROFILES,
  toBits,
  mergeOverwrites,
  profileOverwrites,
  unique,
};
