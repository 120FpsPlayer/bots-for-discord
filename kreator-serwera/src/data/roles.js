'use strict';

const { L } = require('../utils/i18n');

/**
 * Poziomy uprawnień personelu. `rank` ustala kolejność ról (mniejszy = wyżej).
 * Dokładne uprawnienia każdego poziomu są w builder/permissions.js.
 */
const STAFF_LEVELS = {
  owner: { rank: 10, label: 'Właściciel (Administrator)', short: L('pełne uprawnienia', 'full permissions') },
  admin: { rank: 20, label: 'Administrator', short: L('zarządzanie serwerem, rolami i kanałami, bany', 'manages server, roles and channels, bans') },
  mod: { rank: 30, label: 'Moderator', short: L('bany, wyrzucanie, wyciszanie, porządek na czacie', 'bans, kicks, timeouts, chat moderation') },
  helper: { rank: 40, label: 'Pomocnik', short: L('pomoc użytkownikom, tickety, wyciszanie', 'helps users, tickets, timeouts') },
  trial: { rank: 45, label: 'Okres próbny', short: L('wyciszanie i usuwanie wiadomości', 'timeouts and deleting messages') },
  event: { rank: 50, label: 'Wydarzenia', short: L('wydarzenia i konkursy', 'events and giveaways') },
  partner: { rank: 52, label: 'Partnerstwa', short: L('obsługa partnerstw', 'handles partnerships') },
  developer: { rank: 54, label: 'Techniczny', short: L('boty, webhooki i integracje', 'bots, webhooks and integrations') },
  designer: { rank: 56, label: 'Grafika', short: L('emoji, naklejki i grafiki', 'emoji, stickers and graphics') },
  none: { rank: 60, label: 'Bez uprawnień moderacyjnych', short: L('członek ekipy', 'staff member') },
};

/** Standardowe role personelu (wybierane w kroku „Administracja”). */
const STAFF_ROLES = {
  owner: { name: L('Właściciel', 'Owner'), emoji: '👑', level: 'owner', color: 'owner', description: 'Pełne uprawnienia (Administrator)' },
  coowner: { name: L('Współwłaściciel', 'Co-Owner'), emoji: '💠', level: 'owner', color: 'coowner', rankOffset: 1, description: 'Pełne uprawnienia (Administrator)' },
  admin: { name: L('Administrator', 'Administrator'), emoji: '🛡️', level: 'admin', color: 'admin', description: 'Zarządza serwerem, rolami i kanałami' },
  mod: { name: L('Moderator', 'Moderator'), emoji: '🔨', level: 'mod', color: 'mod', description: 'Bany, wyrzucanie, wyciszanie, porządek' },
  helper: { name: L('Pomocnik', 'Helper'), emoji: '🧰', level: 'helper', color: 'helper', description: 'Pomoc użytkownikom, tickety, wyciszanie' },
  trial: { name: L('Moderator próbny', 'Trial Moderator'), emoji: '🌱', level: 'trial', color: 'trial', description: 'Nowy członek ekipy w okresie próbnym' },
  eventmgr: { name: L('Event Manager', 'Event Manager'), emoji: '🎉', level: 'event', color: 'func', description: 'Organizuje wydarzenia i konkursy' },
  partnermgr: { name: L('Partnership Manager', 'Partnership Manager'), emoji: '🤝', level: 'partner', color: 'func2', description: 'Obsługuje partnerstwa' },
  developer: { name: L('Developer', 'Developer'), emoji: '💻', level: 'developer', color: 'staffExtra', description: 'Boty, integracje i webhooki' },
  designer: { name: L('Grafik', 'Designer'), emoji: '🎨', level: 'designer', color: 'func2', description: 'Emoji, naklejki i grafiki serwera' },
};

/** Role specjalne społeczności (sekcja „Specjalne”). */
const COMMUNITY_ROLES = {
  bots: { name: L('Boty', 'Bots'), emoji: '🤖', color: 'bots', hoist: true, description: 'Rola dla botów (porządek na liście członków)' },
  partner: { name: L('Partner', 'Partner'), emoji: '🤝', color: 'partner', hoist: true, description: 'Przedstawiciele serwerów partnerskich' },
  vip: { name: L('VIP', 'VIP'), emoji: '💎', color: 'vip', hoist: true, description: 'Wyróżnieni członkowie (dostęp do strefy VIP)' },
  veteran: { name: L('Weteran', 'Veteran'), emoji: '🏅', color: 'veteran', description: 'Członkowie z najdłuższym stażem' },
  active: { name: L('Aktywny', 'Active'), emoji: '🔥', color: 'active', description: 'Najaktywniejsi członkowie' },
};

/** Role poziomów (dla botów typu MEE6 / Arcane / Lurkr). */
const LEVEL_ROLES = [
  { lvl: 100, emoji: '👑', minSize: 'large' },
  { lvl: 75, emoji: '💎', minSize: 'large' },
  { lvl: 50, emoji: '🔥', minSize: 'medium' },
  { lvl: 30, emoji: '💫', minSize: 'medium' },
  { lvl: 20, emoji: '🌟', minSize: 'small' },
  { lvl: 10, emoji: '⭐', minSize: 'small' },
  { lvl: 5, emoji: '🍀', minSize: 'small' },
  { lvl: 1, emoji: '🌱', minSize: 'small' },
];

/** Role powiadomień – tworzone tylko dla modułów, które istnieją na serwerze. */
const NOTIFICATION_ROLES = [
  { key: 'announcements', module: 'announcements', emoji: '📢', name: L('Ogłoszenia', 'Announcements') },
  { key: 'changelog', module: 'changelog', emoji: '🛠️', name: L('Aktualizacje', 'Updates') },
  { key: 'events', module: 'events', emoji: '🎉', name: L('Wydarzenia', 'Events') },
  { key: 'giveaways', module: 'giveaways', emoji: '🎁', name: L('Konkursy', 'Giveaways') },
  { key: 'polls', module: 'polls', emoji: '📊', name: L('Ankiety', 'Polls') },
  { key: 'partnerships', module: 'partnerships', emoji: '🤝', name: L('Partnerstwa', 'Partnerships') },
  { key: 'qotd', module: 'qotd', emoji: '❔', name: L('Pytanie dnia', 'Question of the day') },
];

const AGE_ROLES = [
  { key: 'a18', emoji: '🔞', name: L('18+', '18+'), min: 18 },
  { key: 'a16', emoji: '🧑', name: L('16-17 lat', '16-17'), min: 16 },
  { key: 'a13', emoji: '🧒', name: L('13-15 lat', '13-15'), min: 13 },
];

const PRONOUN_ROLES = [
  { key: 'he', emoji: '👨', name: L('On/jego', 'He/him') },
  { key: 'she', emoji: '👩', name: L('Ona/jej', 'She/her') },
  { key: 'they', emoji: '🧑', name: L('Oni/ich', 'They/them') },
  { key: 'any', emoji: '💬', name: L('Dowolne / zapytaj', 'Any / ask me') },
];

const PLATFORM_ROLES = [
  { key: 'pc', emoji: '💻', name: L('PC', 'PC') },
  { key: 'ps', emoji: '🟦', name: L('PlayStation', 'PlayStation') },
  { key: 'xbox', emoji: '🟩', name: L('Xbox', 'Xbox') },
  { key: 'switch', emoji: '🍄', name: L('Nintendo Switch', 'Nintendo Switch') },
  { key: 'mobile', emoji: '📱', name: L('Mobile', 'Mobile') },
];

const REGION_ROLES = {
  pl: [
    'Dolnośląskie', 'Kujawsko-pomorskie', 'Lubelskie', 'Lubuskie', 'Łódzkie', 'Małopolskie', 'Mazowieckie', 'Opolskie',
    'Podkarpackie', 'Podlaskie', 'Pomorskie', 'Śląskie', 'Świętokrzyskie', 'Warmińsko-mazurskie', 'Wielkopolskie',
    'Zachodniopomorskie', 'Za granicą',
  ].map((name, i) => ({ key: `r${i}`, emoji: name === 'Za granicą' ? '🌍' : '📍', name })),
  en: [
    { key: 'eu', emoji: '🌍', name: 'Europe' },
    { key: 'na', emoji: '🌎', name: 'North America' },
    { key: 'sa', emoji: '🌎', name: 'South America' },
    { key: 'as', emoji: '🌏', name: 'Asia' },
    { key: 'af', emoji: '🌍', name: 'Africa' },
    { key: 'oc', emoji: '🌏', name: 'Oceania' },
  ],
};

/**
 * Grupy ról do wyboru w kroku „Role społeczności”.
 * `self`: single = tylko jedna rola z grupy, multi = dowolnie wiele.
 */
const ROLE_GROUP_OPTIONS = {
  member: { emoji: '✅', label: 'Rola członka', description: 'Podstawowa rola (nadawana po weryfikacji)' },
  bots: { emoji: '🤖', label: 'Boty', description: COMMUNITY_ROLES.bots.description },
  vip: { emoji: '💎', label: 'VIP', description: COMMUNITY_ROLES.vip.description },
  partner: { emoji: '🤝', label: 'Partner', description: COMMUNITY_ROLES.partner.description },
  active: { emoji: '🔥', label: 'Aktywny', description: COMMUNITY_ROLES.active.description },
  veteran: { emoji: '🏅', label: 'Weteran', description: COMMUNITY_ROLES.veteran.description },
  levels: { emoji: '⭐', label: 'Poziomy (1–100)', description: 'Role za poziomy dla botów levelujących' },
  notifications: { emoji: '🔔', label: 'Powiadomienia', description: 'Role do pingów: ogłoszenia, wydarzenia, konkursy…' },
  colors: { emoji: '🎨', label: 'Kolory nicku', description: '14 kolorów do wyboru w panelu ról' },
  age: { emoji: '🎂', label: 'Wiek', description: 'Przedziały wiekowe (jedna rola na osobę)' },
  pronouns: { emoji: '💬', label: 'Zaimki', description: 'On/jego, Ona/jej, Oni/ich…' },
  platform: { emoji: '🎮', label: 'Platformy', description: 'PC, PlayStation, Xbox, Switch, Mobile' },
  region: { emoji: '📍', label: 'Region', description: 'Województwa (PL) lub kontynenty (EN)' },
};

/** Nazwy separatorów ról (role-przegródki na liście ról). */
const SEPARATORS = {
  staff: L('Administracja', 'Staff'),
  special: L('Specjalne', 'Special'),
  colors: L('Kolory', 'Colors'),
  levels: L('Poziomy', 'Levels'),
  members: L('Członkowie', 'Members'),
  items: L('Zainteresowania', 'Interests'),
  notifications: L('Powiadomienia', 'Notifications'),
  about: L('O mnie', 'About me'),
  custom: L('Dodatkowe', 'Extra'),
};

module.exports = {
  STAFF_LEVELS,
  STAFF_ROLES,
  COMMUNITY_ROLES,
  LEVEL_ROLES,
  NOTIFICATION_ROLES,
  AGE_ROLES,
  PRONOUN_ROLES,
  PLATFORM_ROLES,
  REGION_ROLES,
  ROLE_GROUP_OPTIONS,
  SEPARATORS,
};
