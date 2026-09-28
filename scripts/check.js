// Szybka walidacja bez łączenia z Discordem: config, komendy, panel i formularze.
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));

const config = require('../src/lib/config');
const loadCommands = require('../src/commands');
const { buildPanel, buildForm } = require('../src/lib/tickets');

const commands = loadCommands();
for (const [name, cmd] of commands) {
  cmd.data.toJSON();
  console.log(`✔ komenda /${name}`);
}
for (const style of ['buttons', 'select']) {
  const panel = buildPanel(style);
  panel.embeds.forEach((e) => e.toJSON());
  panel.components.forEach((c) => c.toJSON());
  console.log(`✔ panel (${style})`);
}
for (const type of config.ticketTypes) {
  if (type.questions.length) buildForm(type, 'b').toJSON();
  console.log(`✔ typ "${type.id}" (${type.questions.length} pytań)`);
}
console.log('\nWszystko OK ✅');
