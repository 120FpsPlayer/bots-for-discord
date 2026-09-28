require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { Client, Events, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const config = require('./lib/config');
const db = require('./lib/db');
const loadCommands = require('./commands');
const handleInteraction = require('./handlers/interactions');
const { runInactivityCheck } = require('./lib/tickets');
const { isStaff } = require('./lib/utils');

if (!process.env.DISCORD_TOKEN) {
  console.error('Brak DISCORD_TOKEN w pliku .env – skopiuj .env.example do .env i uzupełnij.');
  process.exit(1);
}

db.load();
const commands = loadCommands();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Zalogowano jako ${c.user.tag} · serwery: ${c.guilds.cache.size} · komendy: ${commands.size}`);

  // automatyczna rejestracja komend slash (wyłącz: AUTO_DEPLOY_COMMANDS=false)
  if (!['false', '0', 'nie'].includes(String(process.env.AUTO_DEPLOY_COMMANDS).toLowerCase())) {
    const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
    const guildId = process.env.GUILD_ID?.trim();
    try {
      if (guildId) await c.application.commands.set(body, guildId);
      else await c.application.commands.set(body);
      console.log(`✅ Zarejestrowano komendy ${guildId ? `na serwerze ${guildId}` : 'globalnie (mogą pojawić się po ~1h)'}.`);
    } catch (err) {
      console.error('❌ Nie udało się zarejestrować komend:', err.message);
    }
  }

  c.user.setActivity({ name: `🎫 ${config.brand.name ?? 'Tickety'}`, type: ActivityType.Watching });

  const tick = () => runInactivityCheck(c).catch((err) => console.error('[auto-close]', err));
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
});

client.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction, commands));

// śledzenie aktywności – potrzebne do statystyk i auto-zamykania
client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;
  const ticket = db.getTicket(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;

  const fromStaff = message.author.id !== ticket.ownerId && isStaff(message.member, config.getType(ticket.typeId));
  const patch = { lastActivity: Date.now(), lastMessageBy: fromStaff ? 'staff' : 'owner', warned: false };
  if (fromStaff && !ticket.firstResponseAt) patch.firstResponseAt = Date.now();
  db.updateTicket(message.channel.id, patch);
});

// ktoś usunął kanał ticketu ręcznie
client.on(Events.ChannelDelete, (channel) => {
  const ticket = db.getTicket(channel.id);
  if (ticket && ticket.status !== 'deleted') db.updateTicket(channel.id, { status: 'deleted', deletedAt: Date.now() });
});

function shutdown() {
  console.log('Zapisywanie danych i wyłączanie…');
  db.flush();
  client.destroy().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.DISCORD_TOKEN);
