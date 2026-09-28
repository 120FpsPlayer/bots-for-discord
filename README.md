# 🎫 Ticket Bot – system ticketów dla Discorda

Bot do obsługi zgłoszeń, napisany w **discord.js v14**. Cały interfejs jest po polsku. Dane zapisują się w pliku, więc nie potrzebujesz bazy danych – wystarczy Node.js.

---

## 📑 Spis treści

1. [Co potrafi bot](#-co-potrafi-bot)
2. [Krok 1 – utwórz bota na Discordzie](#-krok-1--utwórz-bota-na-discordzie)
3. [Krok 2 – zaproś bota na serwer](#-krok-2--zaproś-bota-na-serwer)
4. [Krok 3 – wgraj pliki i uzupełnij `.env`](#-krok-3--wgraj-pliki-i-uzupełnij-env)
5. [Krok 4 – uruchom bota](#-krok-4--uruchom-bota)
6. [Krok 5 – skonfiguruj serwer](#-krok-5--skonfiguruj-serwer)
7. [Plik `.env` – wszystkie opcje](#-plik-env--wszystkie-opcje)
8. [Plik `config.json` – wygląd i kategorie](#-plik-configjson--wygląd-i-kategorie)
9. [Komendy](#-komendy)
10. [Jak działa ticket – krok po kroku](#-jak-działa-ticket--krok-po-kroku)
11. [Aktualizacja bota](#-aktualizacja-bota)
12. [Najczęstsze problemy](#-najczęstsze-problemy)
13. [Struktura plików](#-struktura-plików)

---

## ✨ Co potrafi bot

### 🎨 Wygląd
- **Nowoczesne karty Discorda (Components V2):** kolorowe ramki, avatary obok tekstu i separatory.
- **Panel ticketów:** baner, logo serwera, zasady i osobna karta z przyciskiem dla każdej kategorii (albo lista rozwijana).
- **Panel na żywo:** pokazuje 🟢/🌙 godziny pracy supportu, ⏱️ średni czas odpowiedzi i 📨 liczbę otwartych ticketów. Odświeża się kilka sekund po każdej zmianie oraz co 5 minut.
- **Karta ticketu:** avatar autora, formularz, status, priorytet (kolor ramki), kto obsługuje, dodane osoby, wiek konta, data dołączenia i liczba poprzednich ticketów.
- **Karta zamknięcia:** czas trwania, czas pierwszej odpowiedzi, kto obsługiwał, liczba wiadomości i przycisk pobrania transkryptu.
- **Transkrypt HTML wyglądający jak Discord:** statystyki, formularz, podział na dni, grupowanie wiadomości, odpowiedzi (↪), plakietki AUTOR / SUPPORT / BOT i naklejki.

### 🎧 Dla supportu
- **Menu ⚙️ w karcie ticketu:** zmiana priorytetu, prośba o zamknięcie i przeniesienie do innej kategorii.
- **Lista ➕ „Dodaj osobę”:** do 5 osób naraz.
- **Przejmowanie ticketów:** autor widzi kartę „🙋 X zajmie się Twoim zgłoszeniem”.
- **Prośba o zamknięcie:** autor klika „✅ Tak, zamknij” albo „✋ Nie, potrzebuję pomocy”.
- **Gotowe odpowiedzi** `/odpowiedz` z podpowiadaniem.
- **Statystyki:** średnia ocena, rozkład ocen, czasy odpowiedzi, podział na kategorie, trend tygodniowy i ranking 🥇🥈🥉.

### 👤 Dla użytkowników
- **Formularz przed otwarciem** (do 5 pytań na kategorię).
- **DM po otwarciu** z przyciskiem „Przejdź do ticketu”.
- **🔔 Wezwij support**, gdy długo nikt nie odpisuje (z cooldownem).
- **Ocena obsługi** 1–5 ⭐ w DM, z komentarzem i transkryptem w załączniku.
- **„✋ Nadal potrzebuję pomocy”:** anuluje automatyczne zamknięcie.

### 🛡️ Bezpieczeństwo
- **Inteligentne auto-zamykanie:** zamyka tylko tickety, w których support odpisał, a autor milczy. Najpierw wysyła ostrzeżenie.
- **Anty-spam:** cooldown między ticketami, limit otwartych ticketów i czarna lista.
- **Role w `.env`:** dowolna liczba ról dla właścicieli, adminów, supportu, osób otwierających tickety i ról zablokowanych.
- **Logi** wszystkich akcji z avatarami i przyciskami.

---

## 🤖 Krok 1 – utwórz bota na Discordzie

1. Wejdź na <https://discord.com/developers/applications> i kliknij **New Application**.
2. W zakładce **General Information** skopiuj **Application ID**. To będzie `CLIENT_ID`.
3. W zakładce **Bot**:
   - kliknij **Reset Token** i skopiuj token. To będzie `DISCORD_TOKEN`. **Nikomu go nie pokazuj!**
   - włącz **Message Content Intent**. Bez tego transkrypty będą puste.

## 📨 Krok 2 – zaproś bota na serwer

1. W zakładce **OAuth2 → URL Generator** zaznacz `bot` oraz `applications.commands`.
2. W uprawnieniach zaznacz **Administrator** (najprościej) albo przynajmniej:
   `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Manage Messages`.
3. Otwórz wygenerowany link i dodaj bota na serwer.
4. W **Ustawieniach serwera → Role** przeciągnij rolę bota **wyżej** niż role supportu.

## 📁 Krok 3 – wgraj pliki i uzupełnij `.env`

1. Rozpakuj ZIP (na komputerze albo w menedżerze plików hostingu).
2. Skopiuj plik **`.env.example`** i nazwij kopię **`.env`**.
3. Uzupełnij co najmniej:
   ```env
   DISCORD_TOKEN=twój_token
   CLIENT_ID=id_aplikacji
   GUILD_ID=id_twojego_serwera
   SUPPORT_ROLE_IDS=id_roli_supportu
   ```
   Wszystkie opcje są opisane w sekcji [Plik `.env`](#-plik-env--wszystkie-opcje).

> 💡 **Jak skopiować ID?** W Discordzie: *Ustawienia → Zaawansowane → Tryb dewelopera* (włącz). Potem kliknij prawym przyciskiem na serwer, rolę albo osobę i wybierz **Kopiuj ID**.

## ▶️ Krok 4 – uruchom bota

### Na hostingu (Wispbyte, Pterodactyl itp.)
1. Jako **plik startowy** (startup file / main file) wybierz **`index.js`**.
2. Kliknij **Start**. Panel sam zainstaluje biblioteki z `package.json`. Jeśli w konsoli pojawi się błąd `Cannot find module 'discord.js'`, wpisz w konsoli `npm install`.
3. Bot **sam zarejestruje komendy** przy starcie. Z ustawionym `GUILD_ID` pojawią się od razu, bez niego po ok. godzinie.

### Na komputerze
Wymagany jest Node.js w wersji **18.17 lub nowszej** (<https://nodejs.org>).
```bash
npm install
npm start
```

Po starcie konsola pokaże m.in.:
```
✅ Zalogowano jako TicketBot#1234 · serwery: 1 · komendy: 7
🔐 SUPPORT_ROLE_IDS: 3 role → @Helper, @Moderator, @Support
✅ Zarejestrowano komendy na serwerze 123456789012345678.
```
Jeśli przy którejś roli zobaczysz **⚠️ nie ma takiej roli na serwerze**, to ID w `.env` jest błędne.

## ⚙️ Krok 5 – skonfiguruj serwer

Na serwerze Discord wpisz:
```
/setup auto rola_supportu:@Support
```
Bot sam utworzy:
- kategorię **🎫 Tickety** dla otwartych ticketów,
- kategorię **📁 Zamknięte tickety**,
- kanał **#ticket-logi**,
- kanał **#ticket-transkrypty**.

Potem na kanale, gdzie ma być panel, wpisz:
```
/panel
```
Gotowe! 🎉 Użytkownicy mogą teraz otwierać tickety.

> Kanały możesz też ustawić ręcznie przez `/setup ustaw` albo w `.env`. Aktualną konfigurację sprawdzisz komendą `/setup pokaz`.

---

## 🔐 Plik `.env` – wszystkie opcje

### Bot

| Zmienna | Opis |
|---|---|
| `DISCORD_TOKEN` | Token bota (Krok 1). **Wymagane.** |
| `CLIENT_ID` | Application ID bota (Krok 1). **Wymagane.** |
| `GUILD_ID` | ID Twojego serwera. Z nim komendy pojawiają się od razu. Puste = komendy globalne (pojawiają się po ok. godzinie). |
| `AUTO_DEPLOY_COMMANDS` | `true` = bot sam rejestruje komendy przy starcie. `false` = rejestrujesz je ręcznie przez `npm run deploy`. |

### Uprawnienia i role

W **każdym** polu możesz wpisać **dowolnie dużo ról**. Oddziel je przecinkami:
```env
SUPPORT_ROLE_IDS=111111111111111111,222222222222222222,333333333333333333
```
Spacje, średniki, cudzysłowy i skopiowane wzmianki `<@&111…>` też działają. Możesz też użyć nazwy w liczbie pojedynczej, np. `SUPPORT_ROLE_ID`. Role z obu pól się sumują.

| Zmienna | Kto to jest | Co może |
|---|---|---|
| `OWNER_IDS` | 👑 **Właściciele bota** (ID **użytkowników**, nie ról) | Wszystko |
| `ADMIN_ROLE_IDS` | 🛡️ **Administratorzy** | `/setup`, `/panel`, `/blacklist`, usuwanie ticketów, przejmowanie cudzych ticketów. Widzą wszystkie tickety. |
| `SUPPORT_ROLE_IDS` | 🎧 **Support** | Widzą i obsługują wszystkie tickety: przejmują, zamykają, dodają osoby, zmieniają priorytet, wysyłają gotowe odpowiedzi, sprawdzają statystyki. |
| `SUPPORT_ROLE_IDS_SUPPORT` | 🎧 Support tylko kategorii **Pomoc ogólna** | To samo, ale tylko w tej kategorii |
| `SUPPORT_ROLE_IDS_REPORT` | 🎧 Support tylko kategorii **Zgłoszenie gracza** | j.w. |
| `SUPPORT_ROLE_IDS_PARTNERSHIP` | 🎧 Support tylko kategorii **Współpraca** | j.w. |
| `SUPPORT_ROLE_IDS_APPEAL` | 🎧 Support tylko kategorii **Odwołanie od kary** | j.w. |
| `OPEN_ROLE_IDS` | ✅ **Kto może otwierać tickety** | Puste = wszyscy. Np. rola „Zweryfikowany”. Admini i właściciele mogą zawsze. |
| `BLOCKED_ROLE_IDS` | ⛔ **Kto NIE może otwierać ticketów** | Np. rola „Wyciszony” |

> Gdy dodasz własną kategorię w `config.json`, np. z `"id": "zakupy"`, jej rolę supportu ustawisz przez `SUPPORT_ROLE_IDS_ZAKUPY=...`. Nazwa to `SUPPORT_ROLE_IDS_` + id kategorii **wielkimi literami** (myślnik zamień na `_`).

Role supportu możesz też dodawać komendą `/setup rola-dodaj`. Role z `.env` i z komendy się sumują.

### Opcje zachowania

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DISCORD_ADMINS_ARE_ADMINS` | `true` | Osoby z uprawnieniem Discorda *Administrator* / *Zarządzanie serwerem* są adminami bota. `false` = dostęp wynika **tylko** z `.env`. |
| `STAFF_CAN_DELETE` | `true` | `false` = tylko admini mogą usuwać tickety. |
| `OWNER_CAN_CLOSE` | `true` | Czy autor może sam zamknąć swój ticket. |

### Kanały (opcjonalne)

Zamiast `/setup` możesz podać ID kanałów tutaj. Jeśli ustawisz je w obu miejscach, wygrywa `/setup`.

| Zmienna | Opis |
|---|---|
| `TICKET_CATEGORY_ID` | Kategoria na otwarte tickety |
| `CLOSED_CATEGORY_ID` | Kategoria na zamknięte tickety |
| `LOG_CHANNEL_ID` | Kanał logów |
| `TRANSCRIPT_CHANNEL_ID` | Kanał na transkrypty |

### Przykład wypełnionego `.env`

```env
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GAbCdE.xxxxxxxxxxxxxxxxxxxxxxxx
CLIENT_ID=123456789012345678
GUILD_ID=234567890123456789

OWNER_IDS=345678901234567890
ADMIN_ROLE_IDS=456789012345678901,567890123456789012
SUPPORT_ROLE_IDS=678901234567890123,789012345678901234,890123456789012345
SUPPORT_ROLE_IDS_REPORT=901234567890123456,112233445566778899
OPEN_ROLE_IDS=998877665544332211
BLOCKED_ROLE_IDS=887766554433221100

DISCORD_ADMINS_ARE_ADMINS=true
STAFF_CAN_DELETE=false
OWNER_CAN_CLOSE=true

AUTO_DEPLOY_COMMANDS=true
```

> ⚠️ Po każdej zmianie w `.env` **zrestartuj bota**.

---

## 🎨 Plik `config.json` – wygląd i kategorie

### `brand` – marka
| Pole | Opis |
|---|---|
| `name` | Nazwa widoczna w panelu i statusie bota |
| `color` | Główny kolor, np. `"#5865F2"` |
| `footer` | Stopka embedów (logi, DM) |
| `logo` | Link do logo w panelu. `null` = ikona serwera |

### `panel` – panel ticketów
| Pole | Opis |
|---|---|
| `title` | Tytuł panelu |
| `description` | Opis pod tytułem |
| `rules` | Lista zasad w sekcji „📌 Zanim otworzysz ticket” |
| `image` | Link do banera (obrazek nad panelem). `null` = bez banera |
| `buttonLabel` | Tekst na przyciskach kategorii, np. `"Otwórz"` |
| `showStats` | `true` = pokazuj średni czas odpowiedzi i liczbę otwartych ticketów |

### `workingHours` – godziny pracy supportu
| Pole | Opis |
|---|---|
| `enabled` | `true` / `false` |
| `timezone` | Strefa czasowa, np. `"Europe/Warsaw"` |
| `days` | Dni pracy: `0` = niedziela, `1` = poniedziałek … `6` = sobota |
| `from` / `to` | Godziny, np. `"10:00"` i `"22:00"` |

Poza godzinami pracy panel i nowe tickety pokazują „🌙 Jesteśmy poza godzinami pracy…”.

### `channelNameFormat` – nazwy kanałów
Domyślnie `"{prio}{prefix}-{number}"`, co daje np. `pomoc-0001` albo `🔴pomoc-0001` przy pilnym priorytecie.
Dostępne zmienne: `{prio}`, `{prefix}`, `{number}`, `{user}` (nazwa autora).

### `ticketTypes` – kategorie ticketów
```json
{
  "id": "support",
  "label": "Pomoc ogólna",
  "emoji": "🛠️",
  "description": "Pytania i problemy techniczne",
  "channelPrefix": "pomoc",
  "staffRoleIds": [],
  "questions": [
    { "id": "subject", "label": "Temat", "style": "short", "placeholder": "Np. nie działa mi ranga", "required": true, "maxLength": 100 },
    { "id": "details", "label": "Opisz dokładnie problem", "style": "paragraph", "required": true, "maxLength": 1000 }
  ]
}
```
| Pole | Opis |
|---|---|
| `id` | Unikalny identyfikator: małe litery, cyfry, `_`, `-` |
| `label` / `emoji` / `description` | Wygląd w panelu |
| `channelPrefix` | Początek nazwy kanału |
| `staffRoleIds` | Dodatkowe role supportu tylko dla tej kategorii (można też przez `.env`) |
| `questions` | Pytania formularza, **maksymalnie 5**. Pusta lista `[]` = ticket bez formularza |
| `style` | `"short"` (jedna linia) albo `"paragraph"` (dłuższy tekst) |

> Tryb kart z przyciskami mieści do **8 kategorii**. Przy większej liczbie panel sam przełącza się na listę rozwijaną (maks. 25).

### `snippets` – gotowe odpowiedzi (`/odpowiedz`)
```json
{ "id": "powitanie", "name": "👋 Powitanie", "content": "Cześć {user}! Nazywam się {staff} i zajmę się Twoim zgłoszeniem." }
```
Zmienne: `{user}` (autor ticketu), `{staff}` (osoba z supportu), `{server}` (nazwa serwera).

### `defaults` – zachowanie
| Pole | Domyślnie | Opis |
|---|---|---|
| `maxOpenTicketsPerUser` | `2` | Limit otwartych ticketów na osobę (`0` = bez limitu) |
| `autoCloseHours` | `48` | Po ilu godzinach bez odpowiedzi autora zamknąć ticket (`0` = wyłączone) |
| `autoCloseWarningHours` | `24` | Po ilu godzinach wysłać ostrzeżenie |
| `deleteDelaySeconds` | `5` | Opóźnienie przed usunięciem kanału |
| `dmTranscript` | `true` | Wysyłaj autorowi transkrypt w DM |
| `askForRating` | `true` | Proś o ocenę po zamknięciu |
| `dmOnOpen` | `true` | DM z linkiem po otwarciu ticketu |
| `openCooldownSeconds` | `60` | Anty-spam: odstęp między ticketami jednej osoby |
| `pingStaffAfterMinutes` | `10` | Po ilu minutach autor może użyć „🔔 Wezwij support” |
| `pingStaffCooldownMinutes` | `30` | Jak często można wzywać support |
| `panelRefreshMinutes` | `5` | Co ile minut odświeżać panel (niezależnie od odświeżania po zmianach) |

Limit, auto-zamykanie i ping supportu możesz też zmienić bez restartu komendą `/setup ustaw`.

> Po zmianie `config.json` zrestartuj bota i wyślij panel ponownie (`/panel`). Poprawność pliku sprawdzisz komendą `npm run check`.

---

## 📋 Komendy

| Komenda | Opis | Kto |
|---|---|---|
| `/setup auto rola_supportu` | Tworzy kategorie oraz kanały logów i transkryptów | Admin |
| `/setup ustaw …` | Ręczna konfiguracja: kategorie, kanały, limit, auto-zamykanie, ping | Admin |
| `/setup rola-dodaj` / `rola-usun` | Role supportu | Admin |
| `/setup pokaz` | Cała konfiguracja, w tym role z `.env` | Admin |
| `/panel [kanal] [styl]` | Wysyła panel ticketów | Admin |
| `/ticket info` | Szczegóły ticketu | Wszyscy w tickecie |
| `/ticket zamknij [powod]` | Zamyka ticket | Support + autor |
| `/ticket dodaj` / `usun` | Dodaje / usuwa osobę | Support |
| `/ticket przejmij` / `odpusc` | Przejmuje / oddaje ticket | Support |
| `/ticket priorytet` | Zmienia priorytet | Support |
| `/ticket przenies` | Przenosi ticket do innej kategorii | Support |
| `/ticket prosba-zamkniecia` | Prosi autora o potwierdzenie rozwiązania | Support |
| `/ticket nazwa` | Zmienia nazwę kanału | Support |
| `/odpowiedz` | Wysyła gotową odpowiedź (z podpowiadaniem) | Support |
| `/blacklist dodaj` / `usun` / `lista` | Czarna lista | Support |
| `/statystyki [pracownik] [dni]` | Statystyki i ranking | Support |
| `/pomoc` | Lista komend zależna od Twoich uprawnień | Wszyscy |

> Komendy admina widzi każdy, ale bot sam sprawdza uprawnienia i odmawia osobom bez dostępu. Jeśli chcesz je ukryć, zrób to w *Ustawieniach serwera → Integracje*.

---

## 🔄 Jak działa ticket – krok po kroku

1. **Użytkownik** klika kategorię na panelu i wypełnia formularz.
2. Bot tworzy **prywatny kanał**, który widzi tylko autor, support i admini. W kanale wysyła przypiętą **kartę ticketu** i oznacza rolę supportu. Autor dostaje **DM** z linkiem.
3. **Support** klika **🙋 Przejmij**. Karta pokazuje, kto obsługuje ticket.
4. W karcie support ma **menu ⚙️** (priorytet, prośba o zamknięcie, przeniesienie) i listę **➕ Dodaj osobę**.
5. Jeśli support długo nie odpisuje, autor może kliknąć **🔔 Wezwij support**.
6. Jeśli autor przestanie odpisywać, bot wysyła **ostrzeżenie**, a później **automatycznie zamyka** ticket. Autor może to anulować przyciskiem **✋ Nadal potrzebuję pomocy**.
7. Ticket zamyka się przez **🔒 Zamknij** albo przez prośbę o zamknięcie zaakceptowaną przez autora. Wtedy:
   - autor traci dostęp, a kanał trafia do kategorii zamkniętych,
   - bot zapisuje **transkrypt HTML** na kanale transkryptów,
   - autor dostaje w DM **transkrypt** i **prośbę o ocenę** ⭐,
   - w kanale pojawia się karta z przyciskami **🔓 Otwórz ponownie**, **📄 Transkrypt** i **🗑️ Usuń**.
8. Każda akcja trafia na **kanał logów**.

---

## ⬆️ Aktualizacja bota

1. Zatrzymaj bota.
2. Podmień pliki na nowe. **Zachowaj** swój plik `.env` i folder `data/`, bo tam są Twoje tickety.
3. Jeśli nie nadpisujesz swojego `config.json`, porównaj go z nowym i dopisz brakujące opcje.
4. Uruchom bota.
5. Jeśli zmienił się wygląd panelu, wyślij go ponownie przez `/panel` i usuń stary.

> 💾 Kopia zapasowa = skopiuj plik `data/db.json`.

---

## 🛠️ Najczęstsze problemy

| Problem | Rozwiązanie |
|---|---|
| Konsola: `Brak DISCORD_TOKEN w pliku .env` | Plik musi nazywać się dokładnie `.env` (z kropką na początku) i leżeć obok `index.js`. |
| Konsola: `Cannot find module 'discord.js'` | Wpisz w konsoli `npm install`. |
| Komendy się nie pojawiają | Ustaw `GUILD_ID` i zrestartuj bota. Bez niego komendy globalne pojawiają się po ok. godzinie. Sprawdź też, czy przy zapraszaniu zaznaczono `applications.commands`. |
| „System ticketów nie jest jeszcze skonfigurowany” | Użyj `/setup auto` albo ustaw `TICKET_CATEGORY_ID`. |
| „Nie udało się utworzyć ticketu” | Bot potrzebuje uprawnień *Manage Channels* i *Manage Roles*, a jego rola musi być wyżej niż role supportu. |
| Transkrypt jest pusty | Włącz **Message Content Intent** w Developer Portal (Krok 1). |
| Support nie widzi ticketów | Sprawdź w konsoli linię `🔐 SUPPORT_ROLE_IDS`. Jeśli przy roli jest ⚠️, ID jest błędne. |
| „Średni czas odpowiedzi: brak danych” | Liczy się dopiero, gdy w tickecie odpisze osoba z supportu (nie autor ticketu). |
| Użytkownik nie dostaje DM | Ma zablokowane wiadomości prywatne od członków serwera. Bot to pomija i działa dalej. |

---

## 🗂️ Struktura plików

```
index.js                      plik startowy (wybierz go na hostingu)
.env                          token, role, kanały (utwórz z .env.example)
config.json                   wygląd, kategorie, pytania, gotowe odpowiedzi
data/db.json                  tickety i ustawienia (tworzy się sam)
scripts/check.js              sprawdzanie config.json (npm run check)
src/
├── index.js                  start bota i zdarzenia
├── deploy-commands.js        ręczna rejestracja komend (npm run deploy)
├── commands/                 komendy slash
├── handlers/interactions.js  przyciski, menu i formularze
└── lib/
    ├── tickets.js            logika ticketów
    ├── ui.js                 wygląd kart
    ├── transcript.js         transkrypty HTML
    ├── permissions.js        role i uprawnienia z .env
    ├── db.js                 zapis danych
    ├── config.js             wczytywanie config.json
    └── utils.js              funkcje pomocnicze
```
