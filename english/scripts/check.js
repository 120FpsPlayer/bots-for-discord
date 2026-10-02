const path = require('node:path');
process.chdir(path.join(__dirname, '..'));

const config = require('../src/lib/config');
const loadCommands = require('../src/commands');
const ui = require('../src/lib/ui');
const { buildForm } = require('../src/lib/tickets');

const fakeGuild = { id: '0', name: 'Test', iconURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
const fakeUser = { createdAt: new Date(), displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };

function count(list) {
  let n = 0;
  for (const c of list) {
    n += 1;
    if (c.components) n += count(c.components);
    if (c.accessory) n += 1;
    if (c.items) n += 0;
  }
  return n;
}

function validate(name, payload) {
  const json = payload.components.map((c) => (c.toJSON ? c.toJSON() : c));
  const total = count(json);
  if (total > 40) throw new Error(`${name}: ${total} components (limit 40)`);
  const textLen = JSON.stringify(json).match(/"content":"(?:[^"\\]|\\.)*"/g)?.join('').length ?? 0;
  if (textLen > 4000 + 200) throw new Error(`${name}: too much text (${textLen})`);
  console.log(`✔ ${name} (${total} components)`);
}

const commands = loadCommands();
for (const [name, cmd] of commands) {
  cmd.data.toJSON();
  console.log(`✔ command /${name}`);
}
for (const style of ['buttons', 'select']) validate(`panel (${style})`, ui.panelPayload(fakeGuild, style));

const ticket = {
  number: 1,
  ownerId: '1',
  typeId: config.ticketTypes[0].id,
  priority: 'normal',
  status: 'open',
  claimedBy: null,
  participants: ['2', '3'],
  createdAt: Date.now(),
  answers: config.ticketTypes[0].questions.map((q) => ({ label: q.label, value: 'x'.repeat(q.maxLength ?? 100) })),
};
validate('ticket card', ui.ticketCard(ticket, config.ticketTypes[0], { ownerUser: fakeUser, pingRoles: ['5'] }));
validate('closed card', ui.closedCard({ ...ticket, closedAt: Date.now() }, '1', { messageCount: 3, transcriptUrl: 'https://x.y' }));
validate('close request', ui.closeRequestCard(ticket, '2'));
validate('inactivity warning', ui.inactivityWarning(ticket, Date.now()));

for (const type of config.ticketTypes) {
  if (type.questions.length) buildForm(type, 'b').toJSON();
  console.log(`✔ type "${type.id}" (${type.questions.length} questions)`);
}
console.log(`✔ canned replies: ${config.snippets.length}`);
console.log('\nAll good ✅');
