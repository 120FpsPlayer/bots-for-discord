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
const { CodeStore, CodeStoreError } = require('./access/codes');
const { startConsole } = require('./access/console');

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
const wizard = createWizard({ store, config, runBuild, codes });
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

client.on(Events.InteractionCreate, async (interaction) => {
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
        if (interaction.isButton()) await handleUndo(interaction, store, codes);
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
startConsole({ codes, client, store, onStop: () => shutdown('stop') });

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token).catch((err) => {
  if (err?.code === 'TokenInvalid') log.error('Nieprawidłowy token bota – sprawdź DISCORD_TOKEN w pliku .env.');
  else if (String(err?.message).includes('disallowed intents')) log.error('Discord odrzucił intencje bota – sprawdź ustawienia w Developer Portal.');
  else log.error('Nie udało się zalogować:', err);
  process.exit(1);
});
