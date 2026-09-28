'use strict';

const { L } = require('../utils/i18n');

/**
 * Stałe kategorie serwera – w tej kolejności pojawią się na serwerze.
 * `special` (kategoria typu serwera) i `items` (lista: gry/przedmioty/działy…)
 * są wstawiane dynamicznie w miejsce znaczników.
 */
const CATEGORIES = {
  info: { name: L('Informacje', 'Information'), emoji: '📌' },
  news: { name: L('Ogłoszenia', 'Announcements'), emoji: '📢' },
  special: { name: L('Serwer', 'Server'), emoji: '⭐' },
  community: { name: L('Społeczność', 'Community'), emoji: '💬' },
  items: { name: L('Tematy', 'Topics'), emoji: '🗂️' },
  voice: { name: L('Kanały głosowe', 'Voice channels'), emoji: '🔊' },
  vip: { name: L('Strefa VIP', 'VIP zone'), emoji: '💎', profile: 'vip' },
  staff: { name: L('Administracja', 'Staff'), emoji: '🛡️', profile: 'staff' },
  logs: { name: L('Logi', 'Logs'), emoji: '📁', profile: 'logs' },
  archive: { name: L('Archiwum', 'Archive'), emoji: '🗄️', profile: 'readonly' },
};

/** Kolejność kategorii; `special` może przeskoczyć za `news` (patrz preset.specialPosition). */
const CATEGORY_ORDER = ['info', 'news', 'special', 'community', 'items', 'voice', 'vip', 'custom', 'staff', 'logs', 'archive'];

/**
 * Definicja kanału:
 *  key      – unikalny klucz (używany w odnośnikach i wiadomościach),
 *  kind     – text | announcement | forum | voice | stage,
 *  profile  – profil uprawnień (patrz builder/permissions.js),
 *  posters  – grupy/role, które mogą pisać w kanale tylko do odczytu,
 *  slowmode – liczba sekund lub 'chat' (wartość z ustawień kreatora),
 *  post     – rodzaj wiadomości, którą bot opublikuje w kanale,
 *  tags     – tagi forum.
 */
function ch(key, emoji, name, topic, opts = {}) {
  return { key, emoji, name, topic, kind: 'text', profile: 'public', ...opts };
}

/**
 * Moduły (sekcje serwera) wybierane w kroku „Sekcje”.
 * group: A = informacje i ogłoszenia, B = społeczność, C = głosowe i administracja.
 */
const MODULES = {
  // ───────────── A: informacje i ogłoszenia ─────────────
  verification: {
    group: 'A', emoji: '✅', label: 'Weryfikacja',
    description: 'Nowi widzą tylko regulamin i przycisk weryfikacji',
    channels: [ch('verify', '✅', L('weryfikacja', 'verification'),
      L('Kliknij przycisk poniżej, aby uzyskać dostęp do serwera.', 'Click the button below to get access to the server.'),
      { cat: 'info', profile: 'verify', post: 'verify' })],
  },
  rules: {
    group: 'A', emoji: '📜', label: 'Regulamin',
    description: 'Profesjonalny regulamin generowany automatycznie',
    channels: [ch('rules', '📜', L('regulamin', 'rules'),
      L('Zasady obowiązujące na serwerze. Przebywając tu, akceptujesz regulamin.', 'Server rules. By staying here you accept them.'),
      { cat: 'info', profile: 'rules', post: 'rules' })],
  },
  info: {
    group: 'A', emoji: 'ℹ️', label: 'Informacje o serwerze',
    description: 'Opis serwera, przewodnik po kanałach i ekipie',
    channels: [ch('info', 'ℹ️', L('informacje', 'information'),
      L('Wszystko, co musisz wiedzieć o serwerze: kanały, role i ekipa.', 'Everything you need to know: channels, roles and staff.'),
      { cat: 'info', profile: 'readonly', post: 'info' })],
  },
  faq: {
    group: 'A', emoji: '❓', label: 'FAQ',
    description: 'Najczęściej zadawane pytania',
    channels: [ch('faq', '❓', L('faq', 'faq'),
      L('Najczęściej zadawane pytania – sprawdź, zanim zapytasz.', 'Frequently asked questions – check before asking.'),
      { cat: 'info', profile: 'readonly', post: 'faq' })],
  },
  roleinfo: {
    group: 'A', emoji: '🎭', label: 'Opis ról',
    description: 'Kanał z listą ról serwera i tym, jak je zdobyć',
    channels: [ch('roleinfo', '🎭', L('role', 'roles'),
      L('Lista ról na serwerze – kto jest kim i jak zdobyć daną rolę.', 'Server roles – who is who and how to get each role.'),
      { cat: 'info', profile: 'readonly', post: 'rolesInfo' })],
  },
  welcome: {
    group: 'A', emoji: '👋', label: 'Powitania',
    description: 'Kanał systemowy – Discord wita tu nowe osoby',
    channels: [ch('welcome', '👋', L('powitania', 'welcome'),
      L('Tu witamy każdą nową osobę na serwerze!', 'Every new member is welcomed here!'),
      { cat: 'info', profile: 'readonly' })],
  },
  boosts: {
    group: 'A', emoji: '🚀', label: 'Boosty',
    description: 'Podziękowania za boosty i nagrody dla boosterów',
    channels: [ch('boosts', '🚀', L('boosty', 'boosts'),
      L('Dziękujemy każdemu, kto wspiera serwer boostem!', 'Thank you to everyone who boosts the server!'),
      { cat: 'info', profile: 'readonly', post: 'boosts' })],
  },
  announcements: {
    group: 'A', emoji: '📢', label: 'Ogłoszenia',
    description: 'Kanał ogłoszeń (obserwowalny w Community)',
    channels: [ch('announcements', '📢', L('ogłoszenia', 'announcements'),
      L('Najważniejsze informacje od administracji.', 'The most important news from the staff.'),
      { cat: 'news', kind: 'announcement', profile: 'readonly' })],
  },
  changelog: {
    group: 'A', emoji: '🛠️', label: 'Zmiany na serwerze',
    description: 'Changelog – co nowego na serwerze',
    channels: [ch('changelog', '🛠️', L('zmiany', 'changelog'),
      L('Lista zmian i nowości na serwerze.', 'List of changes and new features.'),
      { cat: 'news', kind: 'announcement', profile: 'readonly' })],
  },
  events: {
    group: 'A', emoji: '🎉', label: 'Wydarzenia',
    description: 'Ogłoszenia eventów (pisze Event Manager)',
    channels: [ch('events', '🎉', L('wydarzenia', 'events'),
      L('Nadchodzące wydarzenia i eventy na serwerze.', 'Upcoming events on the server.'),
      { cat: 'news', profile: 'readonly', posters: ['eventmgr'] })],
  },
  giveaways: {
    group: 'A', emoji: '🎁', label: 'Konkursy / Giveaway',
    description: 'Konkursy i rozdania nagród',
    channels: [ch('giveaways', '🎁', L('konkursy', 'giveaways'),
      L('Konkursy i giveawaye – weź udział i wygrywaj!', 'Giveaways and contests – join and win!'),
      { cat: 'news', profile: 'readonly', posters: ['eventmgr'] })],
  },
  partnerships: {
    group: 'A', emoji: '🤝', label: 'Partnerstwa',
    description: 'Serwery partnerskie i warunki współpracy',
    channels: [ch('partnerships', '🤝', L('partnerstwa', 'partnerships'),
      L('Nasi partnerzy. Chcesz nawiązać współpracę? Napisz do administracji.', 'Our partners. Want to partner? Contact the staff.'),
      { cat: 'news', profile: 'readonly', posters: ['partnermgr'], post: 'partnerships' })],
  },
  polls: {
    group: 'A', emoji: '📊', label: 'Ankiety',
    description: 'Ankiety administracji dla społeczności',
    channels: [ch('polls', '📊', L('ankiety', 'polls'),
      L('Głosuj w ankietach i decyduj o przyszłości serwera.', 'Vote in polls and shape the server.'),
      { cat: 'news', profile: 'readonly' })],
  },

  // ───────────── B: społeczność ─────────────
  general: {
    group: 'B', emoji: '💬', label: 'Czat ogólny',
    description: 'Główny kanał rozmów',
    channels: [ch('general', '💬', L('ogólny', 'general'),
      L('Główny czat serwera – rozmawiaj o wszystkim (zgodnie z regulaminem).', 'Main chat – talk about anything (within the rules).'),
      { cat: 'community', slowmode: 'chat', post: 'welcomeChat' })],
  },
  introductions: {
    group: 'B', emoji: '🙋', label: 'Przedstaw się',
    description: 'Kanał do przedstawiania się nowych osób',
    channels: [ch('introductions', '🙋', L('przedstaw-się', 'introductions'),
      L('Napisz kilka słów o sobie! (1 wiadomość na 30 minut)', 'Tell us about yourself! (1 message per 30 minutes)'),
      { cat: 'community', slowmode: 1800 })],
  },
  media: {
    group: 'B', emoji: '📸', label: 'Media',
    description: 'Zdjęcia, filmy i klipy',
    channels: [ch('media', '📸', L('media', 'media'),
      L('Zdjęcia, filmy i klipy. Rozmowy prowadź w wątkach.', 'Photos, videos and clips. Discuss in threads.'),
      { cat: 'community', profile: 'media', slowmode: 10 })],
  },
  memes: {
    group: 'B', emoji: '😂', label: 'Memy',
    description: 'Kanał na memy i śmieszne treści',
    channels: [ch('memes', '😂', L('memy', 'memes'),
      L('Memy i śmieszne treści (bez NSFW i obrażania innych).', 'Memes and funny stuff (no NSFW, no insults).'),
      { cat: 'community', profile: 'media', slowmode: 5 })],
  },
  offtopic: {
    group: 'B', emoji: '🌀', label: 'Offtop',
    description: 'Luźne rozmowy niezwiązane z tematem serwera',
    channels: [ch('offtopic', '🌀', L('offtop', 'off-topic'),
      L('Luźne rozmowy na każdy temat.', 'Casual chat about anything.'),
      { cat: 'community', slowmode: 'chat' })],
  },
  botcmds: {
    group: 'B', emoji: '🤖', label: 'Komendy botów',
    description: 'Osobny kanał na komendy botów',
    channels: [ch('botcmds', '🤖', L('komendy', 'bot-commands'),
      L('Używaj tu komend botów, aby nie zaśmiecać innych kanałów.', 'Use bot commands here to keep other channels clean.'),
      { cat: 'community' })],
  },
  suggestions: {
    group: 'B', emoji: '💡', label: 'Propozycje',
    description: 'Forum propozycji z tagami statusu',
    channels: [ch('suggestions', '💡', L('propozycje', 'suggestions'),
      L('Masz pomysł na ulepszenie serwera? Utwórz post! Jeden pomysł = jeden post.', 'Got an idea? Create a post! One idea = one post.'),
      {
        cat: 'community', kind: 'forum', slowmode: 300, post: 'suggestions',
        tags: [
          { name: L('Nowa', 'New'), emoji: '🆕' },
          { name: L('W trakcie analizy', 'Under review'), emoji: '🔍' },
          { name: L('Zaakceptowana', 'Accepted'), emoji: '✅', moderated: true },
          { name: L('Wdrożona', 'Implemented'), emoji: '🚀', moderated: true },
          { name: L('Odrzucona', 'Rejected'), emoji: '❌', moderated: true },
        ],
        reaction: '👍',
      })],
  },
  qotd: {
    group: 'B', emoji: '❔', label: 'Pytanie dnia',
    description: 'Codzienne pytanie – odpowiedzi w wątkach',
    channels: [ch('qotd', '❔', L('pytanie-dnia', 'question-of-the-day'),
      L('Codzienne pytanie od ekipy. Odpowiadaj w wątku pod pytaniem!', 'Daily question from the staff. Reply in the thread!'),
      { cat: 'community', profile: 'threadsOnly', post: 'qotd' })],
  },
  counting: {
    group: 'B', emoji: '🔢', label: 'Liczenie',
    description: 'Mini-gra: liczymy razem jak najdalej',
    channels: [ch('counting', '🔢', L('liczenie', 'counting'),
      L('Liczymy po kolei: 1, 2, 3… Ta sama osoba nie może pisać dwa razy z rzędu.', 'Count up together: 1, 2, 3… No one counts twice in a row.'),
      { cat: 'community', post: 'counting' })],
  },
  music: {
    group: 'B', emoji: '🎵', label: 'Muzyka',
    description: 'Kanał tekstowy + głosowy dla botów muzycznych',
    channels: [
      ch('musicText', '🎵', L('muzyka', 'music'),
        L('Komendy botów muzycznych i polecajki utworów.', 'Music bot commands and song recommendations.'),
        { cat: 'community' }),
      ch('musicVoice', '🎵', L('Muzyka', 'Music'), null, { cat: 'voice', kind: 'voice' }),
    ],
  },
  nsfw: {
    group: 'B', emoji: '🔞', label: 'Kanał 18+',
    description: 'Kanał z ograniczeniem wiekowym (tylko serwery 18+)',
    adultOnly: true,
    channels: [ch('nsfw', '🔞', L('nsfw', 'nsfw'),
      L('Kanał tylko dla pełnoletnich. Obowiązuje regulamin i ToS Discorda.', 'Adults only. Server rules and Discord ToS apply.'),
      { cat: 'community', nsfw: true })],
  },

  // ───────────── C: głosowe, wsparcie, administracja ─────────────
  voice: {
    group: 'C', emoji: '🔊', label: 'Kanały głosowe',
    description: 'Lobby głosowe + kanały z limitem (ustawisz dalej)',
    channels: [], // generowane dynamicznie w blueprint.js
  },
  stage: {
    group: 'C', emoji: '🎤', label: 'Scena (Stage)',
    description: 'Kanał sceniczny na eventy i Q&A',
    channels: [ch('stage', '🎤', L('Scena', 'Stage'),
      L('Wydarzenia na żywo, Q&A i prezentacje.', 'Live events, Q&A and talks.'),
      { cat: 'voice', kind: 'stage' })],
  },
  afk: {
    group: 'C', emoji: '💤', label: 'Kanał AFK',
    description: 'Discord przeniesie tu nieaktywne osoby',
    channels: [ch('afk', '💤', L('AFK', 'AFK'), null, { cat: 'voice', kind: 'voice', profile: 'afk' })],
  },
  vip: {
    group: 'C', emoji: '💎', label: 'Strefa VIP',
    description: 'Prywatne kanały dla VIP, partnerów i boosterów',
    channels: [
      ch('vipChat', '💎', L('vip-czat', 'vip-chat'),
        L('Ekskluzywny czat dla VIP-ów, partnerów i boosterów.', 'Exclusive chat for VIPs, partners and boosters.'),
        { cat: 'vip' }),
      ch('vipVoice', '💎', L('VIP Lounge', 'VIP Lounge'), null, { cat: 'vip', kind: 'voice' }),
    ],
  },
  staff: {
    group: 'C', emoji: '🛡️', label: 'Strefa administracji',
    description: 'Prywatne kanały ekipy + przewodnik dla ekipy',
    channels: [
      ch('staffNews', '📣', L('ogłoszenia-ekipy', 'staff-announcements'),
        L('Ogłoszenia dla ekipy. Tu trafiają też komunikaty Discorda dla społeczności.', 'Staff announcements and Discord community updates.'),
        { cat: 'staff', profile: 'adminPost' }),
      ch('staffChat', '💬', L('czat-ekipy', 'staff-chat'),
        L('Rozmowy ekipy. Wszystko, co tu piszemy, zostaje w ekipie.', 'Staff chat. What is said here stays here.'),
        { cat: 'staff', post: 'staffGuide' }),
      ch('staffCmds', '⌨️', L('komendy-ekipy', 'staff-commands'),
        L('Komendy moderacyjne botów.', 'Moderation bot commands.'), { cat: 'staff' }),
      ch('staffReports', '🚨', L('raporty', 'reports'),
        L('Raporty z interwencji, notatki o użytkownikach i dowody.', 'Incident reports, user notes and evidence.'), { cat: 'staff' }),
      ch('management', '🔒', L('zarząd', 'management'),
        L('Kanał wyłącznie dla zarządu serwera.', 'Management only.'), { cat: 'staff', profile: 'admin' }),
      ch('staffVoice', '🛡️', L('Narada ekipy', 'Staff meeting'), null, { cat: 'staff', kind: 'voice' }),
    ],
  },
  logs: {
    group: 'C', emoji: '📁', label: 'Logi',
    description: 'Kanały na logi (AutoMod, moderacja, wiadomości…)',
    channels: [
      ch('logAutomod', '🤖', L('logi-automod', 'automod-logs'), L('Alerty systemu AutoMod.', 'AutoMod alerts.'), { cat: 'logs' }),
      ch('logMod', '🔨', L('logi-moderacji', 'mod-logs'), L('Bany, wyrzucenia, wyciszenia i ostrzeżenia.', 'Bans, kicks, timeouts and warnings.'), { cat: 'logs' }),
      ch('logMessages', '✉️', L('logi-wiadomości', 'message-logs'), L('Usunięte i edytowane wiadomości.', 'Deleted and edited messages.'), { cat: 'logs', minSize: 'medium' }),
      ch('logMembers', '👤', L('logi-członków', 'member-logs'), L('Dołączenia, wyjścia i zmiany profili.', 'Joins, leaves and profile changes.'), { cat: 'logs', minSize: 'medium' }),
      ch('logServer', '⚙️', L('logi-serwera', 'server-logs'), L('Zmiany kanałów, ról i ustawień.', 'Channel, role and settings changes.'), { cat: 'logs' }),
      ch('logVoice', '🔊', L('logi-głosowe', 'voice-logs'), L('Aktywność na kanałach głosowych.', 'Voice channel activity.'), { cat: 'logs', minSize: 'large' }),
    ],
  },
  archive: {
    group: 'C', emoji: '🗄️', label: 'Archiwum',
    description: 'Kategoria na stare kanały (tylko do odczytu)',
    channels: [ch('archive', '🗄️', L('archiwum', 'archive'),
      L('Zarchiwizowane kanały i treści (tylko do odczytu).', 'Archived channels and content (read-only).'),
      { cat: 'archive' })],
  },
};

const MODULE_GROUPS = {
  A: { label: 'Informacje i ogłoszenia', emoji: '📌' },
  B: { label: 'Społeczność', emoji: '💬' },
  C: { label: 'Głosowe i administracja', emoji: '🛡️' },
};

const SIZE_ORDER = ['small', 'medium', 'large', 'huge'];

module.exports = { CATEGORIES, CATEGORY_ORDER, MODULES, MODULE_GROUPS, SIZE_ORDER, ch };
