# 🎫 Ticket Bot – zaawansowany system ticketów dla Discorda

Kompletny bot do obsługi zgłoszeń napisany w **discord.js v14**. Cały interfejs po polsku, zero zewnętrznych baz danych – wystarczy Node.js.

## ✨ Funkcje

| | |
|---|---|
| 📂 **Kategorie ticketów** | Dowolna liczba typów (do 25) – każdy z własnym emoji, prefiksem kanału i rolami supportu |
| 📝 **Formularze** | Przed otwarciem ticketu użytkownik wypełnia formularz (do 5 pytań na typ) – odpowiedzi trafiają do ticketu |
| 🎛️ **Panel** | Przyciski lub lista rozwijana – do wyboru przy `/panel` |
| 🙋 **Przejmowanie** | Support „przejmuje" ticket – widać, kto się nim zajmuje |
| 🚦 **Priorytety** | Niski / Normalny / Wysoki / Pilny – z emoji w nazwie kanału i kolorem embeda |
| 📄 **Transkrypty HTML** | Wygląd jak na Discordzie (avatary, embedy, załączniki, formatowanie) – na kanał transkryptów i w DM do autora |
| ⭐ **Oceny obsługi** | Po zamknięciu autor dostaje w DM prośbę o ocenę 1–5 ⭐ z opcjonalnym komentarzem |
| ⏰ **Inteligentne auto-zamykanie** | Zamyka tylko tickety, w których **support odpisał, a autor milczy** – nigdy te czekające na odpowiedź zespołu. Najpierw ostrzeżenie |
| 🔓 **Ponowne otwieranie** | Zamknięty ticket można przywrócić jednym kliknięciem |
| 👥 **Dodawanie osób** | `/ticket dodaj` / `/ticket usun` |
| ⛔ **Czarna lista** | Blokada tworzenia ticketów dla wybranych osób (z powodem) |
| 🔢 **Limit ticketów** | Maksymalna liczba otwartych ticketów na osobę |
| 📊 **Statystyki** | Liczby, średnia ocena, średni czas 1. odpowiedzi i rozwiązania, ranking supportu |
| 🧾 **Logi** | Każda akcja (otwarcie, przejęcie, zamknięcie, ocena, usunięcie) na kanale logów |
| ⚡ **Szybki setup** | `/setup auto` tworzy wszystkie kategorie i kanały za Ciebie |
| 🛡️ **Odporność** | Ochrona przed podwójnym kliknięciem, pilnowanie limitów zmian nazw kanałów Discorda, atomowy zapis danych |

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
   npm run deploy           # rejestracja komend slash
   npm start
   ```
5. Na serwerze:
   ```
   /setup auto rola_supportu:@Support
   /panel
   ```
   Gotowe! 🎉

> 💡 Rola bota musi być **wyżej** na liście ról niż role, którym nadaje uprawnienia.

## 🔐 Uprawnienia i role – plik `.env`

Wszystkie role i osoby ustawisz w `.env` (wiele ID oddzielasz przecinkami). ID skopiujesz po włączeniu
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
SUPPORT_ROLE_IDS=345678901234567890,456789012345678901
SUPPORT_ROLE_IDS_REPORT=567890123456789012
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
| `/blacklist dodaj` / `usun` / `lista` | Czarna lista | Support |
| `/statystyki [pracownik] [dni]` | Statystyki i ranking | Support |

Przyciski w tickecie: **🔒 Zamknij** (z potwierdzeniem i opcjonalnym powodem), **🙋 Przejmij / ↩️ Odpuść**, **📄 Transkrypt**, a po zamknięciu **🔓 Otwórz ponownie** i **🗑️ Usuń**.

## ⚙️ Dostosowanie – `config.json`

```jsonc
{
  "brand": { "name": "Support", "color": "#5865F2", "footer": "System ticketów" },
  "panel": { "title": "…", "description": "…", "image": null },
  "ticketTypes": [
    {
      "id": "support",              // unikalne, a-z 0-9 _ -
      "label": "Pomoc ogólna",
      "emoji": "🛠️",
      "description": "Pytania i problemy techniczne",
      "channelPrefix": "pomoc",     // kanał: pomoc-0001
      "staffRoleIds": [],           // dodatkowe role tylko dla tego typu
      "questions": [                // max 5; pusta lista = bez formularza
        { "id": "subject", "label": "Temat", "style": "short", "required": true, "maxLength": 100 }
      ]
    }
  ],
  "defaults": {
    "maxOpenTicketsPerUser": 2,
    "autoCloseHours": 48,           // 0 = wyłączone
    "autoCloseWarningHours": 24,
    "deleteDelaySeconds": 5,
    "dmTranscript": true,           // wysyłaj transkrypt autorowi w DM
    "askForRating": true            // proś o ocenę po zamknięciu
  }
}
```

Po zmianie `config.json` zrestartuj bota i wyślij panel ponownie (`/panel`). `npm run check` sprawdzi poprawność konfiguracji bez łączenia z Discordem.

## 🗂️ Struktura

```
src/
├── index.js              # start bota, zdarzenia
├── deploy-commands.js    # rejestracja komend
├── commands/             # /setup, /panel, /ticket, /blacklist, /statystyki
├── handlers/interactions.js  # przyciski, listy, formularze
└── lib/
    ├── tickets.js        # logika ticketów
    ├── transcript.js     # generator transkryptów HTML
    ├── db.js             # baza JSON (data/db.json)
    ├── config.js         # wczytanie i walidacja config.json
    └── utils.js
```

Dane zapisywane są w `data/db.json` – zrób kopię tego pliku, aby przenieść bota na inny serwer/hosting.
