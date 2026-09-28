# 🎫 Ticket Bot – zaawansowany system ticketów dla Discorda

Kompletny bot do obsługi zgłoszeń napisany w **discord.js v14**. Cały interfejs po polsku, zero zewnętrznych baz danych – wystarczy Node.js.

## ✨ Funkcje

### 🎨 Wygląd
- **Nowoczesne karty Discorda (Components V2):** kolorowe kontenery, sekcje z miniaturkami, separatory. Bez starych embedów.
- **Panel ticketów:** baner, logo serwera, zasady, osobna karta z przyciskiem dla każdej kategorii (albo lista rozwijana).
- **Panel na żywo:** pokazuje 🟢/🌙 godziny pracy supportu, ⏱️ średni czas odpowiedzi i 📨 liczbę otwartych ticketów. Odświeża się kilka sekund po każdej zmianie (otwarcie, zamknięcie, pierwsza odpowiedź supportu), a dodatkowo co 5 minut.
- **Karta ticketu:** avatar autora, formularz, status, priorytet, kto obsługuje, dodane osoby, wiek konta, data dołączenia i liczba poprzednich ticketów. Kolor paska zależy od priorytetu.
- **Karta zamknięcia:** czas trwania, czas pierwszej odpowiedzi, kto obsługiwał, liczba wiadomości i przycisk pobrania transkryptu.
- **Transkrypt HTML jak Discord:** statystyki na górze, formularz, separatory dni, grupowanie wiadomości, odpowiedzi (↪), plakietki AUTOR / SUPPORT / BOT, naklejki, znacznik „edytowano”, karty bota.

### 🎧 Dla supportu
- **Menu zarządzania w karcie:** zmiana priorytetu, prośba o zamknięcie, przeniesienie do innej kategorii.
- **Dodawanie osób** prosto z listy użytkowników w karcie (do 5 naraz).
- **Przejmowanie ticketów** z kartą „🙋 X zajmie się Twoim zgłoszeniem”.
- **Prośba o zamknięcie:** autor klika „✅ Tak, zamknij” albo „✋ Nie, potrzebuję pomocy”.
- **Gotowe odpowiedzi** `/odpowiedz` z podpowiadaniem i zmiennymi `{user}`, `{staff}`, `{server}`.
- **Przenoszenie ticketów** między kategoriami. Uprawnienia ról zmieniają się automatycznie, a nowy zespół jest oznaczany.
- **Statystyki:** średnia ocena, rozkład ocen, czas 1. odpowiedzi i rozwiązania, podział na kategorie, trend tygodniowy, ranking 🥇🥈🥉.

### 👤 Dla użytkowników
- **Formularz przed otwarciem** (do 5 pytań na kategorię).
- **DM po otwarciu ticketu** z przyciskiem „Przejdź do ticketu”.
- **🔔 Wezwij support:** gdy długo nikt nie odpisuje (z cooldownem, żeby nie było spamu).
- **Ocena obsługi** 1–5 ⭐ w DM z opcjonalnym komentarzem i transkryptem w załączniku.
- **„✋ Nadal potrzebuję pomocy”:** przycisk anulujący automatyczne zamknięcie.

### 🛡️ Bezpieczeństwo i porządek
- **Inteligentne auto-zamykanie:** zamyka tylko tickety, w których support odpisał, a autor milczy. Najpierw wysyła ostrzeżenie.
- **Anty-spam:** cooldown między ticketami, limit otwartych ticketów, czarna lista.
- **Role w `.env`:** właściciele, admini, support (także per kategoria), kto może otwierać tickety, zablokowane role.
- **Logi z avatarami** i przyciskami do kanału i transkryptu.
- **Rotujący status bota:** liczba otwartych ticketów i średnia ocena.
- **Odporność:** ochrona przed podwójnym kliknięciem, pilnowanie limitów zmian nazw kanałów, atomowy zapis danych.

## 🚀 Instalacja

**Wymagania:** Node.js 18.17+ (zalecany 20 lub 22).

1. **Utwórz bota** na <https://discord.com/developers/applications> → *New Application* → zakładka **Bot** → *Reset Token* (skopiuj token).
2. W zakładce **Bot** włącz **Message Content Intent** (potrzebny do transkryptów).
3. **Zaproś bota** – *OAuth2 → URL Generator*: zaznacz `bot` + `applications.commands`, uprawnienia:
   `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Manage Messages`
   (albo po prostu `Administrator`).
4. Zainstaluj i skonfiguruj:
   ```bash
   npm install
   cp .env.example .env     # uzupełnij DISCORD_TOKEN, CLIENT_ID oraz role (patrz niżej)
   npm start                # komendy rejestrują się automatycznie przy starcie
   ```
5. Na serwerze:
   ```
   /setup auto rola_supportu:@Support
   /panel
   ```
   Gotowe! 🎉

> 💡 Rola bota musi być **wyżej** na liście ról niż role, którym nadaje uprawnienia.

## ☁️ Hosting (Wispbyte, Pterodactyl itp.)

1. Wgraj wszystkie pliki (bez `node_modules`) do panelu – np. rozpakuj ZIP w menedżerze plików.
2. Utwórz plik **`.env`** (skopiuj `.env.example`) i uzupełnij token oraz role.
3. Jako **plik startowy** (startup file / main file) wskaż: **`index.js`**.
4. Uruchom serwer – panel sam zrobi `npm install`, a bot **sam zarejestruje komendy** przy starcie
   (nie trzeba wpisywać `npm run deploy`). Ustaw `GUILD_ID`, żeby komendy pojawiły się od razu.

## 🔐 Uprawnienia i role – plik `.env`

Wszystkie role i osoby ustawisz w `.env`. **W każdym polu możesz wpisać dowolnie dużo ról** – oddziel je przecinkami
(spacje, średniki i skopiowane wzmianki `<@&…>` też działają). Po starcie bot wypisze w konsoli wczytane role
i ostrzeże o ID, których nie ma na serwerze. ID skopiujesz po włączeniu
**Trybu dewelopera** (Ustawienia → Zaawansowane), klikając PPM na osobę/rolę → *Kopiuj ID*.

| Zmienna | Kto to jest | Co może |
|---|---|---|
| `OWNER_IDS` | 👑 **Właściciele bota** (ID użytkowników) | Wszystko, na każdym serwerze |
| `ADMIN_ROLE_IDS` | 🛡️ **Administratorzy** | `/setup`, `/panel`, `/blacklist`, usuwanie ticketów, przejmowanie cudzych ticketów; widzą wszystkie tickety |
| `SUPPORT_ROLE_IDS` | 🎧 **Support** | Widzi i obsługuje tickety: przejmuje, zamyka, dodaje osoby, priorytety, transkrypty, statystyki |
| `SUPPORT_ROLE_IDS_<TYP>` | 🎧 Support jednej kategorii | Jak wyżej, ale tylko dla danego typu, np. `SUPPORT_ROLE_IDS_REPORT` |
| `OPEN_ROLE_IDS` | ✅ **Kto może otwierać tickety** | Puste = wszyscy. Np. rola „Zweryfikowany" |
| `BLOCKED_ROLE_IDS` | ⛔ **Kto nie może otwierać** | Np. rola „Wyciszony" |

Opcje dodatkowe:

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DISCORD_ADMINS_ARE_ADMINS` | `true` | Osoby z uprawnieniem Discorda *Administrator* / *Zarządzanie serwerem* są adminami bota. Ustaw `false`, jeśli dostęp ma wynikać **tylko** z `.env` |
| `STAFF_CAN_DELETE` | `true` | `false` = tylko admini mogą usuwać tickety |
| `OWNER_CAN_CLOSE` | `true` | Czy autor może sam zamknąć swój ticket |
| `TICKET_CATEGORY_ID`, `CLOSED_CATEGORY_ID`, `LOG_CHANNEL_ID`, `TRANSCRIPT_CHANNEL_ID` | – | Kanały ustawione w `.env` zamiast przez `/setup` (ustawienia z `/setup` mają pierwszeństwo) |

Przykład:

```env
OWNER_IDS=123456789012345678
ADMIN_ROLE_IDS=234567890123456789
SUPPORT_ROLE_IDS=345678901234567890,456789012345678901,111111111111111111,222222222222222222
SUPPORT_ROLE_IDS_REPORT=567890123456789012,333333333333333333
OPEN_ROLE_IDS=678901234567890123
BLOCKED_ROLE_IDS=789012345678901234
```

Role supportu możesz też dodawać komendą `/setup rola-dodaj` – oba źródła się sumują. Całą aktualną konfigurację
(łącznie z rolami z `.env`) pokaże `/setup pokaz`.

> Po zmianie `.env` zrestartuj bota.

## 📋 Komendy

| Komenda | Opis | Kto |
|---|---|---|
| `/setup auto rola_supportu` | Tworzy kategorie + kanały logów i transkryptów | Admin |
| `/setup ustaw …` | Ręczna konfiguracja (kategorie, kanały, limit, auto-zamykanie, ping) | Admin |
| `/setup rola-dodaj` / `rola-usun` | Role supportu | Admin |
| `/setup pokaz` | Aktualna konfiguracja | Admin |
| `/panel [kanal] [styl]` | Wysyła panel ticketów | Admin |
| `/ticket zamknij [powod]` | Zamyka ticket | Support + autor |
| `/ticket info` | Szczegóły ticketu | Wszyscy w tickecie |
| `/ticket dodaj` / `usun` | Dodaje / usuwa osobę | Support |
| `/ticket przejmij` / `odpusc` | Przejmuje / oddaje ticket | Support |
| `/ticket priorytet` | Zmienia priorytet | Support |
| `/ticket nazwa` | Zmienia nazwę kanału | Support |
| `/ticket przenies` | Przenosi ticket do innej kategorii | Support |
| `/ticket prosba-zamkniecia` | Prosi autora o potwierdzenie rozwiązania | Support |
| `/odpowiedz` | Wysyła gotową odpowiedź (z podpowiadaniem) | Support |
| `/blacklist dodaj` / `usun` / `lista` | Czarna lista | Support |
| `/pomoc` | Lista komend dostosowana do Twoich uprawnień | Wszyscy |
| `/statystyki [pracownik] [dni]` | Statystyki i ranking | Support |

W karcie ticketu:
- **Przyciski:** 🔒 Zamknij (z potwierdzeniem i opcjonalnym powodem), 🙋 Przejmij / ↩️ Odpuść, 🔔 Wezwij support, 📄 Transkrypt.
- **⚙️ Menu supportu:** priorytet, prośba o zamknięcie, przeniesienie.
- **➕ Lista „Dodaj osobę”.**

Po zamknięciu pojawiają się 🔓 Otwórz ponownie, 📄 Transkrypt, 🗑️ Usuń i ⬇️ Pobierz.

## ⚙️ Dostosowanie – `config.json`

```jsonc
{
  "brand": { "name": "Support", "color": "#5865F2", "footer": "System ticketów", "logo": null },
  "panel": {
    "title": "🎫 Centrum pomocy",
    "description": "…",
    "rules": ["Opisz sprawę dokładnie", "…"],   // lista „Zanim otworzysz ticket"
    "image": null,                                // link do banera (np. https://…/banner.png)
    "buttonLabel": "Otwórz",
    "showStats": true                             // średni czas odpowiedzi + liczba ticketów
  },
  "workingHours": {                               // status 🟢/🌙 na panelu i w tickecie
    "enabled": true, "timezone": "Europe/Warsaw",
    "days": [1, 2, 3, 4, 5, 6, 0],                // 0 = niedziela
    "from": "10:00", "to": "22:00"
  },
  "channelNameFormat": "{prio}{prefix}-{number}", // dostępne też {user}
  "ticketTypes": [
    {
      "id": "support", "label": "Pomoc ogólna", "emoji": "🛠️",
      "description": "Pytania i problemy techniczne",
      "channelPrefix": "pomoc",
      "staffRoleIds": [],
      "questions": [
        { "id": "subject", "label": "Temat", "style": "short", "required": true, "maxLength": 100 }
      ]
    }
  ],
  "snippets": [                                   // gotowe odpowiedzi dla /odpowiedz
    { "id": "powitanie", "name": "👋 Powitanie", "content": "Cześć {user}! Nazywam się {staff}…" }
  ],
  "defaults": {
    "maxOpenTicketsPerUser": 2,
    "autoCloseHours": 48,             // 0 = wyłączone
    "autoCloseWarningHours": 24,
    "deleteDelaySeconds": 5,
    "dmTranscript": true,
    "askForRating": true,
    "dmOnOpen": true,                 // DM z linkiem po otwarciu ticketu
    "openCooldownSeconds": 60,        // anty-spam między ticketami
    "pingStaffAfterMinutes": 10,      // po ilu minutach można „wezwać support"
    "pingStaffCooldownMinutes": 30,
    "panelRefreshMinutes": 10         // odświeżanie statystyk na panelu
  }
}
```

> Tryb kart z przyciskami mieści do **8 kategorii**. Przy większej liczbie panel sam przełącza się na listę rozwijaną.

Po zmianie `config.json` zrestartuj bota i wyślij panel ponownie (`/panel`). `npm run check` sprawdzi poprawność konfiguracji bez łączenia z Discordem.

## 🗂️ Struktura

```
index.js                  # plik startowy (dla hostingu)
src/
├── index.js              # start bota, zdarzenia (uruchamiany przez /index.js)
├── deploy-commands.js    # rejestracja komend
├── commands/             # /setup, /panel, /ticket, /odpowiedz, /blacklist, /statystyki, /pomoc
├── handlers/interactions.js  # przyciski, listy, formularze
└── lib/
    ├── tickets.js        # logika ticketów
    ├── ui.js             # wygląd kart (Components V2)
    ├── transcript.js     # generator transkryptów HTML
    ├── db.js             # baza JSON (data/db.json)
    ├── config.js         # wczytanie i walidacja config.json
    └── utils.js
```

Dane zapisywane są w `data/db.json` – zrób kopię tego pliku, aby przenieść bota na inny serwer/hosting.
