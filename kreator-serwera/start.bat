@echo off
chcp 65001 >nul
title Kreator Serwera - bot Discord
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Nie znaleziono Node.js. Zainstaluj wersje LTS ze strony https://nodejs.org i uruchom ponownie.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [!] Utworzono plik .env - otworz go w Notatniku, wklej token bota w DISCORD_TOKEN i uruchom ponownie.
  start notepad ".env"
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [i] Instaluje zaleznosci (tylko za pierwszym razem^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [X] Instalacja nie powiodla sie.
    pause
    exit /b 1
  )
)

echo [i] Uruchamiam bota... (zamknij to okno, aby go wylaczyc)
node index.js
pause
