'use strict';

const { buildBlueprint, ONBOARDING_GROUPS } = require('../builder/blueprint');
const { BOTS, BOT_CATEGORIES, BOT_MENUS } = require('../data/bots');
const { MODULES } = require('../data/modules');
const { allows, lockLabel } = require('../access/packages');
const gfx = require('../graphics/engine');
const { BANNER_STYLES, DEFAULT_BANNER_STYLE } = require('../graphics/banners');
const { PALETTES, EMBED_COLORS } = require('../data/styles');
const { tr } = require('../utils/i18n');
const { markTouched } = require('./defaults');
const {
  cid, selectRow, button, row, field, clip, yesNo, ButtonStyle,
} = require('./ui');

/**
 * Kroki dodatkowe: Onboarding Discorda, Boty oraz Grafika i nadawca wiadomości.
 * s.pkg – pakiet kodu dostępu (null = bez ograniczeń); zablokowane funkcje są widoczne, ale wyłączone.
 */

const locked = (s, feature) => !allows(s.pkg, feature);
const lockField = (feature) => field('🔒 Niedostępne w Twoim pakiecie', `Ta funkcja jest w ${lockLabel(feature).replace('🔒 ', '')}. Skontaktuj się ze sprzedawcą, jeśli chcesz ją dokupić.`);

// ───────────────────────────── ONBOARDING ─────────────────────────────

const onboardingStep = {
  id: 'onboarding',
  emoji: '🧭',
  title: 'Onboarding Discorda',
  intro: 'Onboarding to wbudowane pytania Discorda, które widzi każda nowa osoba (np. „W co grasz?”, „Jaki kolor nicku?”, „Jakie powiadomienia?”). **Discord sam nadaje wybrane role i pokazuje wybrane kanały – bez żadnego bota.** Wymaga trybu Społeczności i nie działa razem z sekcją „Weryfikacja”.',
  render(s) {
    const a = s.answers;
    const ob = a.onboarding || {};
    if (locked(s, 'onboarding')) return { fields: [lockField('onboarding')], rows: [] };
    const bp = buildBlueprint({ ...a, onboarding: { ...ob, enabled: true } });
    const reason = bp.warnings.find((w) => w.startsWith('Onboarding pominięty'));
    const groups = new Set(ob.groups?.length ? ob.groups : Object.keys(ONBOARDING_GROUPS));
    const prompts = bp.onboarding?.prompts || [];
    return {
      fields: [
        field('🧭 Onboarding', ob.enabled ? '✅ **włączony**' : '❌ wyłączony', true),
        field('❗ Pytania obowiązkowe', yesNo(ob.required), true),
        field(reason ? '⚠️ Teraz nie zadziała' : `❓ Pytania (${prompts.length})`, reason
          ? reason.replace('Onboarding pominięty – ', '')
          : prompts.map((p) => `• **${clip(p.title, 60)}** – ${p.options.length} odp.${p.single ? ' (jedna)' : ''}`).join('\n') || '*brak – włącz grupy ról w kroku „Role społeczności”*'),
        field('💡 Jak to działa?', 'Nowa osoba odpowiada na pytania zaraz po wejściu. Kanały tematyczne (np. gier) pojawią się tylko u osób, które je wybrały – reszta może je dodać w „Przeglądaj kanały”.'),
      ],
      rows: [
        selectRow(cid(s, 's', 'obon'), {
          placeholder: 'Włączyć onboarding?',
          options: [
            { value: 'on', label: 'Tak – włącz onboarding', description: 'Pytania przy wejściu nadają role i kanały', emoji: '✅', default: Boolean(ob.enabled) },
            { value: 'off', label: 'Nie – bez onboardingu', emoji: '❌', default: !ob.enabled },
          ],
        }),
        selectRow(cid(s, 's', 'obgroups'), {
          placeholder: '❓ O co pytać?',
          min: 1,
          max: Object.keys(ONBOARDING_GROUPS).length,
          disabled: !ob.enabled,
          options: Object.entries(ONBOARDING_GROUPS).map(([key, g]) => ({
            value: key, label: g.label, emoji: g.emoji, default: groups.has(key),
            description: key === 'items' ? 'Wybór daje rolę i kanały danej gry/trybu/działu' : 'Wymaga tej grupy ról w kroku „Role społeczności”',
          })),
        }),
        selectRow(cid(s, 's', 'obreq'), {
          placeholder: 'Czy pytania są obowiązkowe?',
          disabled: !ob.enabled,
          options: [
            { value: 'no', label: 'Nie – można pominąć', emoji: '⏭️', default: !ob.required },
            { value: 'yes', label: 'Tak – trzeba odpowiedzieć', emoji: '❗', default: Boolean(ob.required) },
          ],
        }),
      ],
    };
  },
  select: {
    obon(s, [v]) {
      if (locked(s, 'onboarding')) return;
      s.answers.onboarding.enabled = v === 'on';
      markTouched(s.answers, 'onboarding.enabled');
    },
    obgroups(s, values) { s.answers.onboarding.groups = values.filter((v) => ONBOARDING_GROUPS[v]); },
    obreq(s, [v]) { s.answers.onboarding.required = v === 'yes'; },
  },
};

// ───────────────────────────── BOTY ─────────────────────────────

function botOptions(s, menu) {
  const chosen = new Set(s.answers.bots || []);
  return Object.values(BOTS)
    .filter((b) => BOT_MENUS[menu].includes(b.category))
    .map((b) => ({
      value: b.key,
      label: `${b.name} – ${BOT_CATEGORIES[b.category].label}`,
      description: clip(b.description, 100),
      emoji: b.emoji,
      default: chosen.has(b.key),
    }));
}

const botsStep = {
  id: 'bots',
  emoji: '🤖',
  title: 'Popularne boty',
  intro: 'Wybierz boty, których chcesz używać na serwerze. Kreator przygotuje pod nie **kanały** (np. #awanse, #tickety, #bump) i **rolę „Boty”** z dostępem, a po budowie dostaniesz **linki zaproszeń** (dodanie bota = jedno kliknięcie „Autoryzuj”) i instrukcję, co ustawić w panelu każdego bota.',
  render(s) {
    if (locked(s, 'bots')) return { fields: [lockField('bots')], rows: [] };
    const chosen = (s.answers.bots || []).filter((k) => BOTS[k]);
    const channels = new Set();
    for (const k of chosen) for (const n of BOTS[k].needs) if (MODULES[n.module]) channels.add(MODULES[n.module].label);
    return {
      fields: [
        field(`🤖 Wybrane boty (${chosen.length})`, chosen.map((k) => `${BOTS[k].emoji} **${BOTS[k].name}** – ${BOTS[k].description}`).join('\n') || '*żadne – serwer bez dodatkowych botów*'),
        field('📁 Kreator doda sekcje/kanały', [...channels].join(', ') || '*nic dodatkowego*'),
        field('ℹ️ Dlaczego nie dodam botów sam?', 'Discord pozwala dodać bota tylko osobie, która kliknie „Autoryzuj” – dlatego dostaniesz gotowe linki z wybranym serwerem.'),
      ],
      rows: [
        selectRow(cid(s, 's', 'botsa'), { placeholder: '🆙 Poziomy, moderacja, powitania, tickety, weryfikacja…', min: 0, max: 25, options: botOptions(s, 'a') }),
        selectRow(cid(s, 's', 'botsb'), { placeholder: '🎵 Muzyka, statystyki, konkursy, wydarzenia, zabawa…', min: 0, max: 25, options: botOptions(s, 'b') }),
      ],
    };
  },
  select: {
    botsa(s, values) { setBots(s, 'a', values); },
    botsb(s, values) { setBots(s, 'b', values); },
  },
};

function setBots(s, menu, values) {
  if (locked(s, 'bots')) return;
  const inMenu = new Set(Object.values(BOTS).filter((b) => BOT_MENUS[menu].includes(b.category)).map((b) => b.key));
  const keep = (s.answers.bots || []).filter((k) => !inMenu.has(k));
  s.answers.bots = [...keep, ...values.filter((v) => BOTS[v])];
  const verifiers = s.answers.bots.filter((k) => BOTS[k].category === 'verification' && k !== 'wick');
  if (verifiers.length && !s.answers.modules.includes('verification')) {
    s.flash = `ℹ️ ${BOTS[verifiers[0]].name} to bot weryfikacyjny – kreator doda sekcję „Weryfikacja” (kanał i rolę członka). Onboarding nie działa razem z nią.`;
  }
}

// ───────────────────────────── GRAFIKA ─────────────────────────────

const SENDERS = {
  server: { emoji: '🏷️', label: 'Jako serwer (nazwa i logo serwera)', description: 'Wiadomości wyglądają, jakby wysłał je serwer – nie bot' },
  bot: { emoji: '🤖', label: 'Jako bot Kreator Serwera', description: 'Wiadomości z nazwą i avatarem bota' },
};
const GFX = {
  banners: { emoji: '🏞️', label: 'Banery nad treściami', description: 'Grafika z tytułem nad regulaminem, informacjami, FAQ…' },
  icon: { emoji: '🖼️', label: 'Ikona z inicjałów', description: 'Gdy nie podasz logo, a serwer nie ma ikony' },
  emojiPack: { emoji: '😀', label: 'Paczka emoji serwera', description: 'Statusy, ✔/✖, strzałki i odznaki w kolorze serwera' },
};

const graphicsStep = {
  id: 'graphics',
  emoji: '🎨',
  title: 'Grafika i nadawca wiadomości',
  intro: 'Nadaj serwerowi dopracowany wygląd: **banery** nad regulaminem i informacjami (10 stylów – od futurystycznego po realistyczny), **ikona** z inicjałów (gdy nie masz logo) i **paczka emoji** w kolorach serwera. Wiadomości mogą przyjść **jako serwer** (nazwa i logo serwera) – po usunięciu bota nic nie zdradza, że serwer zbudował kreator.',
  render(s) {
    const a = s.answers;
    const g = a.graphics || {};
    const sender = SENDERS[a.content.sender] || SENDERS.server;
    const canDraw = gfx.available();
    const style = BANNER_STYLES[g.bannerStyle] ? g.bannerStyle : DEFAULT_BANNER_STYLE;
    const showBanner = canDraw && g.banners && !locked(s, 'banners');
    return {
      fields: [
        field('✉️ Nadawca wiadomości', `${sender.emoji} ${sender.label}`, true),
        field('🎨 Grafiki', Object.entries(GFX).map(([k, d]) => `${g[k] && !locked(s, k) ? '✅' : '❌'} ${d.emoji} ${d.label}${locked(s, k) ? ` (${lockLabel(k)})` : ''}`).join('\n'), true),
        g.banners && !locked(s, 'banners') ? field('🏞️ Styl banerów', `${BANNER_STYLES[style].emoji} **${BANNER_STYLES[style].label}**\n${BANNER_STYLES[style].description}`, true) : null,
        a.basics.iconUrl ? field('🖼️ Logo', 'Podane w kroku „Nazwa i opis” – zostanie ustawione jako ikona serwera.') : null,
        !canDraw ? field('⚠️ Grafika niedostępna', `Biblioteka graficzna nie działa na tym hostingu – banery, ikona i emoji zostaną pominięte (${gfx.unavailableReason() || 'brak'}).`) : null,
        field('👁️ Podgląd', showBanner
          ? 'Poniżej widzisz baner w wybranym stylu i kolorze serwera. **Porównaj style** pokaże wszystkie 10 obok siebie.'
          : 'Kliknij **Podgląd serwera**, aby zobaczyć obrazek z kanałami i rolami.'),
      ].filter(Boolean),
      // Podgląd baneru dołączany do embedu (router rysuje go asynchronicznie).
      image: showBanner ? {
        style,
        title: a.language === 'en' ? 'Rules' : 'Regulamin',
        subtitle: a.basics.name || s.env?.guildName || '',
        emoji: '📜',
        color: bannerColor(a),
      } : null,
      rows: [
        selectRow(cid(s, 's', 'sender'), {
          placeholder: '✉️ Kto wysyła wiadomości?',
          options: Object.entries(SENDERS).map(([value, d]) => ({ value, label: d.label, description: d.description, emoji: d.emoji, default: (a.content.sender || 'server') === value })),
        }),
        selectRow(cid(s, 's', 'gfx'), {
          placeholder: '🎨 Grafiki…',
          min: 0,
          max: Object.keys(GFX).length,
          options: Object.entries(GFX).map(([value, d]) => ({
            value, emoji: d.emoji, default: Boolean(g[value]) && !locked(s, value),
            label: locked(s, value) ? `${d.label} (${lockLabel(value)})` : d.label,
            description: d.description,
          })),
        }),
        selectRow(cid(s, 's', 'bstyle'), {
          placeholder: '🏞️ Styl banerów…',
          disabled: !g.banners || locked(s, 'banners'),
          options: Object.entries(BANNER_STYLES).map(([value, d]) => ({ value, label: d.label, description: d.description, emoji: d.emoji, default: value === style })),
        }),
        row(
          button(cid(s, 'n', 'pgal'), 'Porównaj style', { emoji: '🎨', disabled: !canDraw || locked(s, 'banners') }),
          button(cid(s, 'n', 'pimg'), 'Podgląd serwera', { emoji: '🖼️', disabled: !canDraw }),
        ),
      ],
    };
  },
  select: {
    sender(s, [v]) { s.answers.content.sender = v === 'bot' ? 'bot' : 'server'; },
    bstyle(s, [v]) {
      if (!BANNER_STYLES[v]) return;
      s.answers.graphics.bannerStyle = v;
      markTouched(s.answers, 'graphics.bannerStyle');
    },
    gfx(s, values) {
      const g = s.answers.graphics;
      const blocked = [];
      for (const key of Object.keys(GFX)) {
        const want = values.includes(key);
        if (want && locked(s, key)) blocked.push(GFX[key].label);
        g[key] = want && !locked(s, key);
      }
      if (blocked.length) s.flash = `🔒 Niedostępne w Twoim pakiecie: ${blocked.join(', ')}.`;
    },
  },
};

/** Kolor banerów = kolor wiadomości serwera (paleta albo wybrany kolor embedów). */
function bannerColor(a) {
  const key = a.content?.embedColor;
  if (key && key !== 'palette' && EMBED_COLORS[key]) return EMBED_COLORS[key].color;
  return (PALETTES[a.style?.palette] || PALETTES.modern).embed;
}

// ───────────────────────────── TRYB: wyjście bota i przewodnik ─────────────────────────────

const LEAVE_OPTIONS = {
  no: { emoji: '🏠', label: 'Zostaje na serwerze', description: 'Możesz dalej używać /usun i „Cofnij budowę”' },
  after: { emoji: '⏳', label: 'Wychodzi po 2 godzinach', description: 'Gdy minie czas na cofnięcie budowy' },
  now: { emoji: '🚪', label: 'Wychodzi zaraz po budowie', description: 'Po minucie – bez możliwości cofnięcia' },
};

module.exports = {
  onboardingStep, botsStep, graphicsStep, LEAVE_OPTIONS, SENDERS, GFX, bannerColor, tr,
};
