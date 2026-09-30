'use strict';

const { PermissionFlagsBits } = require('discord.js');

/**
 * Popularne boty Discorda, pod które kreator przygotowuje serwer:
 * kanały (np. #awanse dla bota poziomów), rolę „Boty” z dostępem i linki zaproszeń
 * z wybranym serwerem (kupujący klika tylko „Autoryzuj”).
 * Kreator NIE dodaje ani nie konfiguruje tych botów sam – Discord na to nie pozwala.
 *
 * id – ID aplikacji bota (do linku zaproszenia). Jeśli któryś bot zmieni ID, popraw je tutaj.
 * needs – sekcje (moduły), które kreator doda dla bota; `unless` = pomiń, jeśli jest już podana sekcja.
 * setup – co ustawić w panelu bota ({kanał} zamieniane na wzmiankę kanału po budowie).
 */

const P = PermissionFlagsBits;
const PERMS = {
  base: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.AddReactions, P.UseExternalEmojis],
  levels: [P.ManageRoles],
  moderation: [P.ManageRoles, P.ManageChannels, P.KickMembers, P.BanMembers, P.ModerateMembers, P.ManageMessages, P.ManageNicknames, P.ViewAuditLog, P.ManageWebhooks],
  music: [P.Connect, P.Speak, P.UseVAD],
  tickets: [P.ManageChannels, P.ManageRoles, P.ManageMessages],
  verification: [P.ManageRoles, P.KickMembers, P.ManageMessages],
  stats: [P.ManageChannels, P.Connect],
  giveaways: [P.MentionEveryone],
  events: [P.ManageEvents, P.CreatePublicThreads],
  bump: [P.CreateInstantInvite],
  fun: [],
};

const CATEGORIES = {
  levels: { emoji: '🆙', label: 'Poziomy i XP' },
  moderation: { emoji: '🔨', label: 'Moderacja i logi' },
  welcome: { emoji: '👋', label: 'Powitania' },
  tickets: { emoji: '🎫', label: 'Tickety (zgłoszenia)' },
  verification: { emoji: '✅', label: 'Weryfikacja i ochrona' },
  music: { emoji: '🎵', label: 'Muzyka' },
  stats: { emoji: '📊', label: 'Statystyki' },
  giveaways: { emoji: '🎁', label: 'Konkursy' },
  events: { emoji: '📅', label: 'Wydarzenia' },
  bump: { emoji: '⏫', label: 'Promocja serwera' },
  fun: { emoji: '🎲', label: 'Zabawa i ekonomia' },
};

const bot = (key, name, id, category, emoji, description, site, needs, setup, extraPerms = []) => ({
  key, name, id, category, emoji, description, site, needs, setup,
  permissions: [...PERMS.base, ...(PERMS[category] || []), ...extraPerms],
});

const BOTS = {
  // ───────────── Poziomy
  mee6: bot('mee6', 'MEE6', '159985870458322944', 'levels', '🆙', 'Poziomy, nagrody za aktywność, powitania', 'https://mee6.xyz',
    [{ module: 'botLevelup' }], ['Levels → kanał ogłoszeń awansów: {levelup}', 'Role Rewards → nagrody za poziomy (np. role „Poziom 5/10/20”)']),
  arcane: bot('arcane', 'Arcane', '437808476106784770', 'levels', '🌀', 'Poziomy z kartami rangi i nagrodami', 'https://arcane.bot',
    [{ module: 'botLevelup' }], ['Leveling → kanał awansów: {levelup}', 'Reward roles → role za poziomy']),
  tatsu: bot('tatsu', 'Tatsu', '172002275412279296', 'levels', '🦊', 'Poziomy, reputacja i karty profilu', 'https://tatsu.gg',
    [{ module: 'botLevelup' }], ['Dashboard → Level up → kanał: {levelup}']),

  // ───────────── Moderacja
  dyno: bot('dyno', 'Dyno', '155149108183695360', 'moderation', '🛡️', 'Moderacja, logi, automatyczne role', 'https://dyno.gg',
    [{ module: 'botLogs', unless: 'logs' }], ['Moderation → role moderatorów', 'Action Log → kanał logów: {logMod|botLogs}']),
  carl: bot('carl', 'Carl-bot', '235148962103951360', 'moderation', '🤖', 'Logi, automod, role za reakcje, tagi', 'https://carl.gg',
    [{ module: 'botLogs', unless: 'logs' }], ['Logging → kanały logów: {logMessages|botLogs}', 'Reaction roles → jeśli chcesz role za reakcje (np. w {roleinfo})']),
  yagpdb: bot('yagpdb', 'YAGPDB', '204255221017214977', 'moderation', '📘', 'Moderacja, własne komendy, powiadomienia', 'https://yagpdb.xyz',
    [{ module: 'botLogs', unless: 'logs' }], ['Moderation → kanał logów moderacji: {logMod|botLogs}']),
  wick: bot('wick', 'Wick', '536991182035746816', 'verification', '🧱', 'Ochrona przed raidami i nuke, weryfikacja', 'https://wickbot.com',
    [{ module: 'botLogs', unless: 'logs' }], ['/setup → ochrona serwera (anti-nuke, anti-raid)', 'Logi Wicka → {logServer|botLogs}']),

  // ───────────── Powitania
  probot: bot('probot', 'ProBot', '282859044593598464', 'welcome', '🤖', 'Powitania z grafiką, autorole, poziomy', 'https://probot.io',
    [{ module: 'welcome' }], ['Welcome & Goodbye → kanał powitań: {welcome}', 'Auto Roles → rola dla nowych (jeśli nie masz weryfikacji)']),

  // ───────────── Tickety
  tickettool: bot('tickettool', 'Ticket Tool', '557628352828014614', 'tickets', '🎫', 'Zgłoszenia do ekipy w prywatnych kanałach', 'https://tickettool.xyz',
    [{ module: 'botTickets' }], ['/setup → panel zgłoszeń w kanale {tickets}', 'Support roles → role ekipy', 'Transcripts → kanał {ticketLogs}']),

  // ───────────── Weryfikacja
  doublecounter: bot('doublecounter', 'Double Counter', '703886990948565003', 'verification', '🔐', 'Weryfikacja i blokada multikont', 'https://doublecounter.gg',
    [{ module: 'verification' }], ['Panel → kanał weryfikacji: {verify}', 'Rola po weryfikacji: rola członka serwera']),
  captchabot: bot('captchabot', 'Captcha.bot', '512333785338216465', 'verification', '🧩', 'Weryfikacja captcha przed wejściem', 'https://captcha.bot',
    [{ module: 'verification' }], ['Dashboard → kanał weryfikacji: {verify}', 'Verified role: rola członka serwera']),

  // ───────────── Muzyka
  jockie: bot('jockie', 'Jockie Music', '411916947773587456', 'music', '🎵', 'Muzyka z wielu serwisów, wysoka jakość', 'https://www.jockiemusic.com',
    [{ module: 'music' }], ['Komendy wpisuj w {musicText}, słuchajcie na kanale 🔊 Muzyka']),
  fredboat: bot('fredboat', 'FredBoat', '184405311681986560', 'music', '🎶', 'Prosty bot muzyczny', 'https://fredboat.com',
    [{ module: 'music' }], ['Komendy wpisuj w {musicText}']),

  // ───────────── Statystyki
  statbot: bot('statbot', 'Statbot', '491769129318088714', 'stats', '📈', 'Statystyki aktywności serwera', 'https://statbot.net',
    [], ['Dashboard → statystyki i kanały-liczniki']),
  serverstats: bot('serverstats', 'ServerStats', '458276816071950337', 'stats', '📊', 'Liczniki członków w nazwach kanałów', 'https://serverstatsbot.com',
    [], ['/setup → bot sam utworzy kategorię z licznikami']),

  // ───────────── Konkursy, wydarzenia, promocja
  giveawaybot: bot('giveawaybot', 'GiveawayBot', '294882584201003009', 'giveaways', '🎉', 'Konkursy z losowaniem zwycięzców', 'https://giveawaybot.party',
    [{ module: 'giveaways' }], ['/gcreate w kanale {giveaways}']),
  sesh: bot('sesh', 'Sesh', '616754792965865495', 'events', '📅', 'Kalendarz i zapisy na wydarzenia', 'https://sesh.fyi',
    [{ module: 'events' }], ['/create w kanale {events}', 'Ustaw strefę czasową: Europe/Warsaw']),
  apollo: bot('apollo', 'Apollo', '475744554910351370', 'events', '🗓️', 'Wydarzenia z zapisami i przypomnieniami', 'https://apollo.fyi',
    [{ module: 'events' }], ['/event w kanale {events}']),
  disboard: bot('disboard', 'DISBOARD', '302050872383242240', 'bump', '⏫', 'Promocja serwera na disboard.org (/bump)', 'https://disboard.org',
    [{ module: 'botBump' }], ['Dodaj serwer na disboard.org', 'Co 2 godziny wpisz /bump w {bump}']),

  // ───────────── Zabawa
  dankmemer: bot('dankmemer', 'Dank Memer', '270904126974590976', 'fun', '🐸', 'Ekonomia, minigry i memy', 'https://dankmemer.lol',
    [{ module: 'botGames' }], ['Grajcie w {botGames}']),
  owo: bot('owo', 'OwO', '408785106942164992', 'fun', '🐾', 'Zwierzaki, walki i ekonomia', 'https://owobot.com',
    [{ module: 'botGames' }], ['Grajcie w {botGames}']),
  poketwo: bot('poketwo', 'Pokétwo', '716390085896962058', 'fun', '⚡', 'Łapanie Pokémonów na czacie', 'https://poketwo.net',
    [{ module: 'botGames' }], ['/redirect {botGames} – Pokémony pojawią się tylko tam']),
};

/** Dwa menu wyboru w kreatorze (max 25 opcji każde). */
const BOT_MENUS = {
  a: ['levels', 'moderation', 'welcome', 'tickets', 'verification'],
  b: ['music', 'stats', 'giveaways', 'events', 'bump', 'fun'],
};

/** Suma uprawnień bota (do linku zaproszenia). */
function permissionBits(b) {
  return b.permissions.reduce((acc, p) => acc | p, 0n);
}

/** Link zaproszenia z wybranym serwerem i zablokowanym wyborem serwera. */
function inviteUrl(b, guildId) {
  const q = new URLSearchParams({ client_id: b.id, scope: 'bot applications.commands', permissions: String(permissionBits(b)) });
  if (guildId) {
    q.set('guild_id', guildId);
    q.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${q.toString()}`;
}

/** Zamienia {klucz} i {klucz1|klucz2} na wzmianki kanałów (pierwszy istniejący). */
function fillSetup(line, channelMention) {
  return line.replace(/\{([\w|]+)\}/g, (_, keys) => keys.split('|').map(channelMention).find(Boolean) || '#kanał');
}

module.exports = { BOTS, BOT_CATEGORIES: CATEGORIES, BOT_MENUS, inviteUrl, permissionBits, fillSetup };
