'use strict';

/**
 * Plik startowy bota – ustaw go jako „startup file” na hostingu (Wispbyte, Pterodactyl itp.)
 * albo uruchom lokalnie: node index.js
 *
 * Jeśli hosting nie zainstalował zależności (np. bot leży w podfolderze, a panel
 * uruchamia `npm install` tylko w głównym katalogu), instalujemy je tutaj sami.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.error(`[X] Kreator Serwera wymaga Node.js 18.17 lub nowszego (masz ${process.versions.node}). Zmień wersję Node / obraz Dockera w panelu hostingu.`);
  process.exit(1);
}

const root = __dirname;
if (!fs.existsSync(path.join(root, 'node_modules', 'discord.js', 'package.json'))) {
  console.log('[i] Brak zainstalowanych zależności – instaluję (tylko za pierwszym razem)...');
  try {
    execSync('npm install --omit=dev --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`[X] Nie udało się zainstalować zależności. Uruchom ręcznie „npm install” w folderze: ${root}`);
    process.exit(1);
  }
}

require('./src/index.js');
