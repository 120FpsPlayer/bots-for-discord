'use strict';

const { L } = require('../utils/i18n');
const { ch } = require('./modules');

/**
 * Presety typów serwerów. Każdy preset ustala domyślne odpowiedzi w kreatorze
 * (moduły, role, kanały specjalne, listę elementów itd.). Użytkownik może
 * wszystko zmienić w kolejnych krokach – preset to tylko mądry punkt startowy.
 *
 * Pola:
 *  memberName       – nazwa podstawowej roli członka (np. „Gracz”, „Uczeń”),
 *  special          – kategoria charakterystyczna dla typu serwera,
 *  modules          – domyślne moduły dla serwera średniej wielkości,
 *  never            – moduły, których rozmiar serwera nie dodaje automatycznie,
 *  staffExtras      – dodatkowe role ekipy typowe dla danego typu,
 *  specials         – dodatkowe role specjalne społeczności,
 *  roleDefaults     – { add, remove } względem domyślnych grup ról,
 *  list             – pytanie o listę (gry / przedmioty / działy…) – każdy element dostaje kanały i rolę,
 *  extras           – dodatkowe kanały do wyboru,
 *  infoFields       – dodatkowe pytania (IP serwera, linki…) używane w wiadomościach,
 *  cards            – karty informacyjne publikowane w kanałach (post: 'card:<klucz>'),
 *  rules            – dodatkowy paragraf regulaminu.
 */

const BASE_MODULES = [
  'verification', 'rules', 'info', 'roleinfo', 'welcome', 'announcements', 'events', 'giveaways',
  'general', 'media', 'memes', 'offtopic', 'botcmds', 'suggestions',
  'voice', 'afk', 'staff', 'logs',
];

const SERVER_TYPES = {
  gaming: {
    label: 'Społeczność graczy', emoji: '🎮',
    description: 'Serwer dla graczy: kanały i role dla każdej gry, LFG, klipy',
    memberName: L('Gracz', 'Gamer'), memberEmoji: '🎮',
    special: { name: L('Granie', 'Gaming'), emoji: '🕹️' },
    modules: [...BASE_MODULES, 'music', 'introductions'],
    roleDefaults: { add: ['platform'] },
    voiceLobby: { name: L('Granie', 'Gaming'), emoji: '🎮' },
    list: {
      title: 'Gry', question: 'Jakie gry mają mieć swoje kanały i role?',
      placeholder: 'Minecraft, Fortnite, CS2, Valorant, League of Legends',
      defaults: ['Minecraft', 'Fortnite', 'CS2', 'Valorant', 'League of Legends'],
      emoji: '🎮', roleEmoji: '🎮', category: L('Gry', 'Games'), categoryEmoji: '🎮',
      topic: L('Wszystko o {item}: rozmowy, taktyki i szukanie drużyny.', 'All about {item}: chat, tactics and finding a team.'),
      extra: { suffix: L('klipy', 'clips'), emoji: '🎬', label: 'Kanał na klipy z gry', topic: L('Najlepsze klipy i screeny z {item}.', 'Best clips and screenshots from {item}.') },
      voice: { prefix: null, emoji: '🎮' },
      options: ['text', 'voice', 'role'], layout: 'shared', roleMentionable: true,
    },
    extras: [
      ch('lfg', '🔍', L('szukam-graczy', 'looking-for-group'), L('Szukasz drużyny? Napisz grę, rangę i godzinę. Pinguj rolę gry.', 'Looking for a team? Post game, rank and time. Ping the game role.'), { default: true, slowmode: 60 }),
      ch('clips', '🎬', L('klipy', 'clips'), L('Twoje najlepsze akcje i momenty z gier.', 'Your best plays and moments.'), { default: true, profile: 'media' }),
      ch('achievements', '🏆', L('osiągnięcia', 'achievements'), L('Pochwal się rangą, wygraną lub osiągnięciem!', 'Show off your rank, wins and achievements!'), { default: false }),
      ch('tournaments', '⚔️', L('turnieje', 'tournaments'), L('Turnieje organizowane przez serwer.', 'Server tournaments.'), { default: false, profile: 'readonly', posters: ['eventmgr'] }),
      ch('freeGames', '🆓', L('darmowe-gry', 'free-games'), L('Darmowe gry i promocje (Epic, Steam, GOG).', 'Free games and deals (Epic, Steam, GOG).'), { default: true, profile: 'readonly' }),
      ch('gamingNews', '📰', L('newsy-gamingowe', 'gaming-news'), L('Newsy ze świata gier.', 'Gaming news.'), { default: false, profile: 'readonly' }),
    ],
    rules: {
      title: L('Zasady graczy', 'Gaming rules'),
      items: {
        pl: ['Zakaz promowania i udostępniania cheatów, exploitów oraz handlu kontami.', 'Szanuj innych graczy niezależnie od ich umiejętności i rangi.', 'Na kanałach LFG podawaj grę, tryb i godzinę – bez spamowania pingami.'],
        en: ['No cheats, exploits or account trading.', 'Respect other players regardless of skill or rank.', 'In LFG channels state game, mode and time – do not spam pings.'],
      },
    },
  },

  minecraft: {
    label: 'Serwer Minecraft', emoji: '⛏️',
    description: 'Discord do serwera MC: IP, status, tryby, apelacje, sklep',
    memberName: L('Gracz', 'Player'), memberEmoji: '⛏️',
    special: { name: L('Serwer', 'Server'), emoji: '⛏️' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES, 'changelog', 'polls'],
    staffExtras: [
      { key: 'builder', name: L('Budowniczy', 'Builder'), emoji: '🧱', level: 'none', color: 'staffExtra', description: 'Buduje mapy i lobby', default: true },
      { key: 'chatmod', name: L('ChatMod', 'ChatMod'), emoji: '💬', level: 'trial', color: 'trial', description: 'Pilnuje czatu w grze', default: false },
    ],
    specials: [
      { key: 'donator', name: L('Donator', 'Donator'), emoji: '💰', color: 'special', hoist: true, description: 'Wspierający serwer', default: true },
    ],
    voiceLobby: { name: L('Rozmowy', 'Lounge'), emoji: '🔊' },
    list: {
      title: 'Tryby gry', question: 'Jakie tryby gry ma Twój serwer?',
      placeholder: 'Survival, SkyBlock, BoxPvP, Creative',
      defaults: ['Survival', 'SkyBlock', 'BoxPvP'],
      emoji: '🌍', roleEmoji: '⛏️', category: L('Tryby gry', 'Game modes'), categoryEmoji: '🌍',
      topic: L('Czat trybu {item}: pytania, handel, ogłoszenia trybu.', '{item} mode chat: questions, trading, news.'),
      extra: { suffix: L('handel', 'trading'), emoji: '💱', label: 'Kanał handlu dla trybu', topic: L('Handel na trybie {item}.', '{item} trading.') },
      voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('mcIp', '🌐', L('ip-serwera', 'server-ip'), L('Jak dołączyć do serwera: IP, wersja, strona.', 'How to join: IP, version, website.'), { default: true, profile: 'readonly', post: 'card:mcJoin' }),
      ch('mcStatus', '🟢', L('status-serwera', 'server-status'), L('Status serwera, przerwy techniczne i awarie.', 'Server status, maintenance and outages.'), { default: true, profile: 'readonly' }),
      ch('mcStore', '🛒', L('sklep-serwera', 'server-store'), L('Rangi, klucze i pakiety – wspierasz rozwój serwera.', 'Ranks, keys and packages – support the server.'), { default: true, profile: 'readonly', post: 'card:mcStore' }),
      ch('mcReports', '🚩', L('zgłoszenia-graczy', 'player-reports'), L('Zgłoś gracza: nick, powód, dowody (screen/film).', 'Report a player: nick, reason, evidence.'), { default: true, kind: 'forum', tags: [{ name: L('Nowe', 'New'), emoji: '🆕' }, { name: L('Rozpatrzone', 'Resolved'), emoji: '✅', moderated: true }, { name: L('Odrzucone', 'Rejected'), emoji: '❌', moderated: true }] }),
      ch('mcAppeals', '⚖️', L('apelacje', 'appeals'), L('Odwołania od banów i mute. Podaj nick, datę i powód kary.', 'Ban/mute appeals. Provide nick, date and reason.'), { default: true, kind: 'forum', tags: [{ name: L('Oczekuje', 'Pending'), emoji: '⏳' }, { name: L('Przyjęta', 'Accepted'), emoji: '✅', moderated: true }, { name: L('Odrzucona', 'Rejected'), emoji: '❌', moderated: true }] }),
      ch('mcBugs', '🐛', L('błędy', 'bug-reports'), L('Zgłaszaj błędy i bugi na serwerze.', 'Report bugs on the server.'), { default: true, kind: 'forum', tags: [{ name: L('Bug', 'Bug'), emoji: '🐛' }, { name: L('Naprawiony', 'Fixed'), emoji: '✅', moderated: true }] }),
      ch('mcRecruitment', '📝', L('rekrutacja', 'staff-applications'), L('Rekrutacja do ekipy – wymagania i formularz.', 'Staff applications – requirements and form.'), { default: true, profile: 'readonly', post: 'card:recruitment' }),
      ch('mcBuilds', '🏰', L('budowle', 'builds'), L('Pochwal się swoimi budowlami!', 'Show off your builds!'), { default: true, cat: 'community', profile: 'media' }),
    ],
    infoFields: [
      { key: 'ip', label: 'IP serwera', placeholder: 'play.mojserwer.pl', max: 100 },
      { key: 'version', label: 'Wersja Minecraft', placeholder: '1.8 – 1.21', max: 60 },
      { key: 'website', label: 'Strona / sklep (link)', placeholder: 'https://mojserwer.pl', max: 200 },
    ],
    cards: {
      mcJoin: {
        needs: 'ip',
        title: L('🌐 Jak dołączyć do serwera?', '🌐 How to join the server?'),
        description: L('Uruchom Minecraft → **Tryb wieloosobowy** → **Dodaj serwer** i wpisz adres poniżej.', 'Launch Minecraft → **Multiplayer** → **Add server** and enter the address below.'),
        fields: [
          { name: L('📡 Adres IP', '📡 Server IP'), value: '```{ip}```', needs: 'ip' },
          { name: L('🧩 Wersja', '🧩 Version'), value: '{version}', needs: 'version', inline: true },
          { name: L('🌍 Strona', '🌍 Website'), value: '{website}', needs: 'website', inline: true },
        ],
      },
      mcStore: {
        needs: 'website',
        title: L('🛒 Sklep serwera', '🛒 Server store'),
        description: L('Zakup rangi lub pakietu wspiera utrzymanie i rozwój serwera. Wszystkie płatności są dobrowolne.', 'Buying a rank supports the server. All payments are voluntary.'),
        fields: [{ name: L('🔗 Sklep', '🔗 Store'), value: '{website}', needs: 'website' }],
      },
      recruitment: {
        title: L('📝 Rekrutacja do ekipy', '📝 Staff applications'),
        description: L('Chcesz dołączyć do ekipy? Sprawdź wymagania i wyślij podanie do administracji.', 'Want to join the staff? Check the requirements and send your application to the staff.'),
        fields: [
          { name: L('✅ Wymagania', '✅ Requirements'), value: L('• ukończone 15 lat\n• czysta historia kar\n• aktywność min. 2h dziennie\n• kultura osobista i cierpliwość', '• 15+ years old\n• clean punishment history\n• 2h+ daily activity\n• patience and good manners') },
          { name: L('📄 Podanie powinno zawierać', '📄 Your application should include'), value: L('Nick, wiek, doświadczenie, dlaczego Ty, ile czasu możesz poświęcić.', 'Nick, age, experience, why you, available time.') },
        ],
      },
    },
    rules: {
      title: L('Zasady gry na serwerze', 'In-game rules'),
      items: {
        pl: ['Zakaz używania cheatów, X-raya, makr i modyfikacji dających przewagę.', 'Zakaz wykorzystywania bugów – zgłaszaj je na kanale błędów.', 'Zakaz griefingu, kradzieży i oszustw w handlu.', 'Zakaz reklamowania innych serwerów Minecraft.'],
        en: ['No cheats, X-ray, macros or unfair mods.', 'No bug abuse – report bugs in the bug channel.', 'No griefing, stealing or trade scams.', 'No advertising other Minecraft servers.'],
      },
    },
  },

  fivem: {
    label: 'Serwer RP (FiveM / GTA)', emoji: '🚓',
    description: 'Roleplay GTA: whitelist, frakcje, skargi, IC/OOC',
    memberName: L('Obywatel', 'Citizen'), memberEmoji: '🪪',
    special: { name: L('Serwer RP', 'RP Server'), emoji: '🌆' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES, 'changelog'],
    staffExtras: [
      { key: 'wlchecker', name: L('Sprawdzający WL', 'Whitelist Checker'), emoji: '📋', level: 'helper', color: 'staffExtra', description: 'Rozpatruje podania o whitelistę', default: true },
      { key: 'factionAdmin', name: L('Opiekun frakcji', 'Faction Manager'), emoji: '🏛️', level: 'none', color: 'func', description: 'Opiekuje się frakcjami', default: true },
    ],
    specials: [
      { key: 'whitelisted', name: L('Whitelist', 'Whitelisted'), emoji: '✅', color: 'special', hoist: false, description: 'Osoby z zaakceptowaną whitelistą', default: true },
    ],
    voiceLobby: { name: L('Poczekalnia', 'Lobby'), emoji: '🎙️' },
    list: {
      title: 'Frakcje', question: 'Jakie frakcje / organizacje są na serwerze?',
      placeholder: 'LSPD, EMS, Mechanik, DOJ, Taxi',
      defaults: ['LSPD', 'EMS', 'Mechanik'],
      emoji: '🏛️', roleEmoji: '🏛️', category: L('Frakcje', 'Factions'), categoryEmoji: '🏛️',
      topic: L('Kanał frakcji {item} – widoczny tylko dla członków frakcji.', '{item} faction channel – members only.'),
      extra: { suffix: L('ogłoszenia', 'news'), emoji: '📢', label: 'Kanał ogłoszeń frakcji', topic: L('Ogłoszenia frakcji {item}.', '{item} announcements.') },
      voice: { prefix: null, emoji: '📻' },
      options: ['text', 'voice', 'role', 'private'], layout: 'shared', roleMentionable: false, roleColor: 'access',
    },
    extras: [
      ch('rpJoin', '🎮', L('jak-dołączyć', 'how-to-join'), L('Jak dołączyć do serwera i przejść whitelistę.', 'How to join and pass the whitelist.'), { default: true, profile: 'readonly', post: 'card:fivemJoin' }),
      ch('rpWhitelist', '📋', L('whitelista', 'whitelist'), L('Podania o whitelistę – wzór w przypiętej wiadomości.', 'Whitelist applications – template pinned.'), { default: true, kind: 'forum', tags: [{ name: L('Oczekuje', 'Pending'), emoji: '⏳' }, { name: L('Zaakceptowane', 'Accepted'), emoji: '✅', moderated: true }, { name: L('Odrzucone', 'Rejected'), emoji: '❌', moderated: true }] }),
      ch('rpComplaints', '⚖️', L('skargi', 'complaints'), L('Skargi na graczy: nick, data, godzina, opis, nagranie.', 'Player complaints: name, date, time, description, video.'), { default: true, kind: 'forum', tags: [{ name: L('Nowa', 'New'), emoji: '🆕' }, { name: L('Rozpatrzona', 'Resolved'), emoji: '✅', moderated: true }] }),
      ch('rpAppeals', '🔓', L('odwołania', 'appeals'), L('Odwołania od kar.', 'Punishment appeals.'), { default: true, kind: 'forum' }),
      ch('rpIcNews', '📰', L('ogłoszenia-ic', 'ic-news'), L('Ogłoszenia fabularne (In Character).', 'In-character news.'), { default: true, profile: 'readonly', posters: ['factionAdmin'] }),
      ch('rpTwitter', '🐦', L('twitter-ic', 'ic-social'), L('Media społecznościowe w świecie gry (IC).', 'In-character social media.'), { default: true, cat: 'community' }),
      ch('rpOoc', '🗨️', L('czat-ooc', 'ooc-chat'), L('Rozmowy poza postacią (Out Of Character).', 'Out-of-character chat.'), { default: false, cat: 'community' }),
      ch('rpDonate', '💰', L('wsparcie', 'donations'), L('Wsparcie serwera i pakiety.', 'Support the server.'), { default: false, profile: 'readonly' }),
      ch('rpBugs', '🐛', L('błędy', 'bug-reports'), L('Zgłaszanie błędów serwera.', 'Server bug reports.'), { default: true, kind: 'forum' }),
    ],
    infoFields: [
      { key: 'connect', label: 'Adres serwera (connect)', placeholder: 'connect cfx.re/join/abc123', max: 150 },
      { key: 'website', label: 'Strona / forum (link)', placeholder: 'https://mojrp.pl', max: 200 },
      { key: 'wlinfo', label: 'Jak zdobyć whitelistę?', placeholder: 'Napisz podanie na kanale whitelista i poczekaj na rozmowę.', max: 400, paragraph: true },
    ],
    cards: {
      fivemJoin: {
        needs: 'connect',
        title: L('🎮 Jak dołączyć do serwera?', '🎮 How to join?'),
        description: L('1. Uruchom **FiveM**\n2. Naciśnij **F8**\n3. Wpisz komendę poniżej i naciśnij Enter', '1. Launch **FiveM**\n2. Press **F8**\n3. Type the command below and press Enter'),
        fields: [
          { name: L('🔌 Połączenie', '🔌 Connect'), value: '```{connect}```', needs: 'connect' },
          { name: L('📋 Whitelista', '📋 Whitelist'), value: '{wlinfo}', needs: 'wlinfo' },
          { name: L('🌍 Strona / forum', '🌍 Website / forum'), value: '{website}', needs: 'website' },
        ],
      },
    },
    rules: {
      title: L('Zasady Roleplay', 'Roleplay rules'),
      items: {
        pl: ['Zakaz metagamingu (wykorzystywania informacji OOC w IC) i powergamingu.', 'Zakaz RDM i VDM – każda akcja musi mieć fabularne uzasadnienie.', 'Obowiązuje FearRP i wartość życia postaci.', 'Oddzielaj IC od OOC – czat OOC tylko w wyznaczonych miejscach.', 'Zakaz używania cheatów, mod menu i exploitów.'],
        en: ['No metagaming or powergaming.', 'No RDM or VDM – every action needs an RP reason.', 'FearRP and value of life apply.', 'Keep IC and OOC separate.', 'No cheats, mod menus or exploits.'],
      },
    },
  },

  esport: {
    label: 'E-sport / Klan / Drużyna', emoji: '🏆',
    description: 'Składy, treningi, wyniki meczów, rekrutacja',
    memberName: L('Fan', 'Fan'), memberEmoji: '📣',
    special: { name: L('Drużyna', 'Team'), emoji: '🏆' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES, 'partnerships'],
    staffExtras: [
      { key: 'manager', name: L('Manager drużyny', 'Team Manager'), emoji: '📋', level: 'mod', color: 'management', description: 'Zarządza składami i terminami', default: true },
      { key: 'coach', name: L('Trener', 'Coach'), emoji: '🎯', level: 'none', color: 'staffExtra', description: 'Prowadzi treningi', default: true },
      { key: 'captain', name: L('Kapitan', 'Captain'), emoji: '🧢', level: 'none', color: 'func', description: 'Lider składu', default: true },
    ],
    specials: [
      { key: 'player', name: L('Zawodnik', 'Player'), emoji: '🎮', color: 'special', hoist: true, description: 'Zawodnik jednego ze składów', default: true },
      { key: 'sponsor', name: L('Sponsor', 'Sponsor'), emoji: '💼', color: 'partner', hoist: true, description: 'Sponsorzy drużyny', default: false },
    ],
    voiceLobby: { name: L('Rozmowy', 'Lounge'), emoji: '🔊' },
    list: {
      title: 'Składy', question: 'Jakie składy / drużyny macie?',
      placeholder: 'Skład Główny, Akademia, Skład Kobiecy',
      defaults: ['Skład Główny', 'Akademia'],
      emoji: '🛡️', roleEmoji: '🛡️', category: L('Składy', 'Rosters'), categoryEmoji: '🛡️',
      topic: L('Kanał składu {item}: taktyki, ustalenia, analiza meczów.', '{item} roster: tactics, planning, match reviews.'),
      extra: { suffix: L('strategia', 'strategy'), emoji: '🧠', label: 'Kanał strategii', topic: L('Strategie i analiza demek składu {item}.', '{item} strategy and demo reviews.') },
      voice: { prefix: L('Trening', 'Practice'), emoji: '🎯' },
      options: ['text', 'extra', 'voice', 'role', 'private'], layout: 'separate', roleMentionable: false, roleColor: 'access',
    },
    extras: [
      ch('results', '📊', L('wyniki', 'results'), L('Wyniki meczów i turniejów.', 'Match and tournament results.'), { default: true, profile: 'readonly' }),
      ch('schedule', '🗓️', L('harmonogram', 'schedule'), L('Nadchodzące mecze, treningi i scrimy.', 'Upcoming matches, practices and scrims.'), { default: true, profile: 'readonly', posters: ['manager'] }),
      ch('recruitment', '📝', L('rekrutacja', 'recruitment'), L('Rekrutacja do składów – wymagania i podania.', 'Tryouts – requirements and applications.'), { default: true, kind: 'forum' }),
      ch('highlights', '🎬', L('highlighty', 'highlights'), L('Najlepsze akcje naszych zawodników.', 'Best plays of our players.'), { default: true, cat: 'community', profile: 'media' }),
      ch('sponsors', '💼', L('sponsorzy', 'sponsors'), L('Nasi sponsorzy i partnerzy.', 'Our sponsors and partners.'), { default: false, profile: 'readonly' }),
      ch('scrims', '⚔️', L('scrimy', 'scrims'), L('Szukanie scrimów z innymi drużynami.', 'Looking for scrims with other teams.'), { default: false, cat: 'community' }),
    ],
    infoFields: [
      { key: 'game', label: 'Główna gra / dyscyplina', placeholder: 'CS2', max: 80 },
      { key: 'socials', label: 'Social media drużyny (linki)', placeholder: 'https://x.com/druzyna, https://twitch.tv/druzyna', max: 400, paragraph: true },
    ],
    rules: {
      title: L('Zasady drużyny', 'Team rules'),
      items: {
        pl: ['Zawodnicy są zobowiązani do obecności na treningach lub wcześniejszego zgłoszenia nieobecności.', 'Taktyki i ustalenia składów są poufne – zakaz ich udostępniania.', 'Szanujemy przeciwników – zakaz toksyczności przed, w trakcie i po meczu.'],
        en: ['Players must attend practices or report absence in advance.', 'Team tactics are confidential.', 'Respect opponents before, during and after matches.'],
      },
    },
  },

  programming: {
    label: 'Programowanie / IT', emoji: '💻',
    description: 'Pomoc w kodzie, języki programowania, projekty, praca',
    memberName: L('Programista', 'Developer'), memberEmoji: '💻',
    special: { name: L('Programowanie', 'Development'), emoji: '💻' },
    modules: [...BASE_MODULES.filter((m) => m !== 'memes'), 'introductions', 'faq'],
    staffExtras: [
      { key: 'mentor', name: L('Mentor', 'Mentor'), emoji: '🎓', level: 'helper', color: 'staffExtra', description: 'Pomaga początkującym', default: true },
    ],
    specials: [
      { key: 'expert', name: L('Ekspert', 'Expert'), emoji: '🧠', color: 'special', hoist: true, description: 'Wyróżnieni specjaliści', default: true },
    ],
    roleDefaults: { remove: ['colors'] },
    voiceLobby: { name: L('Kodowanie', 'Coding'), emoji: '⌨️' },
    list: {
      title: 'Technologie', question: 'Jakie języki / technologie mają mieć swoje kanały?',
      placeholder: 'JavaScript, Python, Java, C#, C++, Rust, Go, PHP',
      defaults: ['JavaScript', 'Python', 'Java', 'C#', 'C++'],
      emoji: '📘', roleEmoji: '💻', category: L('Technologie', 'Technologies'), categoryEmoji: '🧩',
      topic: L('Pytania i dyskusje o {item}. Wklejaj kod w bloki ```.', 'Questions and discussions about {item}. Use ``` code blocks.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: true,
    },
    extras: [
      ch('help', '🆘', L('pomoc', 'help'), L('Zadaj pytanie: opisz problem, wklej kod i błąd. Oznacz rozwiązane tagiem.', 'Ask: describe the issue, paste code and error. Tag solved posts.'), { default: true, kind: 'forum', tags: 'listItems', reaction: '✅' }),
      ch('showcase', '🚀', L('projekty', 'showcase'), L('Pochwal się swoim projektem! Link + krótki opis.', 'Show off your project! Link + short description.'), { default: true }),
      ch('codeReview', '🔍', L('code-review', 'code-review'), L('Poproś o review swojego kodu.', 'Ask for a code review.'), { default: true, kind: 'forum' }),
      ch('resources', '📚', L('zasoby', 'resources'), L('Kursy, książki, dokumentacje i narzędzia.', 'Courses, books, docs and tools.'), { default: true }),
      ch('jobs', '💼', L('oferty-pracy', 'jobs'), L('Oferty pracy i zlecenia (format: stanowisko, stawka, kontakt).', 'Job offers (role, rate, contact).'), { default: true, slowmode: 3600 }),
      ch('techNews', '📰', L('nowości-tech', 'tech-news'), L('Nowości ze świata technologii.', 'Tech news.'), { default: false, profile: 'readonly' }),
      ch('pairVoice', '👥', L('Pair programming', 'Pair programming'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    rules: {
      title: L('Zasady pomocy', 'Help etiquette'),
      items: {
        pl: ['Zadając pytanie, opisz problem, dołącz kod (w blokach ```) i pełny komunikat błędu.', 'Nie pytaj „czy ktoś zna X?” – od razu zadaj konkretne pytanie.', 'Zakaz udostępniania złośliwego oprogramowania, crackowania i pomocy w nielegalnych działaniach.', 'Nie oznaczaj osób, które nie brały udziału w rozmowie.'],
        en: ['When asking, describe the issue, include code (``` blocks) and the full error.', 'Don\'t ask to ask – ask your question directly.', 'No malware, cracking or help with illegal activity.', 'Don\'t ping people who are not in the conversation.'],
      },
    },
  },

  school: {
    label: 'Nauka / Szkoła / Klasa', emoji: '📚',
    description: 'Przedmioty, zadania domowe, materiały, sprawdziany',
    memberName: L('Uczeń', 'Student'), memberEmoji: '🎒',
    special: { name: L('Nauka', 'Learning'), emoji: '📚' }, specialPosition: 'afterNews',
    modules: ['rules', 'info', 'roleinfo', 'welcome', 'announcements', 'events', 'general', 'media', 'memes', 'offtopic', 'botcmds', 'voice', 'afk', 'staff', 'logs'],
    staffExtras: [
      { key: 'teacher', name: L('Nauczyciel', 'Teacher'), emoji: '🍎', level: 'mod', color: 'management', description: 'Prowadzi zajęcia i moderuje', default: true },
      { key: 'president', name: L('Przewodniczący', 'Class President'), emoji: '🎖️', level: 'none', color: 'func', description: 'Przedstawiciel uczniów', default: true },
      { key: 'tutor', name: L('Korepetytor', 'Tutor'), emoji: '📐', level: 'none', color: 'staffExtra', description: 'Pomaga w nauce', default: false },
    ],
    roleDefaults: { remove: ['levels'] },
    voiceLobby: { name: L('Nauka razem', 'Study together'), emoji: '📖' },
    list: {
      title: 'Przedmioty', question: 'Jakie przedmioty mają mieć swoje kanały?',
      placeholder: 'Matematyka, Polski, Angielski, Fizyka, Chemia, Biologia, Historia',
      defaults: ['Matematyka', 'Polski', 'Angielski', 'Fizyka', 'Chemia', 'Biologia', 'Historia', 'Informatyka'],
      emoji: '📘', roleEmoji: '📘', category: L('Przedmioty', 'Subjects'), categoryEmoji: '📘',
      topic: L('{item}: pytania, notatki, zadania i pomoc.', '{item}: questions, notes, homework and help.'),
      extra: { suffix: L('materiały', 'materials'), emoji: '📎', label: 'Kanał materiałów', topic: L('Notatki i materiały z przedmiotu {item}.', '{item} notes and materials.') },
      voice: null,
      options: ['text'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('timetable', '🗓️', L('plan-lekcji', 'timetable'), L('Aktualny plan lekcji i zmiany w planie.', 'Current timetable and changes.'), { default: true, profile: 'readonly' }),
      ch('homework', '✏️', L('zadania-domowe', 'homework'), L('Zadania domowe – termin, przedmiot, treść.', 'Homework – due date, subject, task.'), { default: true }),
      ch('exams', '📝', L('sprawdziany', 'exams'), L('Terminy sprawdzianów i kartkówek.', 'Test and quiz dates.'), { default: true, profile: 'readonly', posters: ['teacher', 'president'] }),
      ch('materials', '📂', L('materiały', 'materials'), L('Notatki, prezentacje i pomoce naukowe.', 'Notes, slides and study aids.'), { default: true }),
      ch('questions', '❓', L('pytania', 'questions'), L('Nie wiesz jak zrobić zadanie? Zapytaj!', 'Stuck on a task? Ask!'), { default: true, kind: 'forum', tags: 'listItems' }),
      ch('quietStudy', '🤫', L('Cicha nauka', 'Silent study'), null, { default: true, kind: 'voice', cat: 'voice', profile: 'quiet' }),
    ],
    infoFields: [
      { key: 'school', label: 'Szkoła / klasa', placeholder: 'LO nr 1 w Krakowie, klasa 3B', max: 100 },
    ],
    rules: {
      title: L('Zasady nauki', 'Study rules'),
      items: {
        pl: ['Pomagamy sobie nawzajem – tłumacz, zamiast tylko dawać gotowe odpowiedzi.', 'Zakaz udostępniania treści sprawdzianów przed ich napisaniem.', 'Materiały udostępniaj z poszanowaniem praw autorskich.'],
        en: ['Help each other – explain rather than just give answers.', 'Do not share test contents before the test.', 'Respect copyright when sharing materials.'],
      },
    },
  },

  business: {
    label: 'Firma / Zespół / Biznes', emoji: '💼',
    description: 'Działy z prywatnymi kanałami, projekty, spotkania',
    memberName: L('Pracownik', 'Employee'), memberEmoji: '👔',
    special: { name: L('Firma', 'Company'), emoji: '🏢' }, specialPosition: 'afterNews',
    modules: ['rules', 'info', 'welcome', 'announcements', 'events', 'general', 'offtopic', 'botcmds', 'suggestions', 'voice', 'afk', 'staff', 'logs'],
    never: ['memes', 'counting', 'giveaways', 'qotd', 'partnerships', 'verification'],
    staffExtras: [
      { key: 'management', name: L('Zarząd', 'Management'), emoji: '🏛️', level: 'admin', color: 'management', description: 'Kadra zarządzająca', default: true },
      { key: 'teamlead', name: L('Kierownik', 'Team Lead'), emoji: '📋', level: 'mod', color: 'mod', description: 'Kierownicy zespołów', default: true },
      { key: 'hr', name: L('HR', 'HR'), emoji: '🤝', level: 'helper', color: 'helper', description: 'Dział kadr', default: true },
    ],
    specials: [
      { key: 'guest', name: L('Gość', 'Guest'), emoji: '🧳', color: 'special', hoist: true, description: 'Goście i klienci z ograniczonym dostępem', default: true },
      { key: 'intern', name: L('Stażysta', 'Intern'), emoji: '🎓', color: 'helper', hoist: false, description: 'Stażyści i praktykanci', default: false },
    ],
    staffDefaults: ['owner', 'admin'],
    roleDefaults: { remove: ['colors', 'levels', 'age', 'notifications'] },
    voiceLobby: { name: L('Sala konferencyjna', 'Conference room'), emoji: '📞' },
    list: {
      title: 'Działy', question: 'Jakie działy / zespoły są w firmie?',
      placeholder: 'Marketing, Sprzedaż, IT, HR, Obsługa klienta, Finanse',
      defaults: ['Marketing', 'Sprzedaż', 'IT', 'Obsługa klienta'],
      emoji: '🏢', roleEmoji: '🏢', category: L('Działy', 'Departments'), categoryEmoji: '🏢',
      topic: L('Kanał działu {item} – widoczny tylko dla członków działu.', '{item} department – members only.'),
      extra: { suffix: L('zadania', 'tasks'), emoji: '✅', label: 'Kanał zadań działu', topic: L('Zadania i postępy działu {item}.', '{item} tasks and progress.') },
      voice: { prefix: L('Spotkanie', 'Meeting'), emoji: '📞' },
      options: ['text', 'extra', 'voice', 'role', 'private'], layout: 'separate', roleMentionable: true, roleColor: 'access',
    },
    extras: [
      ch('projects', '📁', L('projekty', 'projects'), L('Jeden projekt = jeden post. Status oznaczaj tagami.', 'One project = one post. Use tags for status.'), { default: true, kind: 'forum', tags: [{ name: L('Planowany', 'Planned'), emoji: '🗓️' }, { name: L('W realizacji', 'In progress'), emoji: '🔧' }, { name: L('Zakończony', 'Done'), emoji: '✅' }] }),
      ch('calendar', '🗓️', L('kalendarz', 'calendar'), L('Spotkania, terminy i urlopy.', 'Meetings, deadlines and leave.'), { default: true, profile: 'readonly', posters: ['teamlead', 'hr'] }),
      ch('docs', '📄', L('dokumenty', 'documents'), L('Procedury, instrukcje i ważne dokumenty.', 'Procedures, guides and documents.'), { default: true, profile: 'readonly', posters: ['teamlead', 'hr'] }),
      ch('wins', '🏆', L('sukcesy', 'wins'), L('Dzielimy się sukcesami zespołu!', 'Share team wins!'), { default: true, cat: 'community' }),
      ch('ideas', '💡', L('pomysły', 'ideas'), L('Pomysły na usprawnienia.', 'Improvement ideas.'), { default: false, cat: 'community' }),
      ch('clients', '🧳', L('dla-gości', 'guests'), L('Kanał kontaktu z gośćmi i klientami.', 'Channel for guests and clients.'), { default: true, cat: 'community' }),
      ch('openSpace', '🪑', L('Open space', 'Open space'), null, { default: true, kind: 'voice', cat: 'voice' }),
      ch('focus', '🎧', L('Praca w skupieniu', 'Focus time'), null, { default: true, kind: 'voice', cat: 'voice', profile: 'quiet' }),
    ],
    infoFields: [
      { key: 'website', label: 'Strona firmy (link)', placeholder: 'https://firma.pl', max: 200 },
    ],
    rules: {
      title: L('Kodeks pracy zdalnej', 'Remote work code'),
      items: {
        pl: ['Informacje z kanałów działów i projektów są poufne.', 'Na wiadomości służbowe odpowiadamy w godzinach pracy.', 'Nieobecności i urlopy zgłaszamy z wyprzedzeniem na kanale kalendarza.', 'Komunikujemy się rzeczowo i z szacunkiem.'],
        en: ['Department and project information is confidential.', 'Work messages are answered during working hours.', 'Report absences in advance in the calendar channel.', 'Communicate clearly and respectfully.'],
      },
    },
  },

  creator: {
    label: 'Twórca / Streamer / YouTuber', emoji: '🎥',
    description: 'Powiadomienia o live i filmach, klipy, fanarty, subskrybenci',
    memberName: L('Widz', 'Viewer'), memberEmoji: '👀',
    special: { name: L('Twórca', 'Creator'), emoji: '🎥' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES, 'vip', 'introductions'],
    staffExtras: [
      { key: 'streammod', name: L('Moderator streamów', 'Stream Moderator'), emoji: '📺', level: 'trial', color: 'trial', description: 'Moderuje czat na streamach', default: true },
      { key: 'editor', name: L('Montażysta', 'Editor'), emoji: '✂️', level: 'none', color: 'staffExtra', description: 'Montuje filmy', default: true },
    ],
    specials: [
      { key: 'subscriber', name: L('Subskrybent', 'Subscriber'), emoji: '⭐', color: 'special', hoist: true, description: 'Subskrybenci / członkowie kanału', default: true },
    ],
    notifications: [
      { key: 'live', emoji: '🔴', name: L('Live', 'Live') },
      { key: 'videos', emoji: '🎬', name: L('Nowe filmy', 'New videos') },
    ],
    voiceLobby: { name: L('Pogaduchy', 'Hangout'), emoji: '🎙️' },
    list: {
      title: 'Platformy', question: 'Na jakich platformach tworzysz? (powstaną kanały powiadomień)',
      placeholder: 'YouTube, Twitch, TikTok, Kick, Instagram',
      defaults: ['YouTube', 'Twitch', 'TikTok'],
      emoji: '📡', roleEmoji: '🔔', category: L('Powiadomienia', 'Notifications'), categoryEmoji: '📡',
      topic: L('Powiadomienia o nowych treściach na {item}.', 'Notifications about new {item} content.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false, readonly: true,
    },
    extras: [
      ch('socials', '🔗', L('social-media', 'social-media'), L('Wszystkie moje kanały i profile.', 'All my channels and profiles.'), { default: true, profile: 'readonly', post: 'card:creatorLinks' }),
      ch('streamSchedule', '🗓️', L('harmonogram', 'schedule'), L('Plan streamów i premier.', 'Stream and premiere schedule.'), { default: true, profile: 'readonly' }),
      ch('clipsCreator', '🎬', L('klipy', 'clips'), L('Najlepsze momenty ze streamów.', 'Best stream moments.'), { default: true, cat: 'community', profile: 'media' }),
      ch('fanart', '🎨', L('fanarty', 'fanart'), L('Wasze fanarty – zawsze podpisuj autora!', 'Your fanart – always credit the artist!'), { default: true, cat: 'community', profile: 'media' }),
      ch('contentIdeas', '💡', L('pomysły-na-treści', 'content-ideas'), L('Zaproponuj temat filmu lub streama.', 'Suggest a video or stream idea.'), { default: true, kind: 'forum', reaction: '🔥' }),
      ch('subChat', '⭐', L('sub-czat', 'sub-chat'), L('Czat tylko dla subskrybentów.', 'Subscribers only chat.'), { default: true, cat: 'vip', access: ['subscriber'] }),
      ch('watchParty', '🍿', L('Oglądamy razem', 'Watch party'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    infoFields: [
      { key: 'links', label: 'Linki do kanałów (każdy w nowej linii)', placeholder: 'YouTube: https://youtube.com/@ja\nTwitch: https://twitch.tv/ja', max: 800, paragraph: true },
    ],
    cards: {
      creatorLinks: {
        title: L('🔗 Gdzie mnie znajdziesz?', '🔗 Where to find me?'),
        description: '{links}',
        needs: 'links',
      },
    },
    rules: {
      title: L('Zasady społeczności twórcy', 'Creator community rules'),
      items: {
        pl: ['Zakaz spoilerowania treści przed premierą.', 'Nie proś o wyróżnienia, suby i obserwacje w zamian za reklamę.', 'Fanarty i klipy publikuj z podaniem autora.'],
        en: ['No spoilers before premieres.', 'No sub4sub or follow-for-follow requests.', 'Always credit authors of fanart and clips.'],
      },
    },
  },

  music: {
    label: 'Muzyka / Artyści', emoji: '🎵',
    description: 'Gatunki, dzielenie się muzyką, współprace, feedback',
    memberName: L('Słuchacz', 'Listener'), memberEmoji: '🎧',
    special: { name: L('Tworzenie muzyki', 'Music making'), emoji: '🎹' },
    modules: [...BASE_MODULES, 'music'],
    specials: [
      { key: 'artist', name: L('Artysta', 'Artist'), emoji: '🎤', color: 'special', hoist: true, description: 'Tworzący muzykę', default: true },
      { key: 'producer', name: L('Producent', 'Producer'), emoji: '🎛️', color: 'partner', hoist: true, description: 'Producenci i realizatorzy', default: true },
    ],
    voiceLobby: { name: L('Słuchamy razem', 'Listening party'), emoji: '🎧' },
    list: {
      title: 'Gatunki', question: 'Jakie gatunki muzyczne mają mieć swoje kanały?',
      placeholder: 'Hip-Hop, Pop, Rock, Elektronika, Jazz, Metal',
      defaults: ['Hip-Hop', 'Pop', 'Rock', 'Elektronika'],
      emoji: '🎶', roleEmoji: '🎶', category: L('Gatunki', 'Genres'), categoryEmoji: '🎶',
      topic: L('Rozmowy i polecajki: {item}.', 'Talk and recommendations: {item}.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('shareMusic', '📀', L('twoja-muzyka', 'your-music'), L('Wrzuć swój utwór (1 post na 6 godzin).', 'Share your track (1 post per 6 hours).'), { default: true, slowmode: 21600 }),
      ch('feedback', '🗣️', L('feedback', 'feedback'), L('Poproś o szczerą opinię o swoim utworze.', 'Ask for honest feedback.'), { default: true, kind: 'forum' }),
      ch('collabs', '🤝', L('współprace', 'collabs'), L('Szukasz wokalisty, producenta lub beatu?', 'Looking for a vocalist, producer or beat?'), { default: true, kind: 'forum' }),
      ch('gear', '🎚️', L('sprzęt-i-soft', 'gear-and-software'), L('DAW-y, wtyczki, mikrofony, słuchawki.', 'DAWs, plugins, mics, headphones.'), { default: true }),
      ch('lyrics', '✍️', L('teksty', 'lyrics'), L('Twoje teksty i wiersze.', 'Your lyrics and poems.'), { default: false }),
      ch('jam', '🎸', L('Jam session', 'Jam session'), null, { default: true, kind: 'voice', cat: 'voice' }),
      ch('studio', '🎙️', L('Studio', 'Studio'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    rules: {
      title: L('Zasady muzyczne', 'Music rules'),
      items: {
        pl: ['Publikuj tylko własną muzykę lub z podaniem autora.', 'Feedback ma być konstruktywny – krytykuj utwór, nie osobę.', 'Zakaz spamowania linkami do swoich utworów poza wyznaczonym kanałem.'],
        en: ['Share only your own music or credit the author.', 'Keep feedback constructive.', 'No spamming your tracks outside the dedicated channel.'],
      },
    },
  },

  anime: {
    label: 'Anime / Manga', emoji: '🌸',
    description: 'Sezonowe anime, manga, polecajki, fanarty, cosplay',
    memberName: L('Otaku', 'Otaku'), memberEmoji: '🌸',
    special: { name: L('Anime i manga', 'Anime & manga'), emoji: '🌸' },
    modules: [...BASE_MODULES, 'introductions', 'qotd'],
    specials: [
      { key: 'artistA', name: L('Artysta', 'Artist'), emoji: '🎨', color: 'special', hoist: true, description: 'Rysownicy i cosplayerzy', default: true },
    ],
    voiceLobby: { name: L('Pogaduchy', 'Hangout'), emoji: '🍡' },
    list: {
      title: 'Tematy', question: 'Jakie tematy mają mieć osobne kanały?',
      placeholder: 'Anime, Manga, Light Novel, Gry gacha, Cosplay',
      defaults: ['Anime', 'Manga', 'Light Novel', 'Gry gacha'],
      emoji: '🍥', roleEmoji: '🍥', category: L('Tematy', 'Topics'), categoryEmoji: '🍥',
      topic: L('Dyskusje: {item}. Spoilery w ||spoilerach||!', 'Discussions: {item}. Use ||spoiler tags||!'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('seasonal', '📺', L('sezon-anime', 'seasonal-anime'), L('Co oglądamy w tym sezonie?', 'What are we watching this season?'), { default: true }),
      ch('recommendations', '⭐', L('polecajki', 'recommendations'), L('Polecenia anime i mangi – jeden tytuł = jeden post.', 'Recommendations – one title per post.'), { default: true, kind: 'forum', reaction: '❤️' }),
      ch('fanartA', '🎨', L('fanarty', 'fanart'), L('Fanarty – podpisuj autora!', 'Fanart – credit the artist!'), { default: true, cat: 'community', profile: 'media' }),
      ch('cosplay', '👘', L('cosplay', 'cosplay'), L('Wasze cosplaye i stroje.', 'Your cosplays.'), { default: true, cat: 'community', profile: 'media' }),
      ch('spoilers', '⚠️', L('spoilery', 'spoilers'), L('Tu wolno spoilerować – wchodzisz na własną odpowiedzialność.', 'Spoilers allowed – enter at your own risk.'), { default: true }),
      ch('watchPartyA', '🍿', L('Wspólne oglądanie', 'Watch party'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    rules: {
      title: L('Zasady fandomu', 'Fandom rules'),
      items: {
        pl: ['Spoilery tylko w ||znacznikach spoilera|| lub na kanale #spoilery.', 'Szanuj gusta innych – zakaz „gatekeepingu”.', 'Zakaz udostępniania pirackich linków do anime i mangi.'],
        en: ['Spoilers only in ||spoiler tags|| or the spoilers channel.', 'Respect others\' tastes – no gatekeeping.', 'No piracy links.'],
      },
    },
  },

  roleplay: {
    label: 'Roleplay tekstowy / Fantasy', emoji: '🎭',
    description: 'Lokacje, karty postaci, lore, sesje z Mistrzem Gry',
    memberName: L('Gracz', 'Player'), memberEmoji: '🎲',
    special: { name: L('Świat gry', 'Game world'), emoji: '📜' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES.filter((m) => m !== 'memes'), 'introductions'],
    staffExtras: [
      { key: 'gm', name: L('Mistrz Gry', 'Game Master'), emoji: '🎲', level: 'mod', color: 'management', description: 'Prowadzi fabułę i sesje', default: true },
      { key: 'lorekeeper', name: L('Kronikarz', 'Lorekeeper'), emoji: '📖', level: 'none', color: 'staffExtra', description: 'Dba o spójność lore', default: true },
    ],
    specials: [
      { key: 'approved', name: L('Postać zatwierdzona', 'Approved character'), emoji: '📜', color: 'special', hoist: false, description: 'Gracze z zatwierdzoną kartą postaci', default: true },
    ],
    voiceLobby: { name: L('Karczma', 'Tavern'), emoji: '🍺' },
    list: {
      title: 'Lokacje', question: 'Jakie lokacje ma Twój świat? (każda dostanie kanał)',
      placeholder: 'Karczma, Rynek, Zamek, Mroczny Las, Port',
      defaults: ['Karczma', 'Rynek', 'Zamek', 'Mroczny Las', 'Port'],
      emoji: '🗺️', roleEmoji: '🗺️', category: L('Lokacje', 'Locations'), categoryEmoji: '🗺️',
      topic: L('Lokacja: {item}. Tylko wypowiedzi fabularne (IC).', 'Location: {item}. In-character posts only.'),
      extra: null, voice: null,
      options: ['text'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('rpRules', '📕', L('zasady-rp', 'rp-rules'), L('Zasady prowadzenia rozgrywki.', 'Roleplay rules.'), { default: true, profile: 'readonly', posters: ['gm'] }),
      ch('lore', '📖', L('lore', 'lore'), L('Historia świata, frakcje, mapa i kalendarz.', 'World history, factions, map and calendar.'), { default: true, profile: 'readonly', posters: ['gm', 'lorekeeper'] }),
      ch('characters', '🧾', L('karty-postaci', 'character-sheets'), L('Jedna postać = jeden post. Czekaj na zatwierdzenie przez MG.', 'One character = one post. Wait for GM approval.'), { default: true, kind: 'forum', tags: [{ name: L('Do sprawdzenia', 'Pending'), emoji: '⏳' }, { name: L('Zatwierdzona', 'Approved'), emoji: '✅', moderated: true }, { name: L('Do poprawy', 'Needs changes'), emoji: '✏️', moderated: true }] }),
      ch('storyNews', '📯', L('wieści-fabularne', 'story-news'), L('Ogłoszenia fabularne od Mistrzów Gry.', 'Story announcements from GMs.'), { default: true, profile: 'readonly', posters: ['gm'] }),
      ch('sessions', '🗓️', L('sesje', 'sessions'), L('Plan sesji i zapisy.', 'Session schedule and sign-ups.'), { default: true }),
      ch('ooc', '🗨️', L('ooc', 'ooc'), L('Rozmowy poza postacią (Out Of Character).', 'Out-of-character chat.'), { default: true, cat: 'community' }),
      ch('dice', '🎲', L('kostki', 'dice-rolls'), L('Rzuty kośćmi (boty do kości).', 'Dice rolls.'), { default: true, cat: 'community' }),
    ],
    rules: {
      title: L('Zasady roleplay', 'Roleplay rules'),
      items: {
        pl: ['Na kanałach lokacji piszemy wyłącznie fabularnie (IC). Rozmowy OOC w ((podwójnych nawiasach)) lub na #ooc.', 'Zakaz powergamingu i godmodingu – nie decydujesz o reakcjach cudzych postaci.', 'Postać musi zostać zatwierdzona przez Mistrza Gry przed rozpoczęciem gry.', 'Treści brutalne tylko w granicach ustalonych przez MG.'],
        en: ['In-character only in location channels. OOC in ((double brackets)) or #ooc.', 'No powergaming or godmodding.', 'Characters must be approved by a GM before play.', 'Graphic content only within limits set by GMs.'],
      },
    },
  },

  shop: {
    label: 'Sklep / Usługi / Handel', emoji: '🛒',
    description: 'Oferta, cennik, kanał zamówień, opinie',
    memberName: L('Użytkownik', 'Member'), memberEmoji: '👤',
    special: { name: L('Sklep', 'Shop'), emoji: '🛒' }, specialPosition: 'afterNews',
    modules: ['verification', 'rules', 'info', 'faq', 'roleinfo', 'welcome', 'announcements', 'giveaways', 'general', 'botcmds', 'voice', 'staff', 'logs'],
    never: ['memes', 'counting', 'qotd', 'nsfw'],
    staffExtras: [
      { key: 'seller', name: L('Sprzedawca', 'Seller'), emoji: '💼', level: 'helper', color: 'staffExtra', description: 'Realizuje zamówienia', default: true },
      { key: 'middleman', name: L('Middleman', 'Middleman'), emoji: '⚖️', level: 'none', color: 'func', description: 'Pośredniczy w transakcjach', default: false },
    ],
    specials: [
      { key: 'customer', name: L('Klient', 'Customer'), emoji: '🛍️', color: 'special', hoist: true, description: 'Osoby, które złożyły zamówienie', default: true },
      { key: 'loyal', name: L('Stały klient', 'Loyal customer'), emoji: '💳', color: 'vip', hoist: true, description: 'Stali klienci (rabaty)', default: true },
    ],
    roleDefaults: { remove: ['levels', 'colors', 'age'] },
    voiceLobby: { name: L('Rozmowy', 'Lounge'), emoji: '🔊' },
    list: {
      title: 'Kategorie produktów', question: 'Jakie kategorie produktów / usług oferujesz?',
      placeholder: 'Konta, Grafiki, Boty Discord, Strony WWW, Usługi',
      defaults: ['Grafiki', 'Boty Discord', 'Strony WWW'],
      emoji: '🏷️', roleEmoji: '🏷️', category: L('Oferta', 'Offer'), categoryEmoji: '🏷️',
      topic: L('Oferta: {item}. Zamówienia składaj na kanale zamówień.', 'Offer: {item}. Place orders in the orders channel.'),
      extra: null, voice: null,
      options: ['text'], layout: 'shared', roleMentionable: false, readonly: true, posters: ['seller'],
    },
    extras: [
      ch('howToBuy', '📦', L('jak-kupić', 'how-to-buy'), L('Instrukcja składania zamówień.', 'How to order.'), { default: true, profile: 'readonly', post: 'card:shopHowTo' }),
      ch('orders', '🛒', L('zamówienia', 'orders'), L('Złóż zamówienie: produkt, ilość, metoda płatności. Sprzedawca odpowie w wątku pod Twoją wiadomością.', 'Place an order: product, quantity, payment method. A seller will reply in a thread.'), { default: true, slowmode: 300 }),
      ch('pricing', '💰', L('cennik', 'pricing'), L('Aktualny cennik produktów i usług.', 'Current prices.'), { default: true, profile: 'readonly', posters: ['seller'] }),
      ch('reviews', '⭐', L('opinie', 'reviews'), L('Zostaw opinię po zakupie (1 wiadomość na 6h). Format: produkt, ocena 1-5, komentarz.', 'Leave a review (1 per 6h): product, rating 1-5, comment.'), { default: true, slowmode: 21600 }),
      ch('proofs', '✅', L('realizacje', 'proofs'), L('Dowody zrealizowanych zamówień.', 'Proofs of completed orders.'), { default: true, profile: 'readonly', posters: ['seller'] }),
      ch('promotions', '🏷️', L('promocje', 'promotions'), L('Aktualne promocje i kody rabatowe.', 'Current deals and discount codes.'), { default: true, profile: 'readonly', posters: ['seller'] }),
      ch('payments', '💳', L('płatności', 'payments'), L('Dostępne metody płatności.', 'Payment methods.'), { default: false, profile: 'readonly', post: 'card:shopPayments' }),
    ],
    infoFields: [
      { key: 'payments', label: 'Metody płatności', placeholder: 'BLIK, przelew, PayPal, PaySafeCard', max: 200 },
      { key: 'time', label: 'Czas realizacji', placeholder: 'do 24 godzin', max: 100 },
      { key: 'website', label: 'Strona sklepu (link)', placeholder: 'https://sklep.pl', max: 200 },
    ],
    cards: {
      shopHowTo: {
        title: L('📦 Jak złożyć zamówienie?', '📦 How to order?'),
        description: L('1. Sprawdź ofertę i cennik\n2. Napisz na kanale zamówień: produkt, ilość i preferowaną płatność\n3. Poczekaj na odpowiedź sprzedawcy (w wątku pod Twoją wiadomością)\n4. Po realizacji zostaw opinię ⭐', '1. Check the offer and pricing\n2. Post in the orders channel: product, quantity and payment\n3. Wait for a seller to reply in a thread\n4. Leave a review ⭐'),
        fields: [
          { name: L('💳 Płatności', '💳 Payments'), value: '{payments}', needs: 'payments', inline: true },
          { name: L('⏱️ Czas realizacji', '⏱️ Delivery time'), value: '{time}', needs: 'time', inline: true },
          { name: L('🌍 Strona', '🌍 Website'), value: '{website}', needs: 'website' },
        ],
      },
      shopPayments: {
        title: L('💳 Metody płatności', '💳 Payment methods'),
        description: '{payments}',
        needs: 'payments',
      },
    },
    rules: {
      title: L('Zasady zakupów', 'Shopping terms'),
      items: {
        pl: ['Zamówienia składamy wyłącznie na kanale zamówień, a płatności uzgadniamy tylko ze sprzedawcami z rolą Sprzedawca.', 'Administracja nigdy nie pisze pierwsza w wiadomościach prywatnych – uważaj na oszustów.', 'Reklamacje zgłaszaj w ciągu 48 godzin od realizacji zamówienia.', 'Próba oszustwa lub chargeback skutkuje permanentnym banem.'],
        en: ['Orders are placed only in the orders channel; payments are agreed only with members holding the Seller role.', 'Staff never DMs first – beware of scammers.', 'Report issues within 48 hours of delivery.', 'Fraud or chargebacks result in a permanent ban.'],
      },
    },
  },

  friends: {
    label: 'Znajomi / Prywatny', emoji: '👥',
    description: 'Prosty serwer dla paczki znajomych – bez zbędnej biurokracji',
    memberName: L('Ziomek', 'Friend'), memberEmoji: '🤙',
    special: { name: L('Nasze sprawy', 'Our stuff'), emoji: '🏠' },
    modules: ['general', 'media', 'memes', 'botcmds', 'music', 'voice', 'afk'],
    never: ['verification', 'staff', 'logs', 'partnerships', 'faq', 'archive', 'rules', 'info'],
    staffDefaults: ['owner', 'admin'],
    roleDefaults: { remove: ['levels', 'notifications', 'age', 'member'], add: ['colors'] },
    voiceLobby: { name: L('Gadamy', 'Talk'), emoji: '🗣️' },
    list: {
      title: 'Tematy', question: 'O czym jeszcze gadacie? (każdy temat dostanie kanał)',
      placeholder: 'Gry, Filmy, Jedzenie, Wyjazdy',
      defaults: ['Gry', 'Filmy'],
      emoji: '📂', roleEmoji: '📂', category: L('Tematy', 'Topics'), categoryEmoji: '📂',
      topic: L('Rozmowy: {item}.', 'Talk: {item}.'),
      extra: null, voice: null,
      options: ['text'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('plans', '🗓️', L('plany', 'plans'), L('Kiedy się widzimy? Planujemy wyjścia i granie.', 'When do we meet? Plan hangouts and games.'), { default: true }),
      ch('memories', '📷', L('wspomnienia', 'memories'), L('Zdjęcia i filmiki z naszych akcji.', 'Photos and videos from our hangouts.'), { default: true, profile: 'media' }),
      ch('birthdays', '🎂', L('urodziny', 'birthdays'), L('Daty urodzin – żeby nikt nie zapomniał!', 'Birthdays – so nobody forgets!'), { default: false }),
      ch('cinema', '🍿', L('Kino', 'Movie night'), null, { default: true, kind: 'voice', cat: 'voice' }),
      ch('gamingF', '🎮', L('Granie', 'Gaming'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
  },

  art: {
    label: 'Sztuka / Grafika / Design', emoji: '🎨',
    description: 'Portfolio, prace w toku, feedback, zlecenia',
    memberName: L('Artysta', 'Artist'), memberEmoji: '🖌️',
    special: { name: L('Pracownia', 'Studio'), emoji: '🖼️' },
    modules: [...BASE_MODULES.filter((m) => m !== 'memes'), 'introductions'],
    staffExtras: [
      { key: 'curator', name: L('Kurator', 'Curator'), emoji: '🖼️', level: 'none', color: 'staffExtra', description: 'Wybiera prace do galerii', default: true },
    ],
    specials: [
      { key: 'verifiedArtist', name: L('Zweryfikowany artysta', 'Verified artist'), emoji: '✒️', color: 'special', hoist: true, description: 'Artyści ze sprawdzonym portfolio', default: true },
    ],
    voiceLobby: { name: L('Rysujemy razem', 'Draw together'), emoji: '✏️' },
    list: {
      title: 'Techniki', question: 'Jakie techniki / dziedziny mają mieć swoje kanały?',
      placeholder: 'Rysunek, Digital Art, Grafika 3D, Fotografia, Pixel Art',
      defaults: ['Rysunek', 'Digital Art', 'Grafika 3D', 'Fotografia'],
      emoji: '🖌️', roleEmoji: '🖌️', category: L('Techniki', 'Mediums'), categoryEmoji: '🖌️',
      topic: L('Prace i rozmowy: {item}.', 'Works and talk: {item}.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('gallery', '🖼️', L('galeria', 'gallery'), L('Najlepsze prace wybrane przez kuratorów.', 'Best works picked by curators.'), { default: true, profile: 'readonly', posters: ['curator'] }),
      ch('wip', '🚧', L('prace-w-toku', 'work-in-progress'), L('Pokaż, nad czym pracujesz.', 'Show what you are working on.'), { default: true, profile: 'media' }),
      ch('critique', '🗣️', L('feedback', 'critique'), L('Poproś o konstruktywną krytykę.', 'Ask for constructive critique.'), { default: true, kind: 'forum' }),
      ch('commissions', '💸', L('zlecenia', 'commissions'), L('Oferty i zapytania o zlecenia.', 'Commission offers and requests.'), { default: true, kind: 'forum', tags: [{ name: L('Szukam artysty', 'Looking for artist'), emoji: '🔍' }, { name: L('Oferuję', 'Offering'), emoji: '💼' }] }),
      ch('inspiration', '✨', L('inspiracje', 'inspiration'), L('Referencje i inspiracje.', 'References and inspiration.'), { default: true }),
      ch('resourcesArt', '📚', L('zasoby', 'resources'), L('Pędzle, tutoriale, programy.', 'Brushes, tutorials, software.'), { default: true }),
      ch('challenges', '🏅', L('wyzwania', 'challenges'), L('Cotygodniowe wyzwania artystyczne.', 'Weekly art challenges.'), { default: true, profile: 'readonly', posters: ['eventmgr', 'curator'] }),
    ],
    rules: {
      title: L('Zasady artystyczne', 'Art rules'),
      items: {
        pl: ['Publikuj tylko własne prace – kradzież prac (art theft) = ban.', 'Krytyka ma być konstruktywna i dotyczyć pracy, nie autora.', 'Prace generowane przez AI oznaczaj jako AI.'],
        en: ['Post only your own work – art theft = ban.', 'Keep critique constructive.', 'Label AI-generated works.'],
      },
    },
  },

  support: {
    label: 'Wsparcie produktu / Bot / Aplikacja', emoji: '🛠️',
    description: 'Status, dokumentacja, zgłaszanie błędów, propozycje funkcji',
    memberName: L('Użytkownik', 'User'), memberEmoji: '👤',
    special: { name: L('Produkt', 'Product'), emoji: '🧩' }, specialPosition: 'afterNews',
    modules: ['rules', 'info', 'faq', 'roleinfo', 'welcome', 'announcements', 'changelog', 'general', 'botcmds', 'suggestions', 'voice', 'staff', 'logs'],
    staffExtras: [
      { key: 'supportAgent', name: L('Support', 'Support'), emoji: '🎧', level: 'helper', color: 'staffExtra', description: 'Odpowiada na zgłoszenia', default: true },
    ],
    specials: [
      { key: 'premium', name: L('Premium', 'Premium'), emoji: '💎', color: 'vip', hoist: true, description: 'Użytkownicy wersji premium', default: true },
      { key: 'beta', name: L('Beta Tester', 'Beta Tester'), emoji: '🧪', color: 'special', hoist: false, description: 'Testerzy wersji beta', default: true },
    ],
    staffDefaults: ['owner', 'admin', 'mod', 'developer'],
    roleDefaults: { remove: ['levels', 'colors', 'age'] },
    voiceLobby: { name: L('Rozmowy', 'Lounge'), emoji: '🔊' },
    list: {
      title: 'Produkty', question: 'Jakie produkty / moduły wspierasz? (kanały pomocy)',
      placeholder: 'Bot, Panel WWW, API, Aplikacja mobilna',
      defaults: ['Bot', 'Panel WWW'],
      emoji: '🧩', roleEmoji: '🧩', category: L('Pomoc – produkty', 'Product help'), categoryEmoji: '🧩',
      topic: L('Pomoc dotycząca: {item}.', 'Help with: {item}.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('status', '🟢', L('status', 'status'), L('Status usług, awarie i prace techniczne.', 'Service status, outages and maintenance.'), { default: true, kind: 'announcement', profile: 'readonly' }),
      ch('docs', '📚', L('dokumentacja', 'documentation'), L('Dokumentacja i poradniki.', 'Docs and guides.'), { default: true, profile: 'readonly', post: 'card:supportLinks' }),
      ch('bugReports', '🐛', L('zgłoś-błąd', 'bug-reports'), L('Opisz błąd: kroki do odtworzenia, oczekiwany i faktyczny efekt, zrzuty ekranu.', 'Describe the bug: steps, expected vs actual, screenshots.'), { default: true, kind: 'forum', tags: [{ name: L('Nowy', 'New'), emoji: '🆕' }, { name: L('Potwierdzony', 'Confirmed'), emoji: '🔎', moderated: true }, { name: L('Naprawiony', 'Fixed'), emoji: '✅', moderated: true }, { name: L('Nie do odtworzenia', 'Cannot reproduce'), emoji: '❔', moderated: true }] }),
      ch('featureRequests', '✨', L('propozycje-funkcji', 'feature-requests'), L('Jedna funkcja = jeden post. Głosuj reakcjami!', 'One feature = one post. Vote with reactions!'), { default: true, kind: 'forum', reaction: '👍' }),
      ch('helpForum', '🆘', L('pomoc', 'help'), L('Zadaj pytanie – społeczność i support pomogą.', 'Ask a question – community and support will help.'), { default: true, kind: 'forum', tags: 'listItems' }),
      ch('beta', '🧪', L('beta-testy', 'beta-testing'), L('Kanał testerów wersji beta.', 'Beta testers channel.'), { default: true, cat: 'vip', access: ['beta'] }),
      ch('premiumSupport', '💎', L('premium-wsparcie', 'premium-support'), L('Priorytetowe wsparcie dla użytkowników Premium.', 'Priority support for Premium users.'), { default: true, cat: 'vip', access: ['premium'] }),
    ],
    infoFields: [
      { key: 'website', label: 'Strona produktu (link)', placeholder: 'https://mojbot.pl', max: 200 },
      { key: 'docs', label: 'Dokumentacja (link)', placeholder: 'https://docs.mojbot.pl', max: 200 },
      { key: 'invite', label: 'Link zaproszenia / pobierania', placeholder: 'https://discord.com/oauth2/authorize?client_id=…', max: 300 },
    ],
    cards: {
      supportLinks: {
        title: L('📚 Dokumentacja i linki', '📚 Documentation & links'),
        description: L('Zanim zadasz pytanie, sprawdź dokumentację – większość odpowiedzi już tam jest.', 'Check the docs before asking – most answers are there.'),
        fields: [
          { name: L('📖 Dokumentacja', '📖 Documentation'), value: '{docs}', needs: 'docs' },
          { name: L('🌍 Strona', '🌍 Website'), value: '{website}', needs: 'website' },
          { name: L('➕ Dodaj / pobierz', '➕ Add / download'), value: '{invite}', needs: 'invite' },
        ],
      },
    },
    rules: {
      title: L('Zasady wsparcia', 'Support rules'),
      items: {
        pl: ['Zanim zgłosisz problem, sprawdź FAQ i dokumentację.', 'Jeden problem = jeden post. Nie duplikuj zgłoszeń.', 'Nie oznaczaj developerów – odpowiemy w kolejności zgłoszeń.', 'Nie udostępniaj tokenów, haseł ani kluczy API – nawet ekipie.'],
        en: ['Check FAQ and docs before reporting.', 'One issue = one post. No duplicates.', 'Do not ping developers – we answer in order.', 'Never share tokens, passwords or API keys – not even with staff.'],
      },
    },
  },

  community: {
    label: 'Ogólna społeczność / Hangout', emoji: '🌍',
    description: 'Uniwersalny serwer do rozmów, zainteresowania, eventy',
    memberName: L('Członek', 'Member'), memberEmoji: '✅',
    special: { name: L('Rozrywka', 'Fun'), emoji: '🎲' },
    modules: [...BASE_MODULES, 'introductions', 'qotd', 'counting', 'music'],
    roleDefaults: { add: ['pronouns'] },
    voiceLobby: { name: L('Pogaduchy', 'Hangout'), emoji: '☕' },
    list: {
      title: 'Zainteresowania', question: 'Jakie zainteresowania mają mieć swoje kanały?',
      placeholder: 'Filmy i seriale, Książki, Sport, Technologia, Gotowanie, Podróże',
      defaults: ['Filmy i seriale', 'Muzyka', 'Sport', 'Technologia', 'Zwierzaki'],
      emoji: '📂', roleEmoji: '📂', category: L('Zainteresowania', 'Interests'), categoryEmoji: '📂',
      topic: L('Rozmowy o: {item}.', 'Talk about: {item}.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('selfies', '🤳', L('selfie', 'selfies'), L('Pokaż się! (tylko własne zdjęcia)', 'Show yourself! (your own photos only)'), { default: false, cat: 'community', profile: 'media' }),
      ch('pets', '🐾', L('zwierzaki', 'pets'), L('Zdjęcia Waszych pupili.', 'Photos of your pets.'), { default: true, cat: 'community', profile: 'media' }),
      ch('minigames', '🎲', L('mini-gry', 'mini-games'), L('Gry z botami: quizy, słówka, ekonomia.', 'Bot games: quizzes, word games, economy.'), { default: true }),
      ch('confessions', '🤫', L('wyznania', 'confessions'), L('Anonimowe wyznania (przez bota).', 'Anonymous confessions (via bot).'), { default: false, profile: 'readonly' }),
      ch('gamingVoice', '🎮', L('Granie', 'Gaming'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
  },

  sport: {
    label: 'Sport i fitness', emoji: '🏋️',
    description: 'Dyscypliny, plany treningowe, dieta, postępy i wyzwania',
    memberName: L('Sportowiec', 'Athlete'), memberEmoji: '🏃',
    special: { name: L('Trening', 'Training'), emoji: '🏋️' },
    modules: [...BASE_MODULES, 'introductions', 'qotd'],
    staffExtras: [
      { key: 'coach', name: L('Trener', 'Coach'), emoji: '🎯', level: 'none', color: 'staffExtra', description: 'Doradza w treningach', default: true },
      { key: 'dietitian', name: L('Dietetyk', 'Nutritionist'), emoji: '🥗', level: 'none', color: 'func', description: 'Doradza w odżywianiu', default: false },
    ],
    specials: [
      { key: 'competitor', name: L('Zawodnik', 'Competitor'), emoji: '🏅', color: 'special', hoist: true, description: 'Osoby startujące w zawodach', default: true },
    ],
    voiceLobby: { name: L('Szatnia', 'Locker room'), emoji: '🎧' },
    list: {
      title: 'Dyscypliny', question: 'Jakie dyscypliny mają mieć swoje kanały?',
      placeholder: 'Siłownia, Bieganie, Piłka nożna, Kolarstwo, Sporty walki',
      defaults: ['Siłownia', 'Bieganie', 'Piłka nożna', 'Kolarstwo'],
      emoji: '🏅', roleEmoji: '🏅', category: L('Dyscypliny', 'Sports'), categoryEmoji: '🏅',
      topic: L('Rozmowy o dyscyplinie: {item}.', 'Talk about {item}.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: true,
    },
    extras: [
      ch('trainingPlans', '📋', L('plany-treningowe', 'training-plans'), L('Jeden plan = jeden post. Podaj cel, poziom i częstotliwość.', 'One plan per post: goal, level and frequency.'), { default: true, kind: 'forum', tags: [{ name: L('Początkujący', 'Beginner'), emoji: '🌱' }, { name: L('Średni', 'Intermediate'), emoji: '💪' }, { name: L('Zaawansowany', 'Advanced'), emoji: '🔥' }] }),
      ch('progress', '📈', L('postępy', 'progress'), L('Pochwal się postępami – zdjęcia, wyniki, rekordy.', 'Share your progress – photos, results, PRs.'), { default: true, profile: 'media' }),
      ch('diet', '🥗', L('dieta', 'nutrition'), L('Przepisy, makro i suplementacja.', 'Recipes, macros and supplements.'), { default: true }),
      ch('challenges', '🏆', L('wyzwania', 'challenges'), L('Miesięczne wyzwania sportowe.', 'Monthly fitness challenges.'), { default: true, profile: 'readonly', posters: ['eventmgr', 'coach'] }),
      ch('gear', '👟', L('sprzęt', 'gear'), L('Buty, zegarki, sprzęt na siłownię.', 'Shoes, watches, gym gear.'), { default: false }),
      ch('liveWorkout', '🏋️', L('Trening na żywo', 'Live workout'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    rules: {
      title: L('Zasady sportowe', 'Fitness rules'),
      items: {
        pl: ['Porady na serwerze nie zastępują lekarza ani trenera – przy problemach zdrowotnych skonsultuj się ze specjalistą.', 'Zakaz promowania dopingu, sterydów i niebezpiecznych diet.', 'Nie oceniamy wyglądu innych – wspieramy się w postępach.'],
        en: ['Advice here does not replace a doctor or coach – consult a professional about health issues.', 'No promoting doping, steroids or dangerous diets.', 'We don\'t judge anyone\'s body – we support each other.'],
      },
    },
  },

  movies: {
    label: 'Filmy i seriale', emoji: '🎬',
    description: 'Gatunki, premiery, recenzje, polecajki i wspólne seanse',
    memberName: L('Kinoman', 'Cinephile'), memberEmoji: '🍿',
    special: { name: L('Kino', 'Cinema'), emoji: '🎬' },
    modules: [...BASE_MODULES, 'qotd', 'polls'],
    staffExtras: [
      { key: 'critic', name: L('Recenzent', 'Critic'), emoji: '🖋️', level: 'none', color: 'staffExtra', description: 'Pisze recenzje serwera', default: true },
    ],
    voiceLobby: { name: L('Foyer', 'Lobby'), emoji: '🎟️' },
    list: {
      title: 'Gatunki', question: 'Jakie gatunki mają mieć swoje kanały?',
      placeholder: 'Akcja, Komedia, Horror, Sci-Fi, Dramat, Animacja',
      defaults: ['Akcja', 'Komedia', 'Horror', 'Sci-Fi', 'Dramat'],
      emoji: '🎞️', roleEmoji: '🎞️', category: L('Gatunki', 'Genres'), categoryEmoji: '🎞️',
      topic: L('Filmy i seriale: {item}. Spoilery w ||znacznikach||!', '{item} movies & shows. Use ||spoiler tags||!'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('premieres', '🗓️', L('premiery', 'premieres'), L('Nadchodzące premiery kinowe i serialowe.', 'Upcoming movie and show releases.'), { default: true, profile: 'readonly', posters: ['critic'] }),
      ch('reviews', '⭐', L('recenzje', 'reviews'), L('Jedna recenzja = jeden post. Oceń w skali 1–10.', 'One review per post. Rate 1–10.'), { default: true, kind: 'forum', reaction: '⭐' }),
      ch('recommendations', '💡', L('polecajki', 'recommendations'), L('Co warto obejrzeć? Polecaj i pytaj.', 'What to watch? Recommend and ask.'), { default: true, kind: 'forum' }),
      ch('series', '📺', L('seriale', 'tv-shows'), L('Rozmowy o serialach – odcinek po odcinku.', 'Talk about TV shows episode by episode.'), { default: true }),
      ch('spoilersM', '⚠️', L('spoilery', 'spoilers'), L('Tu wolno spoilerować – na własne ryzyko.', 'Spoilers allowed – enter at your own risk.'), { default: true }),
      ch('movieNight', '🍿', L('Wspólny seans', 'Movie night'), null, { default: true, kind: 'voice', cat: 'voice' }),
    ],
    rules: {
      title: L('Zasady kinomana', 'Movie fan rules'),
      items: {
        pl: ['Spoilery tylko w ||znacznikach|| lub na kanale #spoilery.', 'Zakaz udostępniania pirackich linków i nielegalnych streamów.', 'Szanuj gusta innych – krytykuj film, nie osobę.'],
        en: ['Spoilers only in ||spoiler tags|| or the spoilers channel.', 'No piracy links or illegal streams.', 'Respect others\' tastes – critique the movie, not the person.'],
      },
    },
  },

  trading: {
    label: 'Inwestycje / Krypto / Finanse', emoji: '📈',
    description: 'Rynki, analizy, newsy, edukacja – z ochroną przed scamem',
    memberName: L('Inwestor', 'Investor'), memberEmoji: '💹',
    special: { name: L('Rynki', 'Markets'), emoji: '📈' }, specialPosition: 'afterNews',
    modules: [...BASE_MODULES.filter((m) => m !== 'memes'), 'faq'],
    staffExtras: [
      { key: 'analyst', name: L('Analityk', 'Analyst'), emoji: '📊', level: 'none', color: 'staffExtra', description: 'Publikuje analizy', default: true },
      { key: 'educator', name: L('Edukator', 'Educator'), emoji: '🎓', level: 'helper', color: 'helper', description: 'Pomaga początkującym', default: false },
    ],
    specials: [
      { key: 'premiumT', name: L('Premium', 'Premium'), emoji: '💎', color: 'vip', hoist: true, description: 'Członkowie z dostępem premium', default: false },
    ],
    roleDefaults: { remove: ['colors', 'age'] },
    voiceLobby: { name: L('Sala tradingowa', 'Trading room'), emoji: '💹' },
    list: {
      title: 'Rynki', question: 'Jakie rynki / aktywa mają mieć swoje kanały?',
      placeholder: 'Akcje, Krypto, Forex, ETF, Surowce, Nieruchomości',
      defaults: ['Akcje', 'Krypto', 'Forex', 'ETF'],
      emoji: '💹', roleEmoji: '💹', category: L('Rynki', 'Markets'), categoryEmoji: '💹',
      topic: L('Dyskusje o rynku: {item}. To nie jest porada inwestycyjna.', '{item} market talk. Not financial advice.'),
      extra: null, voice: null,
      options: ['text', 'role'], layout: 'shared', roleMentionable: true,
    },
    extras: [
      ch('marketNews', '📰', L('newsy-rynkowe', 'market-news'), L('Najważniejsze wiadomości z rynków.', 'Key market news.'), { default: true, profile: 'readonly', posters: ['analyst'] }),
      ch('analysis', '📊', L('analizy', 'analysis'), L('Analizy techniczne i fundamentalne – jedna analiza = jeden post.', 'Technical & fundamental analysis – one per post.'), { default: true, kind: 'forum', tags: [{ name: L('Techniczna', 'Technical'), emoji: '📉' }, { name: L('Fundamentalna', 'Fundamental'), emoji: '🏦' }, { name: L('Długoterminowa', 'Long-term'), emoji: '⏳' }] }),
      ch('education', '🎓', L('edukacja', 'education'), L('Podstawy inwestowania, pojęcia, poradniki.', 'Investing basics, terms and guides.'), { default: true, profile: 'readonly', posters: ['analyst', 'educator'] }),
      ch('scamAlerts', '🚨', L('ostrzeżenia-scam', 'scam-alerts'), L('Znane oszustwa – nikt z ekipy nie pisze pierwszy w DM!', 'Known scams – staff never DMs first!'), { default: true, profile: 'readonly' }),
      ch('portfolios', '💼', L('portfele', 'portfolios'), L('Pokaż swój portfel i strategię (bez linków polecających).', 'Share your portfolio and strategy (no referral links).'), { default: true }),
      ch('premiumChat', '💎', L('premium', 'premium'), L('Kanał dla członków premium.', 'Premium members channel.'), { default: false, cat: 'vip', access: ['premiumT'] }),
    ],
    rules: {
      title: L('Zasady inwestycyjne', 'Investing rules'),
      items: {
        pl: ['Nic na tym serwerze nie jest poradą inwestycyjną – inwestujesz na własne ryzyko.', 'Zakaz pump & dump, „sygnałów” za opłatą i linków polecających.', 'Ekipa nigdy nie pisze pierwsza w DM i nie prosi o pieniądze ani klucze do portfela.', 'Zakaz reklamowania projektów krypto bez zgody administracji.'],
        en: ['Nothing here is financial advice – invest at your own risk.', 'No pump & dump, paid "signals" or referral links.', 'Staff never DMs first and never asks for money or wallet keys.', 'No shilling crypto projects without staff approval.'],
      },
    },
  },

  event: {
    label: 'Wydarzenie / Konferencja / Hackathon', emoji: '🎪',
    description: 'Harmonogram, ścieżki, pytania do prelegentów, networking',
    memberName: L('Uczestnik', 'Attendee'), memberEmoji: '🎟️',
    special: { name: L('Wydarzenie', 'Event'), emoji: '🎪' }, specialPosition: 'afterNews',
    modules: ['verification', 'rules', 'info', 'faq', 'roleinfo', 'welcome', 'announcements', 'general', 'introductions', 'media', 'botcmds', 'voice', 'stage', 'staff', 'logs'],
    staffExtras: [
      { key: 'organizer', name: L('Organizator', 'Organizer'), emoji: '🎪', level: 'admin', color: 'management', description: 'Organizuje wydarzenie', default: true },
      { key: 'volunteer', name: L('Wolontariusz', 'Volunteer'), emoji: '🙌', level: 'helper', color: 'helper', description: 'Pomaga uczestnikom', default: true },
    ],
    specials: [
      { key: 'speaker', name: L('Prelegent', 'Speaker'), emoji: '🎤', color: 'special', hoist: true, description: 'Prelegenci i mentorzy', default: true },
      { key: 'sponsorE', name: L('Sponsor', 'Sponsor'), emoji: '💼', color: 'partner', hoist: true, description: 'Sponsorzy wydarzenia', default: true },
    ],
    roleDefaults: { remove: ['levels', 'colors', 'age'] },
    voiceLobby: { name: L('Hol', 'Hall'), emoji: '🚪' },
    list: {
      title: 'Ścieżki / sale', question: 'Jakie ścieżki, sale lub bloki tematyczne ma wydarzenie?',
      placeholder: 'Scena główna, Warsztaty, Frontend, Backend, Networking',
      defaults: ['Scena główna', 'Warsztaty', 'Networking'],
      emoji: '🎙️', roleEmoji: '🎙️', category: L('Ścieżki', 'Tracks'), categoryEmoji: '🎙️',
      topic: L('Ścieżka: {item} – pytania, materiały i dyskusja.', 'Track: {item} – questions, materials and discussion.'),
      extra: null, voice: { prefix: null, emoji: '🎙️' },
      options: ['text', 'voice'], layout: 'shared', roleMentionable: false,
    },
    extras: [
      ch('eventInfo', '📍', L('informacje-praktyczne', 'practical-info'), L('Kiedy, gdzie i jak dołączyć.', 'When, where and how to join.'), { default: true, profile: 'readonly', post: 'card:eventInfo' }),
      ch('schedule', '🗓️', L('harmonogram', 'schedule'), L('Plan wydarzenia – godziny i sale.', 'Event schedule – times and rooms.'), { default: true, profile: 'readonly', posters: ['organizer'] }),
      ch('speakerQs', '❓', L('pytania-do-prelegentów', 'speaker-questions'), L('Zadaj pytanie prelegentowi – jedno pytanie = jeden post.', 'Ask a speaker – one question per post.'), { default: true, kind: 'forum', reaction: '👍' }),
      ch('teams', '🤝', L('szukam-zespołu', 'find-a-team'), L('Szukasz zespołu na hackathon? Napisz, co umiesz.', 'Looking for a hackathon team? Share your skills.'), { default: true, kind: 'forum' }),
      ch('materials', '📂', L('materiały', 'materials'), L('Prezentacje i nagrania po wystąpieniach.', 'Slides and recordings after talks.'), { default: true, profile: 'readonly', posters: ['organizer', 'speaker'] }),
      ch('sponsorsE', '💼', L('sponsorzy', 'sponsors'), L('Poznaj naszych sponsorów.', 'Meet our sponsors.'), { default: false, profile: 'readonly', posters: ['organizer'] }),
    ],
    infoFields: [
      { key: 'date', label: 'Data i godzina', placeholder: '12–13 października 2026, start 10:00', max: 150 },
      { key: 'place', label: 'Miejsce / link do transmisji', placeholder: 'Kraków, ICE / https://youtube.com/live/…', max: 300 },
      { key: 'website', label: 'Strona i rejestracja (link)', placeholder: 'https://wydarzenie.pl', max: 200 },
    ],
    cards: {
      eventInfo: {
        needs: 'date',
        title: L('📍 Informacje praktyczne', '📍 Practical information'),
        description: L('Wszystko, co musisz wiedzieć, zanim dołączysz.', 'Everything you need to know before you join.'),
        fields: [
          { name: L('🗓️ Kiedy', '🗓️ When'), value: '{date}', needs: 'date', inline: true },
          { name: L('📍 Gdzie', '📍 Where'), value: '{place}', needs: 'place', inline: true },
          { name: L('🔗 Strona i rejestracja', '🔗 Website & registration'), value: '{website}', needs: 'website' },
        ],
      },
    },
    rules: {
      title: L('Kodeks uczestnika', 'Code of conduct'),
      items: {
        pl: ['Traktuj wszystkich uczestników, prelegentów i wolontariuszy z szacunkiem.', 'Pytania do prelegentów zadawaj na kanale pytań – nie w wiadomościach prywatnych.', 'Nagrywanie i publikowanie wystąpień tylko za zgodą organizatorów.'],
        en: ['Treat all attendees, speakers and volunteers with respect.', 'Ask speakers in the questions channel – not in DMs.', 'Recording and publishing talks only with the organizers\' consent.'],
      },
    },
  },

  custom: {
    label: 'Własny projekt (od zera)', emoji: '🧩',
    description: 'Minimalny punkt startowy – sam wybierasz wszystko',
    memberName: L('Członek', 'Member'), memberEmoji: '✅',
    special: { name: L('Projekt', 'Project'), emoji: '🧩' },
    modules: ['rules', 'info', 'welcome', 'announcements', 'general', 'media', 'botcmds', 'voice', 'afk', 'staff', 'logs'],
    roleDefaults: { remove: ['levels', 'colors', 'age'] },
    voiceLobby: { name: L('Rozmowy', 'Lounge'), emoji: '🔊' },
    list: {
      title: 'Własne kanały tematyczne', question: 'Jakie kanały tematyczne mają powstać?',
      placeholder: 'Projekty, Pomysły, Materiały',
      defaults: [],
      emoji: '📁', roleEmoji: '📁', category: L('Tematy', 'Topics'), categoryEmoji: '📁',
      topic: L('Kanał: {item}.', 'Channel: {item}.'),
      extra: null, voice: null,
      options: ['text'], layout: 'shared', roleMentionable: false,
    },
    extras: [],
  },
};

module.exports = { SERVER_TYPES, BASE_MODULES };
