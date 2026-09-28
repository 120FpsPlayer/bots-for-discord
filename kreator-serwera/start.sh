#!/usr/bin/env bash
# Uruchamia Kreator Serwera (Linux / macOS).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[X] Nie znaleziono Node.js. Zainstaluj wersję LTS: https://nodejs.org" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[!] Utworzono plik .env – wklej w nim token bota (DISCORD_TOKEN) i uruchom ponownie."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[i] Instaluję zależności (tylko za pierwszym razem)..."
  npm install --omit=dev
fi

echo "[i] Uruchamiam bota... (Ctrl+C, aby wyłączyć)"
exec node src/index.js
