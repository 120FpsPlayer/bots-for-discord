'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { tr, fill } = require('../utils/i18n');
const { SERVER_TYPES } = require('../data/serverTypes');
const { STAFF_LEVELS } = require('../data/roles');

/**
 * Generuje wiadomości publikowane przez bota na zbudowanym serwerze.
 * Każda funkcja dostaje `ctx`:
 *   ctx.lang, ctx.answers, ctx.blueprint, ctx.color,
 *   ctx.ch(key)   → wzmianka kanału (<#id>) albo null, jeśli kanał nie istnieje,
 *   ctx.role(key) → wzmianka roli (<@&id>) albo null,
 *   ctx.roleId(key), ctx.guildName, ctx.date
 * i zwraca { embeds, components } albo tablicę takich wiadomości.
 */

const T = (ctx, pl, en) => (ctx.lang === 'en' ? en : pl);

function baseEmbed(ctx) {
  return new EmbedBuilder().setColor(ctx.color).setFooter({ text: ctx.guildName }).setTimestamp(new Date());
}

/** Łączy niepuste linie; zwraca null, gdy nic nie zostało. */
function lines(...items) {
  const out = items.flat().filter(Boolean);
  return out.length ? out.join('\n') : null;
}

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Tekst odwołujący się do ticketów albo do administracji, jeśli ticketów nie ma. */
function contactStaff(ctx) {
  const ticket = ctx.ch('ticketPanel');
  return ticket ? T(ctx, `otwórz ticket na ${ticket}`, `open a ticket in ${ticket}`) : T(ctx, 'napisz do administracji', 'contact the staff');
}

// ───────────────────────────── REGULAMIN ─────────────────────────────

function rules(ctx) {
  const { answers } = ctx;
  const preset = SERVER_TYPES[answers.type];
  const minAge = Number(answers.age) || 13;
  const announcements = ctx.ch('announcements') || ctx.ch('changelog') || T(ctx, 'kanale ogłoszeń', 'the announcements channel');
  const nsfwAllowed = Boolean(ctx.ch('nsfw'));

  const sections = [
    {
      name: T(ctx, '§1 • Postanowienia ogólne', '§1 • General'),
      items: T(ctx, [
        'Przebywając na serwerze, akceptujesz ten regulamin oraz [Warunki korzystania z usługi Discord](https://discord.com/terms) i [Wytyczne dla społeczności](https://discord.com/guidelines).',
        'Nieznajomość regulaminu nie zwalnia z obowiązku jego przestrzegania.',
        `Minimalny wiek na serwerze to **${minAge} lat**.`,
        `Administracja może zmienić regulamin – o zmianach informujemy na ${announcements}.`,
      ], [
        'By staying on this server you accept these rules, the [Discord Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines).',
        'Not knowing the rules does not exempt you from them.',
        `Minimum age on this server is **${minAge}**.`,
        `Staff may update the rules – changes are announced in ${announcements}.`,
      ]),
    },
    {
      name: T(ctx, '§2 • Kultura i zachowanie', '§2 • Behaviour'),
      items: T(ctx, [
        'Szanuj innych. Zakazane są obelgi, nękanie, groźby oraz dyskryminacja (m.in. ze względu na pochodzenie, płeć, orientację, religię czy niepełnosprawność).',
        'Zakaz spamu, floodu, nadużywania CAPS LOCKA, emoji i oznaczeń.',
        'Zakaz trollingu, prowokowania kłótni i celowego psucia atmosfery.',
        'Pisz na kanałach zgodnie z ich przeznaczeniem (opis kanału jest na górze).',
        'Zakaz podszywania się pod innych użytkowników, administrację lub znane osoby.',
      ], [
        'Respect everyone. No insults, harassment, threats or discrimination of any kind.',
        'No spam, flooding, excessive caps, emoji or mentions.',
        'No trolling, baiting or intentionally ruining the atmosphere.',
        'Use channels for their intended purpose (see channel topics).',
        'Do not impersonate other users, staff or public figures.',
      ]),
    },
    {
      name: T(ctx, '§3 • Treści', '§3 • Content'),
      items: T(ctx, [
        nsfwAllowed
          ? `Treści NSFW są dozwolone wyłącznie na ${ctx.ch('nsfw')}. Treści drastyczne i nielegalne są zakazane wszędzie.`
          : 'Zakaz publikowania treści NSFW, drastycznych i szokujących.',
        'Zakaz udostępniania danych osobowych – swoich i cudzych (doxxing).',
        'Zakaz publikowania złośliwych linków, plików, scamów i „darmowego Nitro”.',
        'Zakaz reklamowania serwerów, stron i usług bez zgody administracji – także w wiadomościach prywatnych.',
        'Zakaz treści łamiących prawo, w tym piractwa.',
      ], [
        nsfwAllowed
          ? `NSFW content is allowed only in ${ctx.ch('nsfw')}. Gore and illegal content is banned everywhere.`
          : 'No NSFW, gore or shocking content.',
        'Do not share personal information – yours or anyone else\'s (doxxing).',
        'No malicious links, files, scams or "free Nitro".',
        'No advertising without staff permission – including DMs.',
        'No illegal content, including piracy.',
      ]),
    },
  ];

  if (ctx.blueprint.stats.voice > 0) {
    sections.push({
      name: T(ctx, '§4 • Kanały głosowe', '§4 • Voice channels'),
      items: T(ctx, [
        'Zakaz krzyczenia, przesterowanego mikrofonu, modulatorów głosu i soundboardu w celu przeszkadzania.',
        'Zakaz nagrywania rozmów bez zgody wszystkich uczestników.',
        'Zakaz celowego skakania po kanałach (channel hopping).',
      ], [
        'No screaming, earrape, voice changers or soundboard abuse.',
        'Do not record conversations without everyone\'s consent.',
        'No channel hopping.',
      ]),
    });
  }

  sections.push({
    name: T(ctx, `§${sections.length + 1} • Profil i nick`, `§${sections.length + 1} • Profile & nickname`),
    items: T(ctx, [
      'Nick, avatar, status i opis nie mogą zawierać treści obraźliwych, NSFW ani reklam.',
      'Nick musi dać się oznaczyć – bez samych znaków specjalnych.',
    ], [
      'Nickname, avatar, status and bio must not be offensive, NSFW or contain ads.',
      'Your nickname must be mentionable – no special-characters-only names.',
    ]),
  });

  if (preset?.rules) {
    sections.push({
      name: `§${sections.length + 1} • ${tr(preset.rules.title, ctx.lang)}`,
      items: preset.rules.items[ctx.lang] ?? preset.rules.items.pl,
    });
  }

  sections.push({
    name: T(ctx, `§${sections.length + 1} • Kary i administracja`, `§${sections.length + 1} • Punishments & staff`),
    items: T(ctx, [
      'Stopniowanie kar: ostrzeżenie → wyciszenie (timeout) → wyrzucenie → ban. Przy poważnych przewinieniach administracja może pominąć etapy.',
      'Decyzje administracji są wiążące. Aby się odwołać, ' + contactStaff(ctx) + '.',
      'Nie oznaczaj administracji bez ważnego powodu.',
      'Omijanie kar (np. multikonta) skutkuje permanentnym banem.',
    ], [
      'Punishment ladder: warning → timeout → kick → ban. Serious offences may skip steps.',
      'Staff decisions are binding. To appeal, ' + contactStaff(ctx) + '.',
      'Do not ping staff without a good reason.',
      'Evading punishments (e.g. alt accounts) results in a permanent ban.',
    ]),
  });

  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, `📜 Regulamin serwera ${ctx.guildName}`, `📜 ${ctx.guildName} rules`))
    .setDescription(T(ctx,
      'Prosimy o uważne zapoznanie się z zasadami. Dzięki nim serwer jest bezpiecznym i przyjaznym miejscem dla wszystkich. 💙',
      'Please read the rules carefully. They keep this server safe and friendly for everyone. 💙'));

  for (const section of sections.slice(0, 24)) {
    const value = section.items.map((item, i) => `**${i + 1}.** ${item}`).join('\n');
    embed.addFields({ name: section.name, value: truncate(value, 1024) });
  }
  embed.setFooter({ text: T(ctx, `Regulamin obowiązuje od ${ctx.date}`, `Rules effective since ${ctx.date}`) });
  return { embeds: [embed] };
}

// ───────────────────────────── INFORMACJE ─────────────────────────────

function info(ctx) {
  const { answers } = ctx;
  const preset = SERVER_TYPES[answers.type];
  const description = answers.basics.description?.trim()
    || T(ctx, `Witaj na serwerze **${ctx.guildName}**! Cieszymy się, że jesteś z nami.`, `Welcome to **${ctx.guildName}**! We are glad you are here.`);

  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, `👋 Witaj na serwerze ${ctx.guildName}!`, `👋 Welcome to ${ctx.guildName}!`))
    .setDescription(truncate(description, 4000));

  if (answers.basics.audience?.trim()) {
    embed.addFields({ name: T(ctx, '🎯 Dla kogo jest serwer?', '🎯 Who is this server for?'), value: truncate(answers.basics.audience.trim(), 1024) });
  }

  const guide = [
    ['rules', T(ctx, 'zasady serwera – przeczytaj koniecznie', 'server rules – must read')],
    ['announcements', T(ctx, 'najważniejsze ogłoszenia', 'important announcements')],
    ['selfroles', T(ctx, 'wybierz role, kolory i powiadomienia', 'pick roles, colors and notifications')],
    ['general', T(ctx, 'główny czat', 'main chat')],
    ['introductions', T(ctx, 'przedstaw się społeczności', 'introduce yourself')],
    ['suggestions', T(ctx, 'zgłoś pomysł na ulepszenie serwera', 'suggest improvements')],
    ['botcmds', T(ctx, 'komendy botów', 'bot commands')],
    ['ticketPanel', T(ctx, 'pomoc od administracji', 'help from staff')],
    ['faq', T(ctx, 'odpowiedzi na częste pytania', 'frequently asked questions')],
  ].map(([key, text]) => (ctx.ch(key) ? `${ctx.ch(key)} – ${text}` : null));
  const guideText = lines(guide);
  if (guideText) embed.addFields({ name: T(ctx, '🧭 Od czego zacząć?', '🧭 Where to start?'), value: truncate(guideText, 1024) });

  const staffKeys = ctx.blueprint.roles.filter((r) => r.staff && !r.separator).map((r) => r.key);
  const staffText = lines(staffKeys.slice(0, 12).map((key) => {
    const role = ctx.blueprint.roles.find((r) => r.key === key);
    const mention = ctx.role(key);
    const level = STAFF_LEVELS[role.level];
    return mention ? `${mention}${level ? ` – ${tr(level.short, ctx.lang)}` : ''}` : null;
  }));
  if (staffText) embed.addFields({ name: T(ctx, '🛡️ Ekipa serwera', '🛡️ Server staff'), value: truncate(staffText, 1024) });

  const extra = [];
  const infoValues = answers.special?.info || {};
  for (const field of preset?.infoFields || []) {
    const value = infoValues[field.key]?.trim();
    if (value) extra.push(`**${field.label}:** ${value}`);
  }
  if (extra.length && ctx.lang === 'pl') {
    embed.addFields({ name: '🔗 Przydatne informacje', value: truncate(extra.join('\n'), 1024) });
  } else if (extra.length) {
    embed.addFields({ name: '🔗 Useful info', value: truncate(extra.map((e) => e.replace(/^\*\*[^*]+:\*\* /, '• ')).join('\n'), 1024) });
  }

  return { embeds: [embed] };
}

// ───────────────────────────── FAQ ─────────────────────────────

function faq(ctx) {
  const qa = T(ctx, [
    ['Jak zdobyć rolę?', ctx.ch('selfroles') ? `Większość ról wybierzesz sam na ${ctx.ch('selfroles')}. Role specjalne nadaje administracja.` : 'Role nadaje administracja.'],
    ['Nie widzę kanałów – co robić?', ctx.ch('verify') ? `Zweryfikuj się na ${ctx.ch('verify')}. Jeśli dalej nic nie widzisz, ${contactStaff(ctx)}.` : `Upewnij się, że masz odpowiednią rolę. W razie problemów ${contactStaff(ctx)}.`],
    ['Jak zgłosić użytkownika?', `Zrób zrzut ekranu i ${contactStaff(ctx)}. Nie rób „samosądów” na czacie.`],
    ['Jak dołączyć do ekipy?', 'Śledź ogłoszenia – informujemy o rekrutacjach. Najlepszą rekomendacją jest aktywność i kultura.'],
    ['Czy mogę zareklamować swój serwer?', ctx.ch('partnerships') ? `Tylko w ramach partnerstwa – szczegóły na ${ctx.ch('partnerships')}.` : 'Nie, reklama bez zgody administracji jest zabroniona.'],
    ['Otrzymałem karę – co teraz?', `Przeczytaj regulamin${ctx.ch('rules') ? ` (${ctx.ch('rules')})` : ''}. Jeśli uważasz, że kara była niesłuszna, ${contactStaff(ctx)}.`],
  ], [
    ['How do I get roles?', ctx.ch('selfroles') ? `Pick most roles yourself in ${ctx.ch('selfroles')}. Special roles are given by staff.` : 'Roles are given by staff.'],
    ['I can\'t see channels – what now?', ctx.ch('verify') ? `Verify in ${ctx.ch('verify')}. If it still doesn't work, ${contactStaff(ctx)}.` : `Make sure you have the right role, or ${contactStaff(ctx)}.`],
    ['How do I report someone?', `Take a screenshot and ${contactStaff(ctx)}.`],
    ['How do I join the staff?', 'Watch the announcements for applications. Activity and good manners are the best recommendation.'],
    ['Can I advertise my server?', ctx.ch('partnerships') ? `Only via partnership – see ${ctx.ch('partnerships')}.` : 'No, advertising without permission is not allowed.'],
    ['I got punished – what now?', `Read the rules. If you think it was unfair, ${contactStaff(ctx)}.`],
  ]);
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '❓ Najczęściej zadawane pytania', '❓ Frequently asked questions'))
    .setDescription(T(ctx, 'Nie znalazłeś odpowiedzi? Zapytaj na czacie lub skontaktuj się z ekipą.', 'Can\'t find an answer? Ask in chat or contact the staff.'));
  for (const [q, a] of qa) embed.addFields({ name: `❔ ${q}`, value: a });
  return { embeds: [embed] };
}

// ───────────────────────────── WERYFIKACJA ─────────────────────────────

function verify(ctx) {
  const roleId = ctx.roleId('member');
  if (!roleId) return null;
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '✅ Weryfikacja', '✅ Verification'))
    .setDescription(T(ctx,
      `Witaj na serwerze **${ctx.guildName}**! 👋\n\nAby uzyskać dostęp do wszystkich kanałów:\n**1.** Przeczytaj ${ctx.ch('rules') || 'regulamin'}\n**2.** Kliknij przycisk **Zweryfikuj się** poniżej\n\nKlikając przycisk, potwierdzasz, że akceptujesz regulamin serwera.`,
      `Welcome to **${ctx.guildName}**! 👋\n\nTo access all channels:\n**1.** Read ${ctx.ch('rules') || 'the rules'}\n**2.** Click **Verify** below\n\nBy clicking you confirm that you accept the server rules.`))
    .setFooter({ text: T(ctx, 'Masz problem z weryfikacją? Napisz do administracji.', 'Trouble verifying? Contact the staff.') });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vf:${ctx.lang}:${roleId}`)
      .setLabel(T(ctx, 'Zweryfikuj się', 'Verify'))
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// ───────────────────────────── PANEL RÓL ─────────────────────────────

const SELF_GROUP_TEXT = {
  notifications: { emoji: '🔔', pl: ['Powiadomienia', 'Wybierz, o czym chcesz dostawać pingi.'], en: ['Notifications', 'Choose what you want to be pinged about.'] },
  colors: { emoji: '🎨', pl: ['Kolor nicku', 'Wybierz jeden kolor swojego nicku.'], en: ['Name color', 'Pick one color for your name.'] },
  items: { emoji: '⭐', pl: ['Zainteresowania', 'Zaznacz, co Cię interesuje – odblokujesz powiązane kanały i pingi.'], en: ['Interests', 'Select what you are into.'] },
  age: { emoji: '🎂', pl: ['Wiek', 'Wybierz swój przedział wiekowy.'], en: ['Age', 'Pick your age range.'] },
  pronouns: { emoji: '💬', pl: ['Zaimki', 'Jak mamy się do Ciebie zwracać?'], en: ['Pronouns', 'How should we refer to you?'] },
  platform: { emoji: '🎮', pl: ['Platformy', 'Na czym grasz?'], en: ['Platforms', 'What do you play on?'] },
  region: { emoji: '📍', pl: ['Region', 'Skąd jesteś?'], en: ['Region', 'Where are you from?'] },
  custom: { emoji: '✨', pl: ['Dodatkowe role', 'Pozostałe role do wyboru.'], en: ['Extra roles', 'Other roles to pick.'] },
};

const SELF_GROUP_ORDER = ['notifications', 'colors', 'items', 'platform', 'age', 'pronouns', 'region', 'custom'];

function selfroles(ctx) {
  const groups = [];
  for (const group of SELF_GROUP_ORDER) {
    const roles = ctx.blueprint.roles.filter((r) => r.self?.group === group && ctx.roleId(r.key));
    if (!roles.length) continue;
    const mode = roles[0].self.mode;
    for (let i = 0; i < roles.length; i += 25) {
      const chunk = roles.slice(i, i + 25);
      groups.push({ group, mode, roles: chunk, part: roles.length > 25 ? Math.floor(i / 25) + 1 : null });
    }
  }
  if (!groups.length) return null;

  const messages = [];
  for (let i = 0; i < groups.length; i += 5) {
    const batch = groups.slice(i, i + 5);
    const embed = baseEmbed(ctx);
    if (i === 0) {
      embed.setTitle(T(ctx, '🎭 Wybierz swoje role', '🎭 Pick your roles'))
        .setDescription(T(ctx,
          'Użyj menu poniżej, aby dodać lub usunąć role. Odznaczenie roli w menu ją usuwa.\nZmiany są natychmiastowe, a potwierdzenie zobaczysz tylko Ty.',
          'Use the menus below to add or remove roles. Unselecting a role removes it.\nChanges are instant and only you will see the confirmation.'));
    } else {
      embed.setTitle(T(ctx, '🎭 Więcej ról', '🎭 More roles'));
    }
    const rows = [];
    batch.forEach((g, index) => {
      const text = SELF_GROUP_TEXT[g.group] ?? SELF_GROUP_TEXT.custom;
      const [title, hint] = text[ctx.lang] ?? text.pl;
      const fullTitle = g.part ? `${title} (${g.part})` : title;
      embed.addFields({ name: `${text.emoji} ${fullTitle}`, value: `${hint}${g.mode === 'single' ? T(ctx, ' *(jedna rola)*', ' *(one role)*') : ''}` });
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`sr:${ctx.lang}:${g.mode === 'single' ? 's' : 'm'}:${i + index}`)
        .setPlaceholder(`${text.emoji} ${fullTitle}`)
        .setMinValues(0)
        .setMaxValues(g.mode === 'single' ? 1 : g.roles.length)
        .addOptions(g.roles.map((r) => {
          const option = { label: truncate(r.label || r.name, 100), value: ctx.roleId(r.key) };
          if (r.emoji) option.emoji = r.emoji;
          return option;
        }));
      rows.push(new ActionRowBuilder().addComponents(menu));
    });
    messages.push({ embeds: [embed], components: rows });
  }
  return messages;
}

// ───────────────────────────── TICKETY ─────────────────────────────

function tickets(ctx) {
  const preset = SERVER_TYPES[ctx.answers.type];
  const supportIds = ctx.blueprint.ticketSupport.map((key) => ctx.roleId(key)).filter(Boolean).slice(0, 4);
  const custom = preset?.ticket;
  const embed = baseEmbed(ctx)
    .setTitle(custom ? tr(custom.title, ctx.lang) : T(ctx, '🎫 Centrum pomocy', '🎫 Help center'))
    .setDescription(custom ? tr(custom.description, ctx.lang) : T(ctx,
      'Potrzebujesz pomocy, chcesz zgłosić użytkownika lub odwołać się od kary?\nKliknij przycisk poniżej – utworzymy **prywatny kanał** widoczny tylko dla Ciebie i ekipy.',
      'Need help, want to report someone or appeal a punishment?\nClick the button below – we will create a **private channel** visible only to you and the staff.'))
    .addFields(
      {
        name: T(ctx, '📌 Kiedy otworzyć zgłoszenie?', '📌 When to open a ticket?'),
        value: T(ctx,
          '• pytania do administracji\n• zgłoszenie użytkownika lub błędu\n• odwołanie od kary\n• współpraca i partnerstwo',
          '• questions for the staff\n• reporting a user or a bug\n• appealing a punishment\n• partnerships'),
        inline: true,
      },
      {
        name: T(ctx, '⚠️ Zasady', '⚠️ Rules'),
        value: T(ctx,
          '• jedno zgłoszenie naraz\n• od razu opisz sprawę\n• bez oznaczania ekipy\n• nadużycia = kara',
          '• one ticket at a time\n• describe the issue right away\n• do not ping staff\n• abuse = punishment'),
        inline: true,
      },
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk:o:${ctx.lang}:${supportIds.join('.')}`)
      .setLabel(custom?.button ? tr(custom.button, ctx.lang) : T(ctx, 'Otwórz zgłoszenie', 'Open a ticket'))
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

// ───────────────────────────── POWITANIE NA CZACIE ─────────────────────────────

function welcomeChat(ctx) {
  const tips = lines(
    ctx.ch('rules') ? T(ctx, `📜 Zacznij od ${ctx.ch('rules')}`, `📜 Start with ${ctx.ch('rules')}`) : null,
    ctx.ch('selfroles') ? T(ctx, `🎭 Wybierz role na ${ctx.ch('selfroles')}`, `🎭 Pick roles in ${ctx.ch('selfroles')}`) : null,
    ctx.ch('introductions') ? T(ctx, `🙋 Przedstaw się na ${ctx.ch('introductions')}`, `🙋 Introduce yourself in ${ctx.ch('introductions')}`) : null,
    ctx.ch('ticketPanel') ? T(ctx, `🎫 Potrzebujesz pomocy? ${ctx.ch('ticketPanel')}`, `🎫 Need help? ${ctx.ch('ticketPanel')}`) : null,
  );
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, `🎉 ${ctx.guildName} oficjalnie wystartował!`, `🎉 ${ctx.guildName} is officially open!`))
    .setDescription(lines(
      T(ctx, 'To jest główny czat serwera – miło Cię widzieć! Rozgość się i zagadaj do innych. 💬', 'This is the main chat – great to see you! Make yourself at home. 💬'),
      tips ? `\n${tips}` : null,
    ));
  return { embeds: [embed] };
}

// ───────────────────────────── PRZEWODNIK EKIPY ─────────────────────────────

function staffGuide(ctx) {
  const staffRoles = ctx.blueprint.roles.filter((r) => r.staff && !r.separator);
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '🛡️ Przewodnik dla ekipy', '🛡️ Staff handbook'))
    .setDescription(T(ctx,
      'Ten kanał widzi tylko ekipa. Poniżej znajdziecie podział ról, uprawnienia i zasady pracy.',
      'Only staff can see this channel. Below you will find roles, permissions and guidelines.'));

  const roleLines = staffRoles.slice(0, 15).map((r) => {
    const level = STAFF_LEVELS[r.level];
    const mention = ctx.role(r.key) || `**${r.name}**`;
    return `${mention}${level ? ` – ${tr(level.short, ctx.lang)}` : ''}`;
  });
  if (roleLines.length) embed.addFields({ name: T(ctx, '👥 Role i uprawnienia', '👥 Roles & permissions'), value: truncate(roleLines.join('\n'), 1024) });

  embed.addFields(
    {
      name: T(ctx, '📋 Zasady pracy', '📋 Guidelines'),
      value: T(ctx,
        '• Reagujemy spokojnie i kulturalnie – jesteśmy wizytówką serwera.\n• Kary stosujemy zgodnie z regulaminem i zapisujemy je w raportach.\n• Przy poważnych sprawach konsultujemy się z wyższą rangą.\n• Nie nadużywamy uprawnień i nie ujawniamy informacji z kanałów ekipy.',
        '• Stay calm and polite – we represent the server.\n• Punish according to the rules and log it in reports.\n• Consult higher ranks on serious matters.\n• Do not abuse permissions or leak staff channels.'),
    },
    {
      name: T(ctx, '✅ Do zrobienia po zbudowaniu serwera', '✅ Post-setup checklist'),
      value: T(ctx,
        '• Nadaj role ekipie (Ustawienia serwera → Członkowie)\n• Przeciągnij rolę bota na samą górę listy ról\n• Dodaj boty (moderacja/logi, poziomy, muzyka) i nadaj im rolę Boty\n• Podepnij boty logujące do kanałów w kategorii Logi\n• Sprawdź regulamin i dopasuj go do siebie',
        '• Assign staff roles (Server Settings → Members)\n• Drag the bot role to the top of the role list\n• Add bots (moderation/logs, levels, music) and give them the Bots role\n• Connect logging bots to the Logs channels\n• Review the rules and adjust them'),
    },
  );
  return { embeds: [embed] };
}

// ───────────────────────────── POZOSTAŁE ─────────────────────────────

function boosts(ctx) {
  const vip = ctx.ch('vipChat');
  const embed = baseEmbed(ctx)
    .setColor(0xf47fff)
    .setTitle(T(ctx, '🚀 Dziękujemy za boosty!', '🚀 Thank you for boosting!'))
    .setDescription(T(ctx,
      'Każdy boost odblokowuje nowe możliwości serwera: lepszą jakość głosu, więcej emoji i naklejek, animowaną ikonę i baner.',
      'Every boost unlocks new perks: better voice quality, more emoji and stickers, animated icon and banner.'))
    .addFields({
      name: T(ctx, '🎁 Nagrody dla boosterów', '🎁 Booster perks'),
      value: lines(
        T(ctx, '• wyróżniająca się rola na liście członków', '• a special role in the member list'),
        vip ? T(ctx, `• dostęp do ${vip}`, `• access to ${vip}`) : null,
        T(ctx, '• nasza dozgonna wdzięczność 💜', '• our eternal gratitude 💜'),
      ),
    });
  return { embeds: [embed] };
}

function partnerships(ctx) {
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '🤝 Partnerstwa', '🤝 Partnerships'))
    .setDescription(T(ctx,
      `Chcesz nawiązać współpracę z **${ctx.guildName}**? Sprawdź wymagania i ${contactStaff(ctx)}.`,
      `Want to partner with **${ctx.guildName}**? Check the requirements and ${contactStaff(ctx)}.`))
    .addFields({
      name: T(ctx, '📋 Wymagania', '📋 Requirements'),
      value: T(ctx,
        '• serwer zgodny z ToS Discorda\n• aktywna społeczność\n• podobna lub powiązana tematyka\n• wzajemna reklama',
        '• server follows Discord ToS\n• active community\n• similar or related topic\n• mutual advertising'),
    });
  return { embeds: [embed] };
}

function suggestions(ctx) {
  return {
    thread: T(ctx, '📌 Jak dodawać propozycje?', '📌 How to post suggestions?'),
    embeds: [baseEmbed(ctx)
      .setTitle(T(ctx, '💡 Jak dodawać propozycje?', '💡 How to post suggestions?'))
      .setDescription(T(ctx,
        '**1.** Sprawdź, czy podobna propozycja już nie istnieje.\n**2.** Jedna propozycja = jeden post.\n**3.** Opisz pomysł i dlaczego warto go wprowadzić.\n**4.** Głosuj reakcjami 👍 / 👎 pod propozycjami innych.\n\nEkipa oznacza status propozycji tagami: *W trakcie analizy*, *Zaakceptowana*, *Wdrożona*, *Odrzucona*.',
        '**1.** Check whether a similar suggestion exists.\n**2.** One suggestion per post.\n**3.** Describe the idea and why it matters.\n**4.** Vote with 👍 / 👎.\n\nStaff marks the status with tags: *Under review*, *Accepted*, *Implemented*, *Rejected*.'))],
  };
}

function qotd(ctx) {
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '❔ Pytanie dnia', '❔ Question of the day'))
    .setDescription(T(ctx,
      'Codziennie ekipa zadaje tu jedno pytanie. Odpowiadaj w **wątku** pod pytaniem!\n\n**Na start:** Jaka jest Twoja ulubiona rzecz na tym serwerze i czego tu brakuje? 🤔',
      'Every day the staff posts a question here. Reply in the **thread** below it!\n\n**To start:** What do you like most about this server and what is missing? 🤔'));
  return { embeds: [embed], thread: T(ctx, 'Odpowiedzi', 'Answers') };
}

function counting(ctx) {
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '🔢 Zasady liczenia', '🔢 Counting rules'))
    .setDescription(T(ctx,
      '• Piszemy kolejne liczby, zaczynając od **1**.\n• Ta sama osoba nie może pisać dwa razy z rzędu.\n• Pomyłka = zaczynamy od nowa!\n• Tylko liczby – bez rozmów.',
      '• Post consecutive numbers starting from **1**.\n• No one can count twice in a row.\n• A mistake resets the count!\n• Numbers only – no chatting.'));
  return { embeds: [embed] };
}

/** Karta informacyjna presetu (IP serwera, linki, jak kupić…). */
function card(ctx, key) {
  const preset = SERVER_TYPES[ctx.answers.type];
  const spec = preset?.cards?.[key];
  if (!spec) return null;
  const values = ctx.answers.special?.info || {};
  if (spec.needs && !values[spec.needs]?.trim()) return null;
  const embed = baseEmbed(ctx).setTitle(tr(spec.title, ctx.lang));
  const description = fill(tr(spec.description, ctx.lang), values);
  if (description && !/\{\w+\}/.test(description)) embed.setDescription(truncate(description, 4000));
  let fields = 0;
  for (const field of spec.fields || []) {
    if (field.needs && !values[field.needs]?.trim()) continue;
    const value = fill(tr(field.value, ctx.lang), values);
    if (/\{\w+\}/.test(value)) continue;
    embed.addFields({ name: tr(field.name, ctx.lang), value: truncate(value, 1024), inline: Boolean(field.inline) });
    fields += 1;
  }
  if (!embed.data.description && !fields) return null;
  return { embeds: [embed] };
}

const RENDERERS = {
  rules, info, faq, verify, selfroles, tickets, welcomeChat, staffGuide, boosts, partnerships, suggestions, qotd, counting,
};

/** Zwraca listę wiadomości do wysłania dla danego rodzaju treści. */
function renderContent(kind, ctx) {
  let result;
  if (kind.startsWith('card:')) result = card(ctx, kind.slice(5));
  else if (RENDERERS[kind]) result = RENDERERS[kind](ctx);
  else return [];
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Rodzaje treści, które użytkownik może włączyć/wyłączyć w kreatorze. */
const CONTENT_OPTIONS = {
  rules: { emoji: '📜', label: 'Regulamin', description: 'Pełny regulamin w #regulamin' },
  info: { emoji: 'ℹ️', label: 'Informacje o serwerze', description: 'Opis, przewodnik po kanałach, ekipa' },
  verify: { emoji: '✅', label: 'Panel weryfikacji', description: 'Przycisk „Zweryfikuj się”' },
  selfroles: { emoji: '🎭', label: 'Panel wyboru ról', description: 'Menu z kolorami, powiadomieniami…' },
  tickets: { emoji: '🎫', label: 'Panel ticketów', description: 'Przycisk tworzący prywatne zgłoszenia' },
  welcomeChat: { emoji: '🎉', label: 'Powitanie na czacie', description: 'Wiadomość startowa na #ogólny' },
  staffGuide: { emoji: '🛡️', label: 'Przewodnik ekipy', description: 'Role, zasady i checklista dla ekipy' },
  faq: { emoji: '❓', label: 'FAQ', description: 'Najczęstsze pytania i odpowiedzi' },
  extras: { emoji: '🗂️', label: 'Pozostałe wiadomości', description: 'Boosty, partnerstwa, propozycje, karty info…' },
};

module.exports = { renderContent, CONTENT_OPTIONS };
