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
  const writers = unique([...g.admins, ...posters]);

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

module.exports = {
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
