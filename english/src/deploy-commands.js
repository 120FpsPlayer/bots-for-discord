require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { REST, Routes } = require('discord.js');
const loadCommands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Fill in DISCORD_TOKEN and CLIENT_ID in the .env file');
  process.exit(1);
}

const body = [...loadCommands().values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  const data = await rest.put(route, { body });
  console.log(`✅ Registered ${data.length} commands ${GUILD_ID ? `on server ${GUILD_ID}` : 'globally (propagation up to ~1h)'}.`);
})().catch((err) => {
  console.error('❌ Command registration error:', err);
  process.exit(1);
});
