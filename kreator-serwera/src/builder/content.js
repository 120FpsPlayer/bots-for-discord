'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { L, tr, fill } = require('../utils/i18n');
const { SERVER_TYPES } = require('../data/serverTypes');
const { STAFF_LEVELS } = require('../data/roles');
const { verifyButtonId } = require('../features/verification');

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

/** Jak skontaktować się z ekipą – wskazuje konkretną rolę (wzmianka w embedzie nikogo nie pinguje). */
function contactStaff(ctx) {
  const role = ['mod', 'helper', 'admin'].map((key) => ctx.role(key)).find(Boolean);
  return role ? T(ctx, `napisz do osoby z rolą ${role}`, `message someone with the ${role} role`) : T(ctx, 'napisz do administracji', 'contact the staff');
}

// ───────────────────────────── REGULAMIN ─────────────────────────────

/** Style systemu kar do wyboru w kroku „Regulamin i treści”. */
const PUNISHMENT_STYLES = {
  ladder: { emoji: '🪜', label: 'Stopniowanie kar', description: 'Ostrzeżenie → wyciszenie → wyrzucenie → ban' },
  points: { emoji: '🔢', label: 'Punkty ostrzeżeń', description: 'Kary za zebrane punkty, punkty wygasają po 30 dniach' },
  strict: { emoji: '⛔', label: 'Zero tolerancji', description: 'Poważne naruszenia = ban bez ostrzeżenia' },
};

/** Sekcje regulaminu do wyboru. */
const RULE_SECTIONS = {
  general: { emoji: '📋', label: 'Postanowienia ogólne', description: 'ToS Discorda, minimalny wiek, zmiany regulaminu' },
  behaviour: { emoji: '🤝', label: 'Kultura i zachowanie', description: 'Szacunek, spam, trolling, podszywanie się' },
  content: { emoji: '🖼️', label: 'Treści', description: 'NSFW, dane osobowe, scamy, reklama, piractwo' },
  voice: { emoji: '🔊', label: 'Kanały głosowe', description: 'Krzyki, nagrywanie, skakanie po kanałach' },
  profile: { emoji: '🏷️', label: 'Profil i nick', description: 'Nicki, avatary i opisy bez obraźliwych treści' },
  type: { emoji: '⭐', label: 'Zasady typu serwera', description: 'Np. zasady graczy, RP, sklepu, nauki' },
  punishments: { emoji: '⚖️', label: 'Kary i administracja', description: 'System kar, odwołania, omijanie kar' },
};

function punishmentItems(ctx, style) {
  const appeal = contactStaff(ctx);
  if (style === 'points') {
    return T(ctx, [
      'Za łamanie regulaminu otrzymujesz punkty ostrzeżeń (1–5 pkt zależnie od wagi przewinienia).',
      '**3 pkt** – wyciszenie na 1 godzinę • **5 pkt** – wyciszenie na 24 godziny • **7 pkt** – wyrzucenie • **10 pkt** – ban.',
      'Punkty wygasają po 30 dniach bez kolejnych naruszeń.',
      `Decyzje administracji są wiążące. Aby się odwołać, ${appeal}.`,
      'Omijanie kar (np. multikonta) skutkuje permanentnym banem.',
    ], [
      'Breaking the rules gives you warning points (1–5 depending on severity).',
      '**3 pts** – 1 hour timeout • **5 pts** – 24 hour timeout • **7 pts** – kick • **10 pts** – ban.',
      'Points expire after 30 days without new violations.',
      `Staff decisions are binding. To appeal, ${appeal}.`,
      'Evading punishments (e.g. alt accounts) results in a permanent ban.',
    ]);
  }
  if (style === 'strict') {
    return T(ctx, [
      'Nękanie, groźby, treści NSFW, doxxing, scam i rajdy = **natychmiastowy ban bez ostrzeżenia**.',
      'Pozostałe naruszenia: jedno ostrzeżenie, kolejne = ban.',
      `Decyzje administracji są ostateczne. W wyjątkowych sytuacjach ${appeal}.`,
      'Omijanie kar (np. multikonta) skutkuje permanentnym banem wszystkich kont.',
    ], [
      'Harassment, threats, NSFW, doxxing, scams and raids = **instant ban without warning**.',
      'Other violations: one warning, the next one is a ban.',
      `Staff decisions are final. In exceptional cases, ${appeal}.`,
      'Evading punishments (e.g. alt accounts) results in a permanent ban of all accounts.',
    ]);
  }
  return T(ctx, [
    'Stopniowanie kar: ostrzeżenie → wyciszenie (timeout) → wyrzucenie → ban. Przy poważnych przewinieniach administracja może pominąć etapy.',
    `Decyzje administracji są wiążące. Aby się odwołać, ${appeal}.`,
    'Nie oznaczaj administracji bez ważnego powodu.',
    'Omijanie kar (np. multikonta) skutkuje permanentnym banem.',
  ], [
    'Punishment ladder: warning → timeout → kick → ban. Serious offences may skip steps.',
    `Staff decisions are binding. To appeal, ${appeal}.`,
    'Do not ping staff without a good reason.',
    'Evading punishments (e.g. alt accounts) results in a permanent ban.',
  ]);
}

/**
 * Pakuje pola embedów w wiadomości tak, żeby zmieścić się w limitach Discorda
 * (6000 znaków na wszystkie embedy wiadomości, 25 pól na embed).
 */
function packFields(ctx, fields, { title, description, footer }) {
  const messages = [];
  let embed = null;
  let size = 0;
  for (const f of fields) {
    const len = f.name.length + f.value.length;
    if (!embed || size + len > 5000 || embed.data.fields?.length >= 24) {
      embed = baseEmbed(ctx);
      size = 0;
      if (!messages.length) {
        embed.setTitle(title);
        if (description) embed.setDescription(description);
        size = title.length + (description?.length || 0);
      }
      if (footer) embed.setFooter({ text: footer });
      messages.push({ embeds: [embed] });
    }
    embed.addFields(f);
    size += len;
  }
  return messages;
}

function rules(ctx) {
  const { answers } = ctx;
  const texts = answers.texts || {};
  const chosen = new Set(texts.ruleSections || Object.keys(RULE_SECTIONS));
  const preset = SERVER_TYPES[answers.type];
  const minAge = Number(answers.age) || 13;
  const announcements = ctx.ch('announcements') || ctx.ch('changelog') || T(ctx, 'kanale ogłoszeń', 'the announcements channel');
  const nsfwAllowed = Boolean(ctx.ch('nsfw'));

  const sections = [];
  if (chosen.has('general')) {
    sections.push({
      name: T(ctx, 'Postanowienia ogólne', 'General'),
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
    });
  }
  if (chosen.has('behaviour')) {
    sections.push({
      name: T(ctx, 'Kultura i zachowanie', 'Behaviour'),
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
    });
  }
  if (chosen.has('content')) {
    sections.push({
      name: T(ctx, 'Treści', 'Content'),
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
    });
  }
  if (chosen.has('voice') && ctx.blueprint.stats.voice > 0) {
    sections.push({
      name: T(ctx, 'Kanały głosowe', 'Voice channels'),
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
  if (chosen.has('profile')) {
    sections.push({
      name: T(ctx, 'Profil i nick', 'Profile & nickname'),
      items: T(ctx, [
        'Nick, avatar, status i opis nie mogą zawierać treści obraźliwych, NSFW ani reklam.',
        'Nick musi dać się oznaczyć – bez samych znaków specjalnych.',
      ], [
        'Nickname, avatar, status and bio must not be offensive, NSFW or contain ads.',
        'Your nickname must be mentionable – no special-characters-only names.',
      ]),
    });
  }
  if (chosen.has('type') && preset?.rules) {
    sections.push({ name: tr(preset.rules.title, ctx.lang), items: preset.rules.items[ctx.lang] ?? preset.rules.items.pl });
  }
  const custom = (texts.customRules || []).filter(Boolean);
  if (custom.length) sections.push({ name: T(ctx, 'Zasady dodatkowe', 'Additional rules'), items: custom });
  if (chosen.has('punishments')) {
    sections.push({ name: T(ctx, 'Kary i administracja', 'Punishments & staff'), items: punishmentItems(ctx, texts.punishments) });
  }
  if (!sections.length) return null;

  // Treść paragrafu może przekroczyć 1024 znaki – dzielimy go wtedy na kolejne pola „(cd.)”.
  const fields = [];
  sections.forEach((section, index) => {
    const name = `§${index + 1} • ${section.name}`;
    let chunk = '';
    let part = 0;
    section.items.forEach((item, i) => {
      const line = `**${i + 1}.** ${truncate(item, 1000)}`;
      if (chunk && chunk.length + line.length + 1 > 1024) {
        fields.push({ name: part ? `${name} ${T(ctx, '(cd.)', '(cont.)')}` : name, value: chunk });
        chunk = '';
        part += 1;
      }
      chunk = chunk ? `${chunk}\n${line}` : line;
    });
    if (chunk) fields.push({ name: part ? `${name} ${T(ctx, '(cd.)', '(cont.)')}` : name, value: chunk });
  });
  return packFields(ctx, fields, {
    title: T(ctx, `📜 Regulamin serwera ${ctx.guildName}`, `📜 ${ctx.guildName} rules`),
    description: T(ctx,
      'Prosimy o uważne zapoznanie się z zasadami. Dzięki nim serwer jest bezpiecznym i przyjaznym miejscem dla wszystkich. 💙',
      'Please read the rules carefully. They keep this server safe and friendly for everyone. 💙'),
    footer: T(ctx, `Regulamin obowiązuje od ${ctx.date}`, `Rules effective since ${ctx.date}`),
  });
}

/** Pierwsze ogłoszenie napisane przez użytkownika w kreatorze. */
function announcement(ctx) {
  const a = ctx.answers.texts?.announcement;
  if (!a?.text?.trim()) return null;
  const embed = baseEmbed(ctx)
    .setTitle(truncate(a.title?.trim() || T(ctx, `📢 Witamy na ${ctx.guildName}!`, `📢 Welcome to ${ctx.guildName}!`), 256))
    .setDescription(truncate(a.text.trim(), 4000));
  let content;
  const allowedMentions = { parse: [] };
  if (a.ping === 'everyone') {
    content = '@everyone';
    allowedMentions.parse = ['everyone'];
  } else if (a.ping === 'role' && ctx.roleId('n_announcements')) {
    content = `<@&${ctx.roleId('n_announcements')}>`;
    allowedMentions.roles = [ctx.roleId('n_announcements')];
  }
  return { content, embeds: [embed], allowedMentions };
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
    ['roleinfo', T(ctx, 'role na serwerze i jak je zdobyć', 'server roles and how to get them')],
    ['general', T(ctx, 'główny czat', 'main chat')],
    ['introductions', T(ctx, 'przedstaw się społeczności', 'introduce yourself')],
    ['suggestions', T(ctx, 'zgłoś pomysł na ulepszenie serwera', 'suggest improvements')],
    ['botcmds', T(ctx, 'komendy botów', 'bot commands')],
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
    ['Jak zdobyć rolę?', ctx.ch('roleinfo') ? `Opis wszystkich ról i sposób ich zdobycia znajdziesz na ${ctx.ch('roleinfo')}. Role nadaje administracja.` : 'Role nadaje administracja.'],
    ['Nie widzę kanałów – co robić?', ctx.ch('verify') ? `Zweryfikuj się na ${ctx.ch('verify')}. Jeśli dalej nic nie widzisz, ${contactStaff(ctx)}.` : `Upewnij się, że masz odpowiednią rolę. W razie problemów ${contactStaff(ctx)}.`],
    ['Jak zgłosić użytkownika?', `Zrób zrzut ekranu i ${contactStaff(ctx)}. Nie rób „samosądów” na czacie.`],
    ['Jak dołączyć do ekipy?', 'Śledź ogłoszenia – informujemy o rekrutacjach. Najlepszą rekomendacją jest aktywność i kultura.'],
    ['Czy mogę zareklamować swój serwer?', ctx.ch('partnerships') ? `Tylko w ramach partnerstwa – szczegóły na ${ctx.ch('partnerships')}.` : 'Nie, reklama bez zgody administracji jest zabroniona.'],
    ['Otrzymałem karę – co teraz?', `Przeczytaj regulamin${ctx.ch('rules') ? ` (${ctx.ch('rules')})` : ''}. Jeśli uważasz, że kara była niesłuszna, ${contactStaff(ctx)}.`],
  ], [
    ['How do I get roles?', ctx.ch('roleinfo') ? `All roles and how to get them are described in ${ctx.ch('roleinfo')}. Roles are given by staff.` : 'Roles are given by staff.'],
    ['I can\'t see channels – what now?', ctx.ch('verify') ? `Verify in ${ctx.ch('verify')}. If it still doesn't work, ${contactStaff(ctx)}.` : `Make sure you have the right role, or ${contactStaff(ctx)}.`],
    ['How do I report someone?', `Take a screenshot and ${contactStaff(ctx)}.`],
    ['How do I join the staff?', 'Watch the announcements for applications. Activity and good manners are the best recommendation.'],
    ['Can I advertise my server?', ctx.ch('partnerships') ? `Only via partnership – see ${ctx.ch('partnerships')}.` : 'No, advertising without permission is not allowed.'],
    ['I got punished – what now?', `Read the rules. If you think it was unfair, ${contactStaff(ctx)}.`],
  ]);
  const custom = (ctx.answers.texts?.customFaq || []).map((e) => [e.q, e.a]);
  const entries = ctx.answers.texts?.faqDefaults === false && custom.length ? custom : [...qa, ...custom];
  return packFields(ctx, entries.map(([q, a]) => ({ name: truncate(`❔ ${q}`, 256), value: truncate(a, 1024) })), {
    title: T(ctx, '❓ Najczęściej zadawane pytania', '❓ Frequently asked questions'),
    description: T(ctx, 'Nie znalazłeś odpowiedzi? Zapytaj na czacie lub skontaktuj się z ekipą.', 'Can\'t find an answer? Ask in chat or contact the staff.'),
  });
}

// ───────────────────────────── WERYFIKACJA ─────────────────────────────

function verify(ctx) {
  const roleId = ctx.roleId('member');
  if (!roleId) return null;
  const v = ctx.blueprint.meta.verify || {};
  const steps = [
    T(ctx, `Przeczytaj ${ctx.ch('rules') || 'regulamin'}`, `Read ${ctx.ch('rules') || 'the rules'}`),
    T(ctx, 'Kliknij przycisk **Zweryfikuj się** poniżej', 'Click **Verify** below'),
  ];
  if (v.captcha) steps.push(T(ctx, 'Odpowiedz na krótkie pytanie kontrolne (ochrona przed botami)', 'Answer a short check question (bot protection)'));
  const embed = baseEmbed(ctx)
    .setTitle(T(ctx, '✅ Weryfikacja', '✅ Verification'))
    .setDescription(T(ctx,
      `Witaj na serwerze **${ctx.guildName}**! 👋\n\nAby uzyskać dostęp do wszystkich kanałów:\n${steps.map((st, i) => `**${i + 1}.** ${st}`).join('\n')}\n\nKlikając przycisk, potwierdzasz, że akceptujesz regulamin serwera.`,
      `Welcome to **${ctx.guildName}**! 👋\n\nTo access all channels:\n${steps.map((st, i) => `**${i + 1}.** ${st}`).join('\n')}\n\nBy clicking you confirm that you accept the server rules.`))
    .setFooter({ text: T(ctx, 'Masz problem z weryfikacją? Napisz do administracji.', 'Trouble verifying? Contact the staff.') });
  if (v.minAgeDays) {
    embed.addFields({
      name: T(ctx, '🛡️ Wymagania', '🛡️ Requirements'),
      value: T(ctx, `Twoje konto Discord musi mieć co najmniej **${v.minAgeDays} ${v.minAgeDays === 1 ? 'dzień' : 'dni'}**.`, `Your Discord account must be at least **${v.minAgeDays} day${v.minAgeDays === 1 ? '' : 's'}** old.`),
    });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(verifyButtonId(ctx.lang, roleId, {
        captcha: Boolean(v.captcha),
        minAgeDays: v.minAgeDays || 0,
        logChannelId: v.logChannel ? ctx.channelId(v.logChannel) : null,
      }))
      .setLabel(T(ctx, 'Zweryfikuj się', 'Verify'))
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// ───────────────────────────── OPIS RÓL ─────────────────────────────

/** Nagłówki grup ról w opisie (klucz = sekcja roli albo grupa „o mnie”). */
const ROLE_SECTION_TEXT = {
  staff: { emoji: '🛡️', pl: 'Ekipa', en: 'Staff' },
  special: { emoji: '⭐', pl: 'Role specjalne', en: 'Special roles', hint: L('nadaje ekipa (zasługi, wsparcie, partnerstwo)', 'given by staff (merit, support, partnership)') },
  access: { emoji: '🔒', pl: 'Dostęp', en: 'Access', hint: L('dają dostęp do prywatnych kanałów – nadaje ekipa', 'unlock private channels – given by staff') },
  members: { emoji: '✅', pl: 'Członkowie', en: 'Members' },
  levels: { emoji: '📈', pl: 'Poziomy', en: 'Levels', hint: L('zdobywasz je za aktywność na serwerze', 'earned by being active') },
  colors: { emoji: '🎨', pl: 'Kolory nicku', en: 'Name colors' },
  items: { emoji: '⭐', pl: 'Zainteresowania', en: 'Interests' },
  notifications: { emoji: '🔔', pl: 'Powiadomienia', en: 'Notifications', hint: L('dostajesz pingi o wybranych sprawach', 'get pinged about selected topics') },
  age: { emoji: '🎂', pl: 'Wiek', en: 'Age' },
  pronouns: { emoji: '💬', pl: 'Zaimki', en: 'Pronouns' },
  platform: { emoji: '🎮', pl: 'Platformy', en: 'Platforms' },
  region: { emoji: '📍', pl: 'Region', en: 'Region' },
  custom: { emoji: '✨', pl: 'Dodatkowe', en: 'Extra' },
};

const ROLE_SECTION_ORDER = ['staff', 'special', 'access', 'members', 'levels', 'colors', 'items', 'notifications', 'age', 'pronouns', 'platform', 'region', 'custom'];

/** Tekstowy opis ról serwera (bez przycisków i menu – role nadaje ekipa). */
function rolesInfo(ctx) {
  const preset = SERVER_TYPES[ctx.answers.type];
  const groups = new Map();
  for (const role of ctx.blueprint.roles) {
    if (role.separator || !ctx.role(role.key)) continue;
    const key = role.section === 'about' ? role.self?.group : role.section;
    if (!ROLE_SECTION_TEXT[key]) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(role);
  }
  if (!groups.size) return null;

  const fields = [];
  for (const key of ROLE_SECTION_ORDER) {
    const roles = groups.get(key);
    if (!roles) continue;
    const text = ROLE_SECTION_TEXT[key];
    let title = text[ctx.lang] ?? text.pl;
    if ((key === 'items' || key === 'access') && preset?.list) title = tr(preset.list.category, ctx.lang);
    let value;
    if (key === 'staff') {
      value = roles.map((r) => `${ctx.role(r.key)} – ${tr(STAFF_LEVELS[r.level]?.short, ctx.lang)}`).join('\n');
    } else if (key === 'members') {
      value = `${roles.map((r) => ctx.role(r.key)).join(' ')} – ${ctx.blueprint.meta.gate
        ? T(ctx, `dostajesz ją po weryfikacji${ctx.ch('verify') ? ` na ${ctx.ch('verify')}` : ''}`, `you get it after verifying${ctx.ch('verify') ? ` in ${ctx.ch('verify')}` : ''}`)
        : T(ctx, 'podstawowa rola członka społeczności', 'the basic member role')}`;
    } else {
      value = roles.map((r) => ctx.role(r.key)).join(' ');
      if (text.hint) value += `\n*${tr(text.hint, ctx.lang)}*`;
    }
    fields.push({ name: `${text.emoji} ${title}`, value: truncate(value, 1024) });
  }
  fields.push({
    name: T(ctx, 'ℹ️ Jak zdobyć rolę?', 'ℹ️ How to get a role?'),
    value: T(ctx,
      `Role ekipy i role specjalne nadaje administracja. Jeśli chcesz dostać rolę z listy (np. kolor, powiadomienia, zainteresowania), ${contactStaff(ctx)}.`,
      `Staff and special roles are given by the administration. If you want a role from the list (e.g. a color, notifications, interests), ${contactStaff(ctx)}.`),
  });

  // Limit Discorda: 6000 znaków na wszystkie embedy jednej wiadomości – w razie potrzeby dzielimy na kilka.
  const messages = [];
  let embed = null;
  let size = 0;
  for (const f of fields) {
    const len = f.name.length + f.value.length;
    if (!embed || size + len > 5000 || embed.data.fields?.length >= 20) {
      embed = baseEmbed(ctx);
      if (!messages.length) {
        embed.setTitle(T(ctx, '🎭 Role na serwerze', '🎭 Server roles'))
          .setDescription(T(ctx, 'Kto jest kim na serwerze i jak zdobyć poszczególne role.', 'Who is who on the server and how to get each role.'));
        size = 100;
      } else {
        size = 0;
      }
      messages.push({ embeds: [embed] });
    }
    embed.addFields(f);
    size += len;
  }
  return messages;
}

// ───────────────────────────── POWITANIE NA CZACIE ─────────────────────────────

function welcomeChat(ctx) {
  const tips = lines(
    ctx.ch('rules') ? T(ctx, `📜 Zacznij od ${ctx.ch('rules')}`, `📜 Start with ${ctx.ch('rules')}`) : null,
    ctx.ch('roleinfo') ? T(ctx, `🎭 Sprawdź role na ${ctx.ch('roleinfo')}`, `🎭 Check the roles in ${ctx.ch('roleinfo')}`) : null,
    ctx.ch('introductions') ? T(ctx, `🙋 Przedstaw się na ${ctx.ch('introductions')}`, `🙋 Introduce yourself in ${ctx.ch('introductions')}`) : null,
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
  rules, info, faq, verify, rolesInfo, welcomeChat, staffGuide, boosts, partnerships, suggestions, qotd, counting, announcement,
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
  rolesInfo: { emoji: '🎭', label: 'Opis ról', description: 'Lista ról serwera i jak je zdobyć (tekst)' },
  welcomeChat: { emoji: '🎉', label: 'Powitanie na czacie', description: 'Wiadomość startowa na #ogólny' },
  staffGuide: { emoji: '🛡️', label: 'Przewodnik ekipy', description: 'Role, zasady i checklista dla ekipy' },
  faq: { emoji: '❓', label: 'FAQ', description: 'Najczęstsze pytania i odpowiedzi' },
  extras: { emoji: '🗂️', label: 'Pozostałe wiadomości', description: 'Boosty, partnerstwa, propozycje, karty info…' },
};

module.exports = { renderContent, CONTENT_OPTIONS, RULE_SECTIONS, PUNISHMENT_STYLES };
