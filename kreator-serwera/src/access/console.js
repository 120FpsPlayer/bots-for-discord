'use strict';

const readline = require('node:readline');
const { formatCode, normalizeCode, MAX_BATCH, MAX_USES } = require('./codes');
const { PACKAGES, FEATURES, packageOf } = require('./packages');

/**
 * Komendy wpisywane w konsoli bota (na Wispbyte/Pterodactyl: pole „Type a command…” pod konsolą).
 * Służą sprzedawcy do generowania i zarządzania kodami dostępu do /stworz.
 */

const HELP = [
  '┌─ Kreator Serwera – komendy konsoli ─────────────────────────────',
  '│ kod                    – nowy kod dostępu (1 budowa serwera)',
  '│ kod 5                  – 5 kodów naraz',
  '│ kod 1 3                – 1 kod na 3 budowy',
  '│ kod 1 1 Jan Kowalski   – kod z notatką (np. dla kogo / nr zamówienia)',
  '│   opcje do „kod”:  pakiet=basic|standard|premium  szablon=<id>  dni=30',
  '│   np. kod pakiet=premium szablon=mc-premium dni=14 Jan #12',
  '│ kody                   – aktywne kody   │ kody wszystkie – także zużyte i anulowane',
  '│ info <kod>             – szczegóły i historia użyć kodu',
  '│ anuluj <kod>           – unieważnia kod (także na przypisanym serwerze)',
  '│ dodaj <kod> [ile]      – dodaje budowy do kodu (domyślnie 1)',
  '│ waznosc <kod> <dni|bez> – zmienia termin ważności kodu',
  '│ pakiety                – co zawiera każdy pakiet',
  '│ szablony               – zapisane szablony │ szablon info|usun <id>',
  '│ wyjscia                – zaplanowane wyjścia bota │ zostan <id serwera> – odwołuje',
  '│ serwery                – serwery, na których jest bot',
  '│ wyjdz <id serwera>     – bot opuszcza serwer',
  '│ status                 – stan bota',
  '│ stop                   – wyłącza bota',
  '└─────────────────────────────────────────────────────────────────',
];

const date = (iso) => (iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const budowy = (n) => (n === 1 ? 'budowa' : n >= 2 && n <= 4 ? 'budowy' : 'budów');
const pad = (s, n) => String(s).padEnd(n);

function codeBox(records) {
  const width = 45;
  const line = (text = '') => `║ ${pad(text, width - 4)} ║`;
  const out = [`╔${'═'.repeat(width - 2)}╗`];
  out.push(line(records.length === 1 ? '🔑 Nowy kod dostępu' : `🔑 Nowe kody dostępu (${records.length})`));
  out.push(line());
  for (const r of records) out.push(line(formatCode(r.code)));
  out.push(line());
  const r0 = records[0];
  out.push(line(`Każdy kod: ${r0.uses} ${budowy(r0.uses)} serwera`));
  const pkg = packageOf(r0.package);
  out.push(line(`Pakiet: ${pkg.label}${r0.package ? '' : ' (domyślny)'}`));
  if (r0.template) out.push(line(`Szablon: ${r0.template}`));
  if (r0.expiresAt) out.push(line(`Ważny do: ${date(r0.expiresAt)}`));
  if (r0.note) out.push(line(`Notatka: ${r0.note.slice(0, width - 14)}`));
  out.push(line('Kupujący wpisuje kod po użyciu /stworz'));
  out.push(`╚${'═'.repeat(width - 2)}╝`);
  return out;
}

/**
 * Wykonuje jedną komendę konsoli. Zwraca { lines, stop } – czysta funkcja (łatwa do testów).
 * ctx: { codes, client?, store? }
 */
async function runCommand(input, { codes, client, store, templates = null, leaver = null }) {
  const line = String(input || '').trim();
  if (!line) return { lines: [] };
  const [rawCmd, ...args] = line.split(/\s+/);
  const cmd = rawCmd.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ł', 'l');

  try {
    switch (cmd) {
      case 'pomoc': case 'help': case '?': case 'komendy':
        return { lines: HELP };

      case 'kod': case 'generuj': case 'nowykod': {
        // kod [ilość] [budowy] [pakiet=…] [szablon=…] [dni=…] [notatka…] – liczby tylko na początku.
        const opts = {};
        const rest = [];
        for (const a of args) {
          const m = a.match(/^(pakiet|p|szablon|s|dni|d|waznosc)=(.*)$/i);
          if (m) opts[{ p: 'pakiet', s: 'szablon', d: 'dni', waznosc: 'dni' }[m[1].toLowerCase()] || m[1].toLowerCase()] = m[2];
          else rest.push(a);
        }
        const nums = [];
        let i = 0;
        while (i < rest.length && nums.length < 2 && /^\d+$/.test(rest[i])) nums.push(Number(rest[i++]));
        const [count = 1, uses = 1] = nums;
        const note = rest.slice(i).join(' ');
        if (count < 1 || count > MAX_BATCH) return { lines: [`✖ Ilość kodów: 1–${MAX_BATCH}.`] };
        if (uses < 1 || uses > MAX_USES) return { lines: [`✖ Liczba budów na kod: 1–${MAX_USES}.`] };
        const pkg = opts.pakiet ? opts.pakiet.toLowerCase() : null;
        if (pkg && !PACKAGES[pkg]) return { lines: [`✖ Nie ma pakietu „${opts.pakiet}”. Dostępne: ${Object.keys(PACKAGES).join(', ')}.`] };
        const template = opts.szablon ? opts.szablon.toLowerCase() : null;
        if (template && !templates?.exists(template)) return { lines: [`✖ Nie ma szablonu „${opts.szablon}”. Lista: szablony.`] };
        const days = opts.dni !== undefined ? Number(opts.dni) : null;
        if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) return { lines: ['✖ Ważność: dni=1–3650.'] };
        return { lines: codeBox(codes.generate({ count, uses, note, pkg, template, days })) };
      }

      case 'kody': case 'lista': {
        const all = ['wszystkie', 'all', 'wszystko'].includes((args[0] || '').toLowerCase());
        const list = codes.list().filter((r) => all || (!r.revokedAt && r.remaining > 0));
        if (!list.length) return { lines: [all ? 'Brak kodów. Wpisz „kod”, aby wygenerować.' : 'Brak aktywnych kodów. Wpisz „kod”, aby wygenerować (albo „kody wszystkie”).'] };
        const lines = [`${all ? 'Wszystkie kody' : 'Aktywne kody'} (${list.length}):`];
        lines.push(`  ${pad('KOD', 23)}  ${pad('STATUS', 16)}  ${pad('UŻYCIA', 6)}  ${pad('UTWORZONY', 17)}  NOTATKA / SERWER`);
        for (const r of list) {
          const where = r.boundGuilds.length ? `serwer ${r.boundGuilds.join(', ')}` : '';
          const extra = [r.package ? `pakiet ${r.package}` : null, r.template ? `szablon ${r.template}` : null, r.expiresAt ? `do ${date(r.expiresAt)}` : null];
          lines.push(`  ${formatCode(r.code)}  ${pad(r.status, 16)}  ${pad(`${r.used}/${r.uses}`, 6)}  ${pad(date(r.createdAt), 17)}  ${[...extra, r.note, where].filter(Boolean).join(' • ')}`);
        }
        return { lines };
      }

      case 'info': case 'sprawdz': {
        if (!args[0]) return { lines: ['Użycie: info <kod>'] };
        const r = codes.find(args.join(''));
        if (!r) return { lines: [`✖ Nie znaleziono kodu ${normalizeCode(args.join('')).slice(0, 30)}.`] };
        const lines = [
          `Kod ${formatCode(r.code)}`,
          `  Status:     ${r.status}${r.revokedAt ? ` (${date(r.revokedAt)})` : ''}`,
          `  Użycia:     ${r.used}/${r.uses} (pozostało ${r.remaining})`,
          `  Utworzony:  ${date(r.createdAt)}`,
          `  Pakiet:     ${packageOf(r.package).label}${r.package ? '' : ' (domyślny)'}`,
          r.template ? `  Szablon:    ${r.template}` : null,
          `  Ważność:    ${r.expiresAt ? date(r.expiresAt) : 'bez terminu'}`,
          r.note ? `  Notatka:    ${r.note}` : null,
          r.boundGuilds.length ? `  Przypisany: serwer ${r.boundGuilds.join(', ')}` : null,
          r.lastRedeem ? `  Wpisany:    ${date(r.lastRedeem.at)} na „${r.lastRedeem.guildName}” (${r.lastRedeem.guildId}) przez ${r.lastRedeem.userId}` : null,
        ].filter(Boolean);
        if (r.builds.length) {
          lines.push('  Budowy:');
          for (const b of r.builds) lines.push(`    • ${date(b.at)} – ${b.kind} na „${b.guildName}” (${b.guildId})${b.refunded ? ' – zwrócona (nieudana/cofnięta)' : ''}`);
        }
        return { lines };
      }

      case 'anuluj': case 'usunkod': case 'zablokuj': {
        if (!args[0]) return { lines: ['Użycie: anuluj <kod>'] };
        const r = codes.revoke(args.join(''));
        return { lines: [r ? `✔ Kod ${formatCode(r.code)} anulowany – nie da się go już użyć.` : '✖ Nie znaleziono takiego kodu.'] };
      }

      case 'dodaj': {
        if (!args[0]) return { lines: ['Użycie: dodaj <kod> [ile budów]'] };
        const n = args[1] && /^\d+$/.test(args[1]) ? Number(args[1]) : 1;
        const r = codes.addUses(args[0], n);
        return { lines: [r ? `✔ Kod ${formatCode(r.code)}: teraz ${r.used}/${r.uses} użyć (pozostało ${r.uses - r.used}).` : '✖ Nie znaleziono takiego kodu.'] };
      }

      case 'waznosc': case 'wazny': {
        if (!args[0] || !args[1]) return { lines: ['Użycie: waznosc <kod> <dni|bez>'] };
        const none = ['bez', 'brak', '0', 'nigdy'].includes(args[1].toLowerCase());
        const days = Number(args[1]);
        if (!none && (!Number.isInteger(days) || days < 1 || days > 3650)) return { lines: ['✖ Podaj liczbę dni (1–3650) albo „bez”.'] };
        const r = codes.setExpiry(args[0], none ? null : days);
        if (!r) return { lines: ['✖ Nie znaleziono takiego kodu.'] };
        return { lines: [`✔ Kod ${formatCode(r.code)}: ${r.expiresAt ? `ważny do ${date(r.expiresAt)}` : 'bez terminu ważności'}.`] };
      }

      case 'pakiety': {
        const lines = ['Pakiety (wybierasz przy generowaniu: kod pakiet=…):'];
        for (const p of Object.values(PACKAGES)) {
          lines.push(`  ${p.emoji} ${pad(p.key, 9)} ${p.label} – ${p.description}`);
          lines.push(`     kreator: ${p.full ? 'pełny (19 kroków)' : 'szybki (4 pytania + tryb budowy)'} • import projektu: ${p.import ? 'tak' : 'nie'}`);
          lines.push(`     dodatki: ${p.features.map((f) => FEATURES[f].label).join(', ') || 'brak'}`);
        }
        lines.push('  Kod bez pakietu = premium. Wiadomości jako serwer, przewodnik i podgląd są w każdym pakiecie.');
        return { lines };
      }

      case 'szablony': {
        const list = templates?.list() || [];
        if (!list.length) return { lines: ['Brak szablonów. Zaprojektuj serwer w /stworz (jako właściciel bota) i kliknij „Zapisz jako szablon” w podsumowaniu.'] };
        return {
          lines: [`Szablony (${list.length}):`, ...list.map((t) => `  ${pad(t.id, 24)} ${pad(t.name, 28)} ${t.stats ? `${t.stats.channels} kan. • ${t.stats.roles} ról` : ''}  budowy: ${t.uses}`)],
        };
      }

      case 'szablon': {
        const [sub, id] = args;
        if (!templates || !['info', 'usun'].includes((sub || '').toLowerCase().replace('ń', 'n')) || !id) return { lines: ['Użycie: szablon info <id> | szablon usun <id>'] };
        const t = templates.get(id);
        if (!t) return { lines: [`✖ Nie ma szablonu „${id}”.`] };
        if (sub.toLowerCase().startsWith('us')) {
          templates.delete(t.id);
          return { lines: [`✔ Szablon „${t.name}” (${t.id}) usunięty. Kody z tym szablonem przestaną działać.`] };
        }
        return {
          lines: [
            `Szablon ${t.id} – ${t.name}`,
            t.description ? `  Opis:      ${t.description}` : null,
            `  Typ:       ${t.type || '—'}`,
            t.stats ? `  Struktura: ${t.stats.categories} kategorii, ${t.stats.channels} kanałów, ${t.stats.roles} ról` : null,
            `  Zapisany:  ${date(t.updatedAt || t.createdAt)} • budowy z szablonu: ${t.uses || 0}`,
            `  Kod:       kod szablon=${t.id}`,
          ].filter(Boolean),
        };
      }

      case 'wyjscia': {
        const list = leaver?.list() || [];
        if (!list.length) return { lines: ['Brak zaplanowanych wyjść bota.'] };
        return { lines: ['Zaplanowane wyjścia bota:', ...list.map((w) => `  ${w.guildId}  ${pad((w.guildName || '').slice(0, 30), 30)}  ${date(new Date(w.at).toISOString())}`)] };
      }

      case 'zostan': {
        if (!args[0]) return { lines: ['Użycie: zostan <id serwera> – odwołuje zaplanowane wyjście bota.'] };
        return { lines: [leaver?.cancel(args[0]) ? '✔ Wyjście odwołane – bot zostaje na serwerze.' : '✖ Nie ma zaplanowanego wyjścia dla tego serwera.'] };
      }

      case 'serwery': {
        const guilds = [...(client?.guilds?.cache?.values() || [])];
        if (!guilds.length) return { lines: ['Bot nie jest na żadnym serwerze.'] };
        return {
          lines: [`Serwery (${guilds.length}):`, ...guilds.map((g) => {
            const grant = codes.grantFor(g.id);
            return `  ${g.id}  ${pad(g.name.slice(0, 40), 40)}  👥 ${pad(g.memberCount ?? '?', 6)}  ${grant ? `kod ${formatCode(grant.code)} (pozostało ${grant.remaining})` : ''}`;
          })],
        };
      }

      case 'wyjdz': case 'opusc': {
        const guild = client?.guilds?.cache?.get(args[0]);
        if (!guild) return { lines: ['Użycie: wyjdz <id serwera> (listę pokaże „serwery”).'] };
        if (store?.lockedBy(guild.id)) return { lines: [`✖ Na serwerze trwa: ${store.lockedBy(guild.id)} – spróbuj za chwilę.`] };
        await guild.leave();
        return { lines: [`✔ Bot opuścił serwer „${guild.name}”.`] };
      }

      case 'status': {
        const list = codes.list();
        const up = Math.round(process.uptime());
        return {
          lines: [
            `Bot: ${client?.user?.tag || 'niezalogowany'} • serwery: ${client?.guilds?.cache?.size ?? 0} • działa ${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} min`,
            `Kody: ${list.filter((r) => !r.revokedAt && r.remaining > 0).length} aktywnych, ${list.filter((r) => r.status === 'zużyty').length} zużytych, ${list.filter((r) => r.revokedAt).length} anulowanych`,
            `Budowy z kodów: ${list.reduce((n, r) => n + r.builds.filter((b) => !b.refunded).length, 0)} • otwarte kreatory: ${store?.size ?? 0}`,
            `Plik kodów: ${codes.file}`,
          ],
        };
      }

      case 'stop': case 'exit': case 'wylacz':
        return { lines: ['Wyłączam bota…'], stop: true };

      default:
        return { lines: [`Nieznana komenda „${rawCmd.slice(0, 30)}”. Wpisz „pomoc”, aby zobaczyć listę.`] };
    }
  } catch (err) {
    return { lines: [`✖ ${err.message}`] };
  }
}

/** Nasłuchuje komend na standardowym wejściu (konsola hostingu / terminal). */
function startConsole({ codes, client, store, templates, leaver, onStop, output = console.log }) {
  if (!process.stdin || process.stdin.destroyed) return null;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async (line) => {
    const { lines, stop } = await runCommand(line, { codes, client, store, templates, leaver });
    for (const l of lines) output(l);
    if (stop) onStop?.();
  });
  rl.on('error', () => {});
  return rl;
}

module.exports = { runCommand, startConsole, HELP };
