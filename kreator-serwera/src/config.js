'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Wczytuje plik .env bez zewnętrznych zależności.
 * Obsługuje komentarze (#), cudzysłowy oraz wartości z "=" w środku.
 * Zmienne ustawione już w systemie mają pierwszeństwo.
 */
function loadEnvFile(file = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

loadEnvFile();

function intFromEnv(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name], 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const config = {
  token: (process.env.DISCORD_TOKEN || '').trim(),
  /** Jeśli ustawione – komenda /stworz rejestruje się natychmiast tylko na tym serwerze (tryb testowy). */
  devGuildId: (process.env.DEV_GUILD_ID || '').trim() || null,
  /** Po ilu minutach bezczynności wygasa sesja kreatora. */
  sessionTimeoutMinutes: intFromEnv('SESSION_TIMEOUT_MIN', 30, 5, 120),
  /** Czy tylko właściciel serwera może używać /stworz (domyślnie: każdy z uprawnieniem Administrator). */
  ownerOnly: /^(1|true|tak|yes)$/i.test(process.env.OWNER_ONLY || ''),
};

function validateConfig() {
  const problems = [];
  if (!config.token || config.token === 'TWOJ_TOKEN_BOTA') {
    problems.push('Brak tokenu bota. Uzupełnij DISCORD_TOKEN w pliku .env (skopiuj .env.example jako .env).');
  } else if (config.token.split('.').length !== 3) {
    problems.push('DISCORD_TOKEN wygląda na niepoprawny – skopiuj go ponownie z Discord Developer Portal (zakładka Bot → Reset Token).');
  }
  if (config.devGuildId && !/^\d{17,20}$/.test(config.devGuildId)) {
    problems.push('DEV_GUILD_ID musi być ID serwera (same cyfry) albo zostać puste.');
  }
  return problems;
}

module.exports = { config, validateConfig, loadEnvFile };
