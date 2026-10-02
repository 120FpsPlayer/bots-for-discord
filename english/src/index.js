require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { Client, Events, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const config = require('./lib/config');
const db = require('./lib/db');
const loadCommands = require('./commands');
const handleInteraction = require('./handlers/interactions');
const { runInactivityCheck, refreshPanels, schedulePanelRefresh } = require('./lib/tickets');
const { isStaff } = require('./lib/utils');
const { reportRoles } = require('./lib/permissions');

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in the .env file – copy .env.example to .env and fill it in.');
  process.exit(1);
}

db.load();
const commands = loadCommands();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag} · servers: ${c.guilds.cache.size} · commands: ${commands.size}`);

  reportRoles([...c.guilds.cache.values()], config.ticketTypes);

  if (!['false', '0', 'no'].includes(String(process.env.AUTO_DEPLOY_COMMANDS).toLowerCase())) {
    const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
    const guildId = process.env.GUILD_ID?.trim();
    try {
      if (guildId) await c.application.commands.set(body, guildId);
      else await c.application.commands.set(body);
      console.log(`✅ Registered commands ${guildId ? `on server ${guildId}` : 'globally (may take up to ~1h to appear)'}.`);
    } catch (err) {
      console.error('❌ Failed to register commands:', err.message);
    }
  }

  let presenceIndex = 0;
  const updatePresence = () => {
    const open = db.tickets((x) => x.status === 'open').length;
    const rated = db.tickets((x) => x.rating);
    const avg = rated.length ? rated.reduce((a, x) => a + x.rating.stars, 0) / rated.length : null;
    const statuses = [
      { name: `🎫 ${open} open ${open === 1 ? 'ticket' : 'tickets'}`, type: ActivityType.Watching },
      { name: `📨 ${config.brand.name ?? 'Support'} · /help`, type: ActivityType.Listening },
      ...(avg ? [{ name: `⭐ Support rating ${avg.toFixed(1)}/5`, type: ActivityType.Watching }] : []),
    ];
    c.user.setActivity(statuses[presenceIndex++ % statuses.length]);
  };
  updatePresence();
  setInterval(updatePresence, 60_000);

  const tick = () => runInactivityCheck(c).catch((err) => console.error('[auto-close]', err));
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);

  const panelMinutes = config.defaults.panelRefreshMinutes ?? 5;
  if (panelMinutes > 0) {
    const refresh = () => refreshPanels(c).catch((err) => console.error('[panel]', err));
    setTimeout(refresh, 15_000);
    setInterval(refresh, panelMinutes * 60_000);
  }
});

client.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction, commands));

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;
  const ticket = db.getTicket(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;

  const fromStaff = message.author.id !== ticket.ownerId && isStaff(message.member, config.getType(ticket.typeId));
  const patch = { lastActivity: Date.now(), lastMessageBy: fromStaff ? 'staff' : 'owner', warned: false };
  if (fromStaff && !ticket.firstResponseAt) {
    patch.firstResponseAt = Date.now();
    schedulePanelRefresh(message.guild);
  }
  if (!fromStaff && ticket.closeRequest) patch.closeRequest = null;
  db.updateTicket(message.channel.id, patch);
});

client.on(Events.ChannelDelete, (channel) => {
  const ticket = db.getTicket(channel.id);
  if (ticket && ticket.status !== 'deleted') {
    db.updateTicket(channel.id, { status: 'deleted', deletedAt: Date.now() });
    schedulePanelRefresh(channel.guild);
  }
});

function shutdown() {
  console.log('Saving data and shutting down…');
  db.flush();
  client.destroy().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.DISCORD_TOKEN);
