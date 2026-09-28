// Rejestruje komendy slash. Uruchom po każdej zmianie komend: npm run deploy
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { REST, Routes } = require('discord.js');
const loadCommands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Uzupełnij DISCORD_TOKEN i CLIENT_ID w pliku .env');
  process.exit(1);
}

const body = [...loadCommands().values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  const data = await rest.put(route, { body });
  console.log(`✅ Zarejestrowano ${data.length} komend ${GUILD_ID ? `na serwerze ${GUILD_ID}` : 'globalnie (propagacja do ~1h)'}.`);
})().catch((err) => {
  console.error('❌ Błąd rejestracji komend:', err);
  process.exit(1);
});
