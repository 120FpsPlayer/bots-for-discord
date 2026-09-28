'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

const envLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = LEVELS[envLevel] ?? LEVELS.info;
const useColors = process.stdout.isTTY && !process.env.NO_COLOR;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level, scope, args) {
  if (LEVELS[level] < threshold) return;
  const tag = level.toUpperCase().padEnd(5);
  const prefix = useColors
    ? `${COLORS[level]}[${timestamp()}] ${tag}${RESET} \x1b[1m${scope}${RESET}`
    : `[${timestamp()}] ${tag} ${scope}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(prefix, ...args);
}

/** Tworzy logger z nazwą modułu, np. createLogger('executor'). */
function createLogger(scope) {
  return {
    debug: (...args) => write('debug', scope, args),
    info: (...args) => write('info', scope, args),
    warn: (...args) => write('warn', scope, args),
    error: (...args) => write('error', scope, args),
  };
}

module.exports = { createLogger };
