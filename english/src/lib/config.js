const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

function load() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  if (!Array.isArray(raw.ticketTypes) || raw.ticketTypes.length === 0) {
    throw new Error('config.json: "ticketTypes" must contain at least one ticket type.');
  }
  if (raw.ticketTypes.length > 25) {
    throw new Error('config.json: a maximum of 25 ticket types is allowed (Discord limit).');
  }

  const ids = new Set();
  for (const type of raw.ticketTypes) {
    if (!type.id || !/^[a-z0-9_-]{1,32}$/.test(type.id)) {
      throw new Error(`config.json: invalid type id "${type.id}" (allowed: a-z, 0-9, _ and -).`);
    }
    if (ids.has(type.id)) throw new Error(`config.json: duplicate type id "${type.id}".`);
    ids.add(type.id);

    type.questions ??= [];
    type.staffRoleIds ??= [];
    type.channelPrefix ??= type.id;
    if (type.questions.length > 5) {
      throw new Error(`config.json: type "${type.id}" has more than 5 questions (Discord form limit).`);
    }
  }

  raw.snippets ??= [];
  for (const s of raw.snippets) {
    if (!s.id || !s.content) throw new Error('config.json: every canned reply (snippets) must have an "id" and "content".');
    s.name ??= s.id;
  }
  raw.panel ??= {};
  raw.panel.rules ??= [];
  raw.workingHours ??= { enabled: false };
  raw.channelNameFormat ??= '{prio}{prefix}-{number}';

  raw.brand ??= {};
  raw.brand.colorInt = parseInt(String(raw.brand.color ?? '#5865F2').replace('#', ''), 16);
  raw.defaults ??= {};
  return raw;
}

const config = load();

config.getType = (id) => config.ticketTypes.find((t) => t.id === id) ?? null;

module.exports = config;
