'use strict';

const {
  ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, OAuth2Scopes, PermissionFlagsBits,
} = require('discord.js');
const { config, validateConfig } = require('./config');
const { createLogger } = require('./utils/logger');
const { data: stworzCommand } = require('./commands/stworz');
const { data: usunCommand } = require('./commands/usun');
const { SessionStore } = require('./wizard/sessions');
const { createWizard } = require('./wizard/router');
const { runBuild, handleOriginDelete } = require('./wizard/build');
const { handleUndo } = require('./wizard/undo');
const { createCleanupPanel } = require('./cleanup/panel');
const path = require('node:path');
const { CodeStore, CodeStoreError } = require('./access/codes');
const { startConsole } = require('./access/console');
const { TemplateStore } = require('./access/templates');
const { Notifier } = require('./access/notify');
const { LeaveScheduler } = require('./wizard/leave');
const gfx = require('./graphics/engine');

const log = createLogger('bot');

const problems = validateConfig();
if (problems.length) {
  for (const p of problems) log.error(p);
  log.error('Instrukcja konfiguracji znajduje się w pliku README.md.');
  process.exit(1);
}

// Wystarczy intencja Guilds – bot nie czyta treści wiadomości ani listy członków.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const store = new SessionStore({ timeoutMinutes: config.sessionTimeoutMinutes });
const codes = new CodeStore({ file: config.codesFile });
const templates = new TemplateStore({ dir: path.join(config.dataDir, 'szablony') });
const notifier = new Notifier({ webhookUrl: config.notifyWebhookUrl, channelId: config.notifyChannelId, client });
const leaver = new LeaveScheduler({
  file: path.join(config.dataDir, 'wyjscia.json'),
  client,
  store,
  onLeave: (guild) => notifier.send({ title: '🚪 Bot opuścił serwer', color: 0x99aab5, fields: [{ name: 'Serwer', value: `${guild.name}\n\`${guild.id}\`` }] }),
});
/** Sprzedawcy: SELLER_IDS z .env, a gdy puste – właściciel aplikacji (lub członkowie zespołu) z Developer Portal. */
const sellers = new Set(config.sellerIds);
const isSeller = (userId) => sellers.has(userId);
const wizard = createWizard({ store, config, runBuild, codes, templates, notifier, leaver, isSeller });
const cleanup = createCleanupPanel({ store });
const COMMANDS = [stworzCommand, usunCommand].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  log.info(`Zalogowano jako ${c.user.tag} • serwery: ${c.guilds.cache.size}`);
  c.user.setPresence({ activities: [{ name: 'custom', type: ActivityType.Custom, state: '🛠️ /stworz – zbuduj serwer • 🧹 /usun – wyczyść' }] });

  try {
    if (config.devGuildId) {
      const guild = await c.guilds.fetch(config.devGuildId);
      await guild.commands.set(COMMANDS);
      log.info(`Komendy /stworz i /usun zarejestrowane na serwerze testowym ${guild.name} (działają od razu).`);
    } else {
      await c.application.commands.set(COMMANDS);
      log.info('Komendy /stworz i /usun zarejestrowane globalnie (mogą pojawić się po kilku minutach).');
    }
  } catch (err) {
    log.error('Nie udało się zarejestrować komend:', err);
  }

  if (!sellers.size) {
    try {
      const app = await c.application.fetch();
      const owner = app.owner;
      if (owner?.members) for (const id of owner.members.keys()) sellers.add(id);
      else if (owner?.id) sellers.add(owner.id);
    } catch (err) {
      log.warn(`Nie udało się ustalić właściciela bota (${err.message}) – ustaw SELLER_IDS w .env.`);
    }
  }
  log.info(`👤 Sprzedawcy (bez kodów, zapis szablonów): ${[...sellers].join(', ') || 'brak'}`);
  log.info(`🖼️ Grafika (podgląd, banery, ikony, emoji): ${gfx.available() ? 'działa' : `wyłączona – ${gfx.unavailableReason()}`}`);
  log.info(`📦 Szablony: ${templates.list().length} • 🔔 Powiadomienia: ${notifier.enabled ? 'włączone' : 'wyłączone (NOTIFY_WEBHOOK_URL / NOTIFY_CHANNEL_ID)'}`);
  leaver.restore();

  if (config.requireCode) {
    try {
      const active = codes.list().filter((r) => !r.revokedAt && r.remaining > 0).length;
      log.info(`🔑 Kody dostępu: WŁĄCZONE – aktywnych kodów: ${active}. Wpisz w konsoli „kod”, aby wygenerować nowy (lista komend: „pomoc”).`);
    } catch (err) {
      log.error(err instanceof CodeStoreError ? err.message : `Nie mogę odczytać kodów: ${err.message}`);
    }
  } else {
    log.warn('🔑 Kody dostępu: WYŁĄCZONE (REQUIRE_CODE=false) – każdy administrator może użyć /stworz.');
  }

  const invite = c.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: [PermissionFlagsBits.Administrator],
  });
  log.info(`Link zaproszenia bota:\n  ${invite}`);
});

/** Podpowiedzi w konsoli dla błędów, których przyczyna leży poza kodem bota. */
const ERROR_HINTS = {
  10062: '⏱️ Discord odrzucił odpowiedź, bo od kliknięcia minęły ponad 3 s – hosting jest przeciążony albo ma wolne łącze.',
  40060: '👥 Ta interakcja miała już odpowiedź. Jeśli to się powtarza, sprawdź, czy bot nie jest uruchomiony w dwóch miejscach naraz (ten sam token, np. komputer + Wispbyte).',
};

/** Opóźnienia ostatnich kliknięć (od kliknięcia do dotarcia do bota) – pokazuje je komenda konsoli „test”. */
const stats = { lags: [] };

client.on(Events.InteractionCreate, async (interaction) => {
  // Discord czeka na odpowiedź 3 s od kliknięcia – duże opóźnienie oznacza, że błąd „Coś poszło nie tak” może wynikać z hostingu.
  const lag = Date.now() - interaction.createdTimestamp;
  stats.lags.push(lag);
  if (stats.lags.length > 50) stats.lags.shift();
  if (lag > 2000) log.warn(`⏱️ Interakcja dotarła do bota po ${(lag / 1000).toFixed(1)} s (ping ${client.ws.ping} ms) – hosting albo łącze jest przeciążone.`);
  try {
    if (!interaction.inGuild() || !interaction.guild) {
      if (interaction.isRepliable()) await interaction.reply({ content: 'Tego bota używa się na serwerze.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'stworz') await wizard.start(interaction);
      else if (interaction.commandName === 'usun') await cleanup.start(interaction);
      return;
    }

    if (!('customId' in interaction)) return;
    const prefix = interaction.customId.split(':')[0];
    switch (prefix) {
      case 'wz':
        await wizard.handle(interaction);
        break;
      case 'wzx':
        if (interaction.isButton()) await handleOriginDelete(interaction);
        break;
      case 'wzu':
        if (interaction.isButton()) await handleUndo(interaction, store, codes, { leaver, notifier });
        break;
      case 'cl':
        await cleanup.handle(interaction);
        break;
      case 'wzk':
        await wizard.handleCode(interaction);
        break;
      default:
        break;
    }
  } catch (err) {
    log.error(`Błąd interakcji (${interaction.customId ?? interaction.commandName ?? interaction.type}):`, err);
    if (ERROR_HINTS[err?.code]) log.warn(ERROR_HINTS[err.code]);
    await replyWithError(interaction, err);
  }
});

async function replyWithError(interaction, err) {
  if (!interaction.isRepliable()) return;
  const missing = err?.code === 50013;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(missing ? '🔒 Brak uprawnień bota' : '💥 Coś poszło nie tak')
    .setDescription(missing
      ? 'Bot nie ma wystarczających uprawnień. Upewnij się, że ma uprawnienie **Administrator**, a jego rola jest wysoko na liście ról.'
      : 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie – szczegóły zapisano w konsoli bota.');
  const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    // Interakcja mogła wygasnąć – nic więcej nie zrobimy.
  }
}

client.on(Events.Error, (err) => log.error('Błąd klienta Discord:', err));
client.on(Events.Warn, (msg) => log.warn(msg));
client.on(Events.GuildCreate, (guild) => log.info(`Dodano bota do serwera: ${guild.name} (${guild.id})`));

process.on('unhandledRejection', (err) => log.error('Nieobsłużony błąd (promise):', err));
process.on('uncaughtException', (err) => log.error('Nieobsłużony wyjątek:', err));

function shutdown(signal) {
  log.info(`Otrzymano ${signal} – wyłączam bota…`);
  client.destroy().finally(() => process.exit(0));
}
// Konsola sprzedawcy (Wispbyte: pole „Type a command…” pod konsolą): kod, kody, info, anuluj, pomoc…
startConsole({ codes, client, store, templates, leaver, stats, onStop: () => shutdown('stop') });

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token).catch((err) => {
  if (err?.code === 'TokenInvalid') log.error('Nieprawidłowy token bota – sprawdź DISCORD_TOKEN w pliku .env.');
  else if (String(err?.message).includes('disallowed intents')) log.error('Discord odrzucił intencje bota – sprawdź ustawienia w Developer Portal.');
  else log.error('Nie udało się zalogować:', err);
  process.exit(1);
});
