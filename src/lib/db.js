// Prosta, bezzależnościowa baza danych JSON z atomowym zapisem.
// Wystarcza w zupełności dla setek tysięcy ticketów – bez kompilowania
// natywnych modułów i bez zewnętrznego serwera.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let state = { guilds: {}, tickets: {} };
let saveTimer = null;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state.guilds ??= {};
    state.tickets ??= {};
  }
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 500);
}

function defaultSettings() {
  const d = config.defaults;
  return {
    staffRoleIds: [],
    categoryId: null,
    closedCategoryId: null,
    logChannelId: null,
    transcriptChannelId: null,
    maxOpenTicketsPerUser: d.maxOpenTicketsPerUser ?? 2,
    autoCloseHours: d.autoCloseHours ?? 48,
    autoCloseWarningHours: d.autoCloseWarningHours ?? 24,
    pingStaffOnOpen: true,
  };
}

function guild(guildId) {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = { settings: defaultSettings(), counter: 0, blacklist: [] };
    save();
  }
  const g = state.guilds[guildId];
  // uzupełnij nowe pola po aktualizacji bota
  g.settings = { ...defaultSettings(), ...g.settings };
  g.blacklist ??= [];
  return g;
}

module.exports = {
  load,
  flush,

  /** Ustawienia serwera; kanały z .env służą jako wartości domyślne. */
  settings(guildId) {
    const { env } = require('./permissions');
    const s = guild(guildId).settings;
    return {
      ...s,
      categoryId: s.categoryId ?? env.categoryId,
      closedCategoryId: s.closedCategoryId ?? env.closedCategoryId,
      logChannelId: s.logChannelId ?? env.logChannelId,
      transcriptChannelId: s.transcriptChannelId ?? env.transcriptChannelId,
    };
  },

  updateSettings(guildId, patch) {
    const g = guild(guildId);
    Object.assign(g.settings, patch);
    save();
    return g.settings;
  },

  nextTicketNumber(guildId) {
    const g = guild(guildId);
    g.counter += 1;
    save();
    return g.counter;
  },

  // --- czarna lista ---
  isBlacklisted: (guildId, userId) => guild(guildId).blacklist.some((b) => b.userId === userId),
  blacklist: (guildId) => guild(guildId).blacklist,
  addBlacklist(guildId, entry) {
    const g = guild(guildId);
    g.blacklist = g.blacklist.filter((b) => b.userId !== entry.userId);
    g.blacklist.push(entry);
    save();
  },
  removeBlacklist(guildId, userId) {
    const g = guild(guildId);
    const before = g.blacklist.length;
    g.blacklist = g.blacklist.filter((b) => b.userId !== userId);
    save();
    return before !== g.blacklist.length;
  },

  // --- tickety (kluczem jest ID kanału) ---
  createTicket(ticket) {
    state.tickets[ticket.channelId] = ticket;
    save();
    return ticket;
  },
  getTicket: (channelId) => state.tickets[channelId] ?? null,
  updateTicket(channelId, patch) {
    const t = state.tickets[channelId];
    if (!t) return null;
    Object.assign(t, patch);
    save();
    return t;
  },
  tickets(filter = () => true) {
    return Object.values(state.tickets).filter(filter);
  },
};
