'use strict';

/** Poziomy weryfikacji Discorda (Ustawienia serwera → Bezpieczeństwo). */
const VERIFICATION_LEVELS = [
  { value: 0, emoji: '🔓', label: 'Brak', description: 'Bez ograniczeń' },
  { value: 1, emoji: '📧', label: 'Niski', description: 'Zweryfikowany e-mail' },
  { value: 2, emoji: '⏱️', label: 'Średni', description: 'E-mail + konto starsze niż 5 minut' },
  { value: 3, emoji: '🛡️', label: 'Wysoki', description: 'Jak średni + 10 minut na serwerze' },
  { value: 4, emoji: '📱', label: 'Najwyższy', description: 'Zweryfikowany numer telefonu' },
];

/** Filtr treści multimedialnych. */
const CONTENT_FILTERS = [
  { value: 0, emoji: '⚪', label: 'Wyłączony', description: 'Nie skanuj multimediów' },
  { value: 1, emoji: '🟡', label: 'Członkowie bez ról', description: 'Skanuj multimedia osób bez ról' },
  { value: 2, emoji: '🟢', label: 'Wszyscy członkowie', description: 'Skanuj multimedia wszystkich (zalecane)' },
];

/** Domyślne powiadomienia. */
const NOTIFICATION_OPTIONS = [
  { value: 'mentions', emoji: '🔔', label: 'Tylko @wzmianki (zalecane)', description: 'Mniej spamu dla członków' },
  { value: 'all', emoji: '📣', label: 'Wszystkie wiadomości', description: 'Tylko dla małych serwerów' },
];

/** Reguły AutoMod, które kreator może utworzyć. */
const AUTOMOD_OPTIONS = {
  spam: { emoji: '🚫', label: 'Blokada spamu', description: 'Discord wykrywa i blokuje podejrzany spam' },
  mentions: { emoji: '📢', label: 'Limit wzmianek', description: 'Blokuje masowe oznaczanie + ochrona przed raidem' },
  scam: { emoji: '🎣', label: 'Oszustwa i fałszywe Nitro', description: 'Blokuje typowe scamy „free nitro”' },
  invites: { emoji: '🔗', label: 'Blokada zaproszeń Discord', description: 'Blokuje linki discord.gg (ekipa i partnerzy mogą)' },
  presetProfanity: { emoji: '🤬', label: 'Wulgaryzmy (lista Discorda)', description: 'Wbudowana lista przekleństw (angielska)' },
  polishProfanity: { emoji: '🇵🇱', label: 'Polskie wulgaryzmy', description: 'Filtr najczęstszych polskich przekleństw' },
  presetSlurs: { emoji: '⛔', label: 'Obelgi i mowa nienawiści', description: 'Wbudowana lista obelg Discorda' },
  presetSexual: { emoji: '🔞', label: 'Treści seksualne', description: 'Wbudowana lista treści seksualnych' },
};

/** Polskie wulgaryzmy – wzorce z * (dowolne znaki). Dobrane tak, by ograniczyć fałszywe alarmy. */
const POLISH_PROFANITY = [
  '*kurw*', 'chuj*', '*chuja*', '*chuje*', 'huj', 'huja', 'hujowy', 'hujnia',
  '*jeban*', '*jebac*', '*jebać*', '*jebie*', '*jebię*', 'jebn*', 'wyjeb*', 'zajeb*', 'pojeb*', 'rozjeb*',
  '*pierdol*', '*pierdal*', '*skurwy*', '*skurwi*', 'pizd*', 'cipa', 'cipo', 'cipy', 'cwel*', 'kutas*', 'dziwk*',
  'szmata', 'szmato', 'spierdal*', 'wypierdal*', 'zjeb*',
];

/** Frazy typowych oszustw na Discordzie. */
const SCAM_KEYWORDS = [
  '*free nitro*', '*darmowe nitro*', '*nitro za darmo*', '*nitro giveaway*', '*discord-nitro*', '*nitro-gift*',
  '*discordgift*', '*dlscord*', '*discorcl*', '*steamcommunlty*', '*steamcomrnunity*', '*free steam gift*',
  '*i accidentally reported you*', '*przypadkowo cię zgłosiłem*',
];

/** Regex zaproszeń Discord (składnia Rust, używana przez AutoMod). */
const INVITE_REGEX = '(?i)(discord\\.(gg|io|me|li)|discord(app)?\\.com/invite|dsc\\.gg)/[a-z0-9-]+';

module.exports = {
  VERIFICATION_LEVELS,
  CONTENT_FILTERS,
  NOTIFICATION_OPTIONS,
  AUTOMOD_OPTIONS,
  POLISH_PROFANITY,
  SCAM_KEYWORDS,
  INVITE_REGEX,
};
