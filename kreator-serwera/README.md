# 🛠️ Kreator Serwera – bot Discord

Bot, który **jedną komendą `/stworz`** buduje cały serwer Discord dokładnie tak, jak go opiszesz:
**role z uprawnieniami, kategorie, kanały z ustawionym dostępem (kto widzi, kto pisze), regulamin, informacje, weryfikację, AutoMod i ustawienia bezpieczeństwa**.

Po wpisaniu `/stworz` otwiera się interaktywny panel (widoczny tylko dla Ciebie), który zadaje **16 szczegółowych pytań** (albo tylko 4 w trybie ⚡ szybkim):
wybierasz opcje z menu, wpisujesz własne nazwy i listy, oglądasz podgląd, a na końcu klikasz **Zbuduj serwer** –
bot tworzy wszystko sam i pokazuje postęp na żywo.

---

## ✨ Możliwości

| | |
|---|---|
| 🧭 **21 gotowych typów serwerów** | Społeczność graczy, serwer Minecraft, RP (FiveM/GTA), e-sport/klan, programowanie, szkoła/klasa, firma, twórca/streamer, muzyka, anime, roleplay fantasy, sklep, znajomi, sztuka, wsparcie produktu, ogólna społeczność, sport i fitness, filmy i seriale, inwestycje/krypto, wydarzenie/konferencja/hackathon, własny projekt |
| 📝 **Twój opis** | Nazwa, opis i cel serwera, grupa docelowa, ikona – trafiają do kanału informacji i ekranu powitalnego |
| 🌍 **Język, rozmiar, wiek** | Serwer po polsku lub angielsku; rozmiar (mały → ogromny) i wiek (13+/16+/18+) dopasowują moderację, kanały i role |
| 🎨 **6 stylów kanałów, 6 stylów kategorii, 7 palet** | `💬・ogólny`, `💬┃ogólny`, `『💬』ogólny`, drzewko `╭ ├ ╰`, `ᴋᴀᴘɪᴛᴀʟɪᴋɪ` … + podgląd na żywo |
| 🧩 **31 sekcji do wyboru** | weryfikacja, regulamin, ogłoszenia, wydarzenia, konkursy, partnerstwa, propozycje (forum z tagami), pytanie dnia, liczenie, muzyka, 18+, scena, AFK, strefa VIP, opis ról, administracja, logi, archiwum… |
| ⭐ **Pytania pod typ serwera** | np. lista gier / trybów / frakcji / składów / przedmiotów / działów – każdy element dostaje kanały (tekst, dodatkowy, głosowy), rolę i opcjonalnie prywatny dostęp; kanały specjalne (IP serwera, whitelist, apelacje, cennik, harmonogram…) |
| 🛡️ **Hierarchia ekipy** | Właściciel, Współwłaściciel, Administrator, Moderator, Pomocnik, Moderator próbny, Event/Partnership Manager, Developer, Grafik + role typowe dla danego typu (np. Mistrz Gry, Nauczyciel, Sprzedawca) + własne role z wybranym poziomem uprawnień; nazwy głównych ról możesz zmienić (np. „Właściciel” → „CEO”) |
| 🎭 **Role społeczności** | rola członka, Boty, VIP, Partner, Aktywny, Weteran, poziomy 1–100, powiadomienia, 14 kolorów, wiek, zaimki, platformy, województwa + własne role |
| 🔐 **Uprawnienia** | 15 przełączników uprawnień członków; każda rola ekipy ma dobrany zestaw; kanały dostają precyzyjne nadpisania (tylko do odczytu, prywatne, ekipa, zarząd, logi, VIP, AFK…) |
| 🤖 **AutoMod** | blokada spamu, limit wzmianek + ochrona przed raidem, oszustwa „free nitro”, zaproszenia Discord, wulgaryzmy (lista Discorda i **polska lista**), obelgi, treści seksualne, **filtr nicków i profili** – z alertami na kanał logów |
| 📨 **Gotowe treści** | profesjonalny regulamin (z paragrafami pod typ serwera), informacje, opis ról, FAQ, przewodnik dla ekipy, karty info (IP serwera, jak kupić, linki…) – wszystko jako tekst w embedach |
| 📜 **Twój regulamin i teksty** | wybierasz paragrafy regulaminu i system kar (stopniowanie / punkty ostrzeżeń / zero tolerancji), dopisujesz własne zasady i pytania FAQ oraz piszesz pierwsze ogłoszenie (z pingiem @everyone lub roli) |
| 🔑 **Dostęp do kanałów** | każdy kanał dostaje uprawnienia: kto go widzi i kto może pisać/mówić. Zalecane ustawienia są od razu, a w osobnym kroku zmienisz je dla każdej sekcji (np. „społeczność tylko do odczytu”, „kanały głosowe tylko dla ekipy”) |
| ✅ **Weryfikacja** | przycisk „Zweryfikuj się” – nowe osoby widzą tylko regulamin, po kliknięciu dostają rolę członka. Opcjonalnie: **pytanie kontrolne** przeciw botom, **minimalny wiek konta** (1/7/30 dni) i **log** każdej próby |
| 🌟 **Tryb Społeczności** | włączany automatycznie: kanały ogłoszeń, scena, ekran powitalny, kanał regulaminu i aktualizacji |
| 🧨 **Tryb czyszczenia** | opcjonalnie usuwa stare kanały, role i AutoMod (tylko właściciel, wymaga wpisania nazwy serwera) |
| ↩️ **Cofnij budowę** | nie podoba Ci się wynik? Jeden przycisk usuwa wszystko, co utworzył kreator, i przywraca ustawienia serwera (przez 2 godziny po budowie) |
| 💾 **Zapisz i wczytaj projekt** | zapisz projekt do pliku i wczytaj go później – także na innym serwerze: `/stworz projekt:<plik>` |
| ⚡ **Szybki kreator** | tylko 4 pytania (typ, nazwa, język/rozmiar, sekcje) – resztę bot dobiera sam |
| 📁 **Własne kanały** | w nowej kategorii albo dorzucone do istniejącej sekcji (np. dodatkowe kanały w „Społeczności”) |
| 👁️ **Podsumowanie i podgląd** | pełna lista kanałów i ról przed budową, szacowany czas |
| 📊 **Budowa na żywo** | pasek postępu, etapy, możliwość przerwania, raport na kanale ekipy |

---

## 📋 Wymagania

- **Node.js 18.17 lub nowszy** (zalecana wersja LTS) – [nodejs.org](https://nodejs.org)
- Konto na Discordzie i serwer, na którym masz uprawnienia **Administratora**

---

## 🚀 Instalacja krok po kroku

### 1. Utwórz bota w Discord Developer Portal
1. Wejdź na **https://discord.com/developers/applications** i kliknij **New Application**. Nadaj nazwę, np. *Kreator Serwera*.
2. Przejdź do zakładki **Bot** → kliknij **Reset Token** → **skopiuj token** (pokazuje się tylko raz!).
3. W tej samej zakładce **nie musisz** włączać żadnych „Privileged Gateway Intents” – bot ich nie potrzebuje.

### 2. Skonfiguruj bota
1. Rozpakuj archiwum ZIP.
2. Skopiuj plik `.env.example` jako `.env` (Windows: `start.bat` zrobi to za Ciebie).
3. Otwórz `.env` w Notatniku i wklej token:
   ```env
   DISCORD_TOKEN=tu_wklej_token
   ```

### 3. Uruchom
- **Windows:** kliknij dwukrotnie `start.bat`
- **Linux / macOS:** `./start.sh`
- **Ręcznie:**
  ```bash
  npm install
  node index.js
  ```

### 🌐 Hosting (Wispbyte, Pterodactyl, inne panele Node.js)
1. Wgraj pliki bota tak, żeby **`index.js` i `package.json` leżały bezpośrednio w katalogu głównym** (`/home/container`),
   a nie w podfolderze – najprościej wgrać ZIP w wersji „hosting” i kliknąć **Unarchive**.
2. W menedżerze plików utwórz plik **`.env`** (obok `index.js`) z linijką `DISCORD_TOKEN=twój_token`.
3. W zakładce **Startup** ustaw plik startowy (*JS file / Main file*) na **`index.js`**.
   ⚠️ Nie ustawiaj tam `start.sh` ani `start.bat` – to skrypty dla komputera, nie pliki JavaScript.
4. Wersja Node.js: **18.17 lub nowsza** (obraz `nodejs_18`, `nodejs_19`, `nodejs_20`… – wszystkie działają).
5. Uruchom serwer. Jeśli panel nie zainstaluje zależności sam, `index.js` zrobi to przy pierwszym starcie.

> Jeśli wolisz trzymać bota w podfolderze (np. `kreator-serwera/`), ustaw plik startowy na `kreator-serwera/index.js` –
> bot sam zainstaluje zależności, a `.env` może leżeć w podfolderze albo w `/home/container`.

W konsoli pojawi się **link zaproszenia** – otwórz go i dodaj bota na swój serwer.
Link zawiera uprawnienie **Administrator** (`permissions=8`), które jest wymagane do tworzenia ról z uprawnieniami i nadpisań kanałów.

> 💡 Komenda `/stworz` rejestruje się globalnie przy starcie (zwykle pojawia się od razu, czasem po kilku minutach).
> Jeśli chcesz, żeby pojawiła się natychmiast na serwerze testowym, wpisz jego ID w `DEV_GUILD_ID`.

### 4. Przed budową
- **Przeciągnij rolę bota na samą górę** listy ról (Ustawienia serwera → Role). Bot nie może zmieniać ani usuwać ról, które są nad nim.
- Najlepiej budować na **nowym, pustym serwerze** – albo użyć trybu czyszczenia.

---

## 🧭 Jak używać

Wpisz **`/stworz`** na serwerze (komenda jest widoczna tylko dla administratorów).

| Krok | Pytania |
|---|---|
| 1. 🧭 Typ serwera | do czego służy serwer (ustawia mądre wartości startowe) |
| 2. 📝 Nazwa i opis | nazwa, opis i cel, grupa docelowa, ikona, czy zmienić nazwę serwera |
| 3. 🌍 Język, rozmiar, wiek | PL/EN, mały–ogromny, 13+/16+/18+ |
| 4. 🎨 Wygląd | styl kanałów, styl kategorii, paleta kolorów ról, separatory, emoji w rolach |
| 5. 🧩 Sekcje | trzy menu z 31 sekcjami serwera |
| 6. ⭐ Kanały specjalne | lista elementów (gry/przedmioty/działy…), układ, co utworzyć dla każdego elementu, kanały specjalne, dodatkowe informacje (IP, linki, płatności…) |
| 7. 🛡️ Administracja | role ekipy + własne role z poziomem uprawnień, zmiana nazw głównych ról |
| 8. 🎭 Role społeczności | grupy ról + własne role specjalne i dla członków |
| 9. 🔐 Uprawnienia | co mogą członkowie (pliki, linki, wątki, kamera…), domyślne powiadomienia |
| 10. 🔑 Dostęp do kanałów | dla każdej sekcji: kto widzi (wszyscy / także przed weryfikacją / VIP / ekipa / zarząd) i kto pisze lub mówi (wszyscy / tylko odczyt / tylko wątki) |
| 11. 🛡️ Bezpieczeństwo | poziom weryfikacji, filtr multimediów, reguły AutoMod, zabezpieczenia przycisku weryfikacji |
| 12. 🔊 Kanały | slowmode, liczba lobby głosowych, kanały z limitem, czas AFK |
| 13. 📁 Własne kanały | nowe kategorie albo kanały w istniejących sekcjach, z wybranym dostępem |
| 14. 📨 Wiadomości | co bot ma opublikować, tryb Społeczności, kolor wiadomości |
| 15. 📜 Regulamin i treści | paragrafy regulaminu, system kar, własne zasady, własne FAQ, pierwsze ogłoszenie |
| 16. ⚙️ Tryb budowy | dodaj do obecnej struktury / wyczyść i zbuduj od nowa, nadanie ról |
| 📋 Podsumowanie | statystyki, uwagi, podgląd kanałów i ról, **Zapisz projekt**, **Zbuduj serwer** |

Na każdym etapie możesz przejść od razu do **Podsumowania** – pozostałe odpowiedzi zostaną uzupełnione zalecanymi ustawieniami.
Z podsumowania wrócisz do dowolnego kroku przez menu „Zmień odpowiedź w kroku…”.

---

## 🔐 Model uprawnień

| Rola | Uprawnienia |
|---|---|
| 👑 Właściciel / 💠 Współwłaściciel | Administrator |
| 🛡️ Administrator | zarządzanie serwerem, rolami, kanałami, webhookami, emoji, wydarzeniami; bany, wyrzucanie, wyciszanie; dziennik zdarzeń; @everyone |
| 🔨 Moderator | bany, wyrzucanie, wyciszanie (timeout), usuwanie i przypinanie wiadomości, wątki, nicki, kanały głosowe, dziennik zdarzeń |
| 🧰 Pomocnik | wyciszanie, usuwanie i przypinanie wiadomości, wątki, przenoszenie na kanałach głosowych |
| 🌱 Moderator próbny | wyciszanie, usuwanie wiadomości |
| 🎉 Event Manager | wydarzenia + pisanie w #wydarzenia i #konkursy |
| 🤝 Partnership Manager | pisanie w #partnerstwa |
| 💻 Developer / 🎨 Grafik | webhooki i dziennik / emoji i naklejki |
| ✅ Członek | podstawy + wybrane w kroku 9 przełączniki |

**Weryfikacja:** gdy jest włączona, `@everyone` nie ma żadnych uprawnień – nowe osoby widzą tylko regulamin i kanał weryfikacji.
Po kliknięciu przycisku dostają rolę członka, a kanał weryfikacji znika.

**Kanały (zalecane ustawienia):** ogłoszenia, regulamin i informacje są tylko do odczytu (piszą administratorzy, wskazane role i boty), kanały ekipy widzi tylko ekipa,
kanał „zarząd” tylko administracja, logi mogą czytać moderatorzy (pisać – boty z rolą *Boty*), strefę VIP – VIP-y, partnerzy i boosterzy,
na AFK nie da się mówić. Wszystko to zmienisz w kroku **„Dostęp do kanałów”** – a w podglądzie przed budową każdy kanał ma opisane, kto go widzi i kto pisze.
Nawet przy własnych ustawieniach kanał weryfikacji, regulamin (przy weryfikacji), kanał zarządu i prywatne kanały ról zachowują swoje uprawnienia.

**Bezpieczeństwo weryfikacji:** przycisk weryfikacji **nigdy** nie nada roli z uprawnieniami moderacyjnymi,
roli zarządzanej przez integrację ani roli powyżej bota – nawet gdyby ktoś podmienił wiadomość.

---

## ❓ Najczęstsze problemy

| Problem | Rozwiązanie |
|---|---|
| Nie widzę komendy `/stworz` | Poczekaj kilka minut albo ustaw `DEV_GUILD_ID`. Komendę widzą tylko osoby z uprawnieniem Administrator. |
| „Bot potrzebuje uprawnienia Administrator” | Ustawienia serwera → Role → rola bota → włącz **Administrator** (albo zaproś bota linkiem z konsoli). |
| Niektóre role nie zostały usunięte | Są powyżej roli bota – przeciągnij rolę bota na samą górę i uruchom czyszczenie ponownie. |
| Kanały ogłoszeń / scena są zwykłymi kanałami | Tryb Społeczności był wyłączony lub Discord go odrzucił – włącz go w kroku 14. |
| Przycisk weryfikacji nie działa | Bot musi być **online** – przycisk obsługuje ten sam bot. |
| Hosting: `SyntaxError: Invalid or unexpected token` w `start.sh` | Jako plik startowy ustaw **`index.js`**, a nie `start.sh`. |
| Hosting: `Cannot find module 'discord.js'` | Ustaw plik startowy na `index.js` – doinstaluje zależności sam – albo wgraj pliki do katalogu głównego. |
| Panel przestał się odświeżać przy bardzo dużym serwerze | Budowa trwa dalej w tle; podsumowanie trafi na kanał ekipy i w wiadomości prywatnej. |

---

## 🗂️ Struktura projektu

```
kreator-serwera/
├── index.js                    # plik startowy (ustaw go na hostingu)
├── src/
│   ├── index.js                # klient Discord, rejestracja /stworz, obsługa interakcji
│   ├── config.js               # wczytywanie .env i walidacja konfiguracji
│   ├── commands/stworz.js      # definicja jedynej komendy
│   ├── wizard/                 # panel kreatora
│   │   ├── router.js           # ekrany i nawigacja
│   │   ├── steps.js            # 16 kroków z pytaniami
│   │   ├── project.js          # zapis i wczytywanie projektu (JSON)
│   │   ├── undo.js             # cofanie budowy
│   │   ├── defaults.js         # zalecane odpowiedzi zależne od typu i rozmiaru
│   │   ├── preview.js          # podsumowanie i podgląd kanałów/ról
│   │   ├── build.js            # budowa z paskiem postępu
│   │   ├── sessions.js         # sesje (1 na serwer, wygasanie)
│   │   └── ui.js               # wspólne elementy interfejsu
│   ├── builder/
│   │   ├── blueprint.js        # odpowiedzi → kompletny plan serwera (JSON)
│   │   ├── permissions.js      # zestawy uprawnień i profile nadpisań kanałów
│   │   ├── executor.js         # tworzenie wszystkiego na serwerze
│   │   ├── content.js          # regulamin, informacje, opis ról, FAQ…
│   │   └── naming.js           # style nazw, parsowanie list i kolorów
│   ├── data/                   # katalogi: typy serwerów, moduły, role, style, AutoMod
│   ├── features/               # przycisk weryfikacji (działa na stałe)
│   └── utils/                  # logger, tłumaczenia PL/EN
├── test/                       # testy (atrapa Discorda – bez tokenu)
├── .env.example
├── start.bat / start.sh
└── package.json
```

## 🧪 Testy

```bash
npm test
```

Testy nie łączą się z Discordem – używają atrapy serwera, która sprawdza wszystkie limity Discorda
(długości nazw, 50 kanałów na kategorię, 500 kanałów, 250 ról, limity embedów i komponentów, wymagania trybu Społeczności, reguły AutoMod).
Symulują pełne przejście kreatora dla każdego typu serwera i pełną budowę w trybie dodawania i czyszczenia.

---

## 📄 Licencja

MIT – możesz dowolnie używać i modyfikować.
