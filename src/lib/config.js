const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

function load() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  if (!Array.isArray(raw.ticketTypes) || raw.ticketTypes.length === 0) {
    throw new Error('config.json: "ticketTypes" musi zawierać co najmniej jeden typ ticketu.');
  }
  if (raw.ticketTypes.length > 25) {
    throw new Error('config.json: maksymalnie 25 typów ticketów (limit Discorda).');
  }

  const ids = new Set();
  for (const type of raw.ticketTypes) {
    if (!type.id || !/^[a-z0-9_-]{1,32}$/.test(type.id)) {
      throw new Error(`config.json: niepoprawne id typu "${type.id}" (dozwolone: a-z, 0-9, _ i -).`);
    }
    if (ids.has(type.id)) throw new Error(`config.json: zduplikowane id typu "${type.id}".`);
    ids.add(type.id);

    type.questions ??= [];
    type.staffRoleIds ??= [];
    type.channelPrefix ??= type.id;
    if (type.questions.length > 5) {
      throw new Error(`config.json: typ "${type.id}" ma więcej niż 5 pytań (limit formularza Discorda).`);
    }
  }

  raw.brand ??= {};
  raw.brand.colorInt = parseInt(String(raw.brand.color ?? '#5865F2').replace('#', ''), 16);
  raw.defaults ??= {};
  return raw;
}

const config = load();

config.getType = (id) => config.ticketTypes.find((t) => t.id === id) ?? null;

module.exports = config;
