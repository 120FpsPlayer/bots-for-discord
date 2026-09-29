'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { MODULES, MODULE_GROUPS } = require('../data/modules');
const { STAFF_ROLES, STAFF_LEVELS, ROLE_GROUP_OPTIONS } = require('../data/roles');
const { CHANNEL_STYLES, CATEGORY_STYLES, PALETTES, EMBED_COLORS } = require('../data/styles');
const {
  VERIFICATION_LEVELS, CONTENT_FILTERS, NOTIFICATION_OPTIONS, AUTOMOD_OPTIONS,
} = require('../data/security');
const { MEMBER_TOGGLES, VIEW_OPTIONS, WRITE_OPTIONS, describeAccess } = require('../builder/permissions');
const { buildBlueprint } = require('../builder/blueprint');
const { CATEGORIES } = require('../data/modules');
const { CONTENT_OPTIONS, RULE_SECTIONS, PUNISHMENT_STYLES } = require('../builder/content');
const N = require('../builder/naming');
const { tr } = require('../utils/i18n');
const { SIZES, AGES, LANGUAGES, applyDefaults, markTouched } = require('./defaults');
const {
  cid, selectRow, button, row, modal, modalText, modalSelect, field, clip, yesNo, ButtonStyle,
} = require('./ui');

/**
 * Kroki kreatora. Każdy krok:
 *   render(s)  → { lines, fields, rows }  (rows ≤ 4 – piąty wiersz to nawigacja)
 *   select[id](s, values)                  – obsługa menu wyboru
 *   button[id](s)  → { modal } | undefined – obsługa przycisków
 *   modal[id](s, interaction)              – obsługa formularzy
 *   validate(s) → komunikat błędu albo null (blokuje „Dalej”)
 */

const preset = (s) => SERVER_TYPES[s.answers.type];
const LIST_MAX = 25;

function opts(entries, selected, map) {
  const set = new Set([].concat(selected));
  return entries.map(([value, def]) => ({ value: String(value), default: set.has(String(value)) || set.has(value), ...map(def, value) }));
}

function listPreview(items, max = 900) {
  if (!items.length) return '*brak*';
  return clip(items.map((i) => `\`${i}\``).join(' • '), max);
}

// ───────────────────────────── 1. TYP ─────────────────────────────

const typeStep = {
  id: 'type',
  emoji: '🧭',
  title: 'Typ serwera',
  intro: 'Do czego ma służyć serwer? Wybrany typ ustawi mądre domyślne odpowiedzi w kolejnych krokach – wszystko możesz potem zmienić.',
  render(s) {
    const p = preset(s);
    const lines = [];
    const fields = [];
    if (s.typeChosen) {
      lines.push(`**Wybrano:** ${p.emoji} **${p.label}**\n> ${p.description}`);
      const extras = (p.extras || []).filter((e) => e.default).map((e) => tr(e.name, 'pl'));
      fields.push(field('📦 Zawartość presetu', [
        `• **${s.answers.modules.length}** sekcji (regulamin, ogłoszenia, czat…)`,
        p.list ? `• lista **${p.list.title.toLowerCase()}**: ${p.list.defaults.slice(0, 6).join(', ') || '—'}` : null,
        extras.length ? `• kanały specjalne: ${extras.slice(0, 8).map((e) => `#${e}`).join(', ')}` : null,
        p.staffExtras?.length ? `• role ekipy: ${p.staffExtras.map((e) => tr(e.name, 'pl')).join(', ')}` : null,
        p.specials?.length ? `• role specjalne: ${p.specials.map((e) => tr(e.name, 'pl')).join(', ')}` : null,
      ].filter(Boolean).join('\n')));
      fields.push(field('💡 Wskazówka', 'Kliknij **⏭️ Podsumowanie**, jeśli chcesz od razu zbudować serwer z zalecanymi ustawieniami. Kliknij **Dalej**, aby dopracować każdy szczegół.'));
    } else {
      lines.push('👇 **Wybierz typ serwera z listy poniżej.**');
    }
    return {
      lines,
      fields,
      rows: [selectRow(cid(s, 's', 'type'), {
        placeholder: '🧭 Wybierz typ serwera…',
        options: opts(Object.entries(SERVER_TYPES), s.typeChosen ? s.answers.type : [], (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
      })],
    };
  },
  select: {
    type(s, [value]) {
      if (!SERVER_TYPES[value]) return;
      if (value !== s.answers.type || !s.typeChosen) {
        s.answers.type = value;
        applyDefaults(s.answers, { typeChanged: true });
      }
      s.typeChosen = true;
    },
  },
  validate: (s) => (s.typeChosen ? null : 'Najpierw wybierz typ serwera z listy.'),
};

// ───────────────────────────── 2. PODSTAWY ─────────────────────────────

const basicsStep = {
  id: 'basics',
  emoji: '📝',
  title: 'Nazwa i opis',
  intro: 'Opisz swój serwer własnymi słowami. Opis trafi na kanał informacji i do ekranu powitalnego, a nazwa może zastąpić obecną nazwę serwera.',
  render(s) {
    const b = s.answers.basics;
    return {
      fields: [
        field('🏷️ Nazwa serwera', b.name ? `**${b.name}**` : '*nie podano – zostanie obecna*', true),
        field('✏️ Zmienić nazwę serwera?', yesNo(b.rename), true),
        field('🖼️ Ikona', b.iconUrl ? `[link](${b.iconUrl})` : '*bez zmian*', true),
        field('📄 Opis i cel serwera', b.description || '*nie podano – użyjemy domyślnego powitania*'),
        field('🎯 Dla kogo jest serwer?', b.audience || '*nie podano*'),
      ],
      rows: [
        row(button(cid(s, 'b', 'edit'), 'Uzupełnij nazwę, opis i ikonę', { style: ButtonStyle.Primary, emoji: '✏️' })),
        selectRow(cid(s, 's', 'rename'), {
          placeholder: 'Czy zmienić nazwę serwera?',
          options: [
            { value: 'yes', label: 'Tak – ustaw podaną nazwę', emoji: '✏️', default: b.rename },
            { value: 'no', label: 'Nie – zostaw obecną nazwę', emoji: '🔒', default: !b.rename },
          ],
        }),
      ],
    };
  },
  select: {
    rename(s, [v]) { s.answers.basics.rename = v === 'yes'; },
  },
  button: {
    edit(s) {
      const b = s.answers.basics;
      return {
        modal: modal(cid(s, 'm', 'basics'), 'Informacje o serwerze', [
          { id: 'name', label: 'Nazwa serwera', style: 'short', value: b.name, required: true, min: 1, max: 100, placeholder: 'np. Kraina Graczy' },
          { id: 'description', label: 'Opis i cel serwera', description: 'Co to za miejsce i po co powstało? (pojawi się w #informacje)', style: 'paragraph', value: b.description, max: 1000, placeholder: 'np. Polska społeczność fanów gier FPS. Organizujemy turnieje, wspólne granie i…' },
          { id: 'audience', label: 'Dla kogo jest serwer?', style: 'short', value: b.audience, max: 150, placeholder: 'np. gracze 16+, uczniowie klasy 3B, klienci sklepu' },
          { id: 'icon', label: 'Link do ikony (opcjonalnie)', description: 'Bezpośredni link do obrazka PNG/JPG/GIF', style: 'short', value: b.iconUrl, max: 400, placeholder: 'https://…/ikona.png' },
        ]),
      };
    },
  },
  modal: {
    basics(s, i) {
      const b = s.answers.basics;
      b.name = N.cleanName(modalText(i, 'name'), 100) || b.name;
      b.description = modalText(i, 'description').slice(0, 1000);
      b.audience = N.cleanName(modalText(i, 'audience'), 150);
      const icon = modalText(i, 'icon');
      if (icon && !N.isValidUrl(icon)) {
        s.flash = '⚠️ Link do ikony jest niepoprawny – musi zaczynać się od https://. Ikona nie zostanie zmieniona.';
        b.iconUrl = '';
      } else {
        b.iconUrl = icon;
      }
    },
  },
};

// ───────────────────────────── 3. PROFIL ─────────────────────────────

const profileStep = {
  id: 'profile',
  emoji: '🌍',
  title: 'Język, rozmiar i wiek',
  intro: 'Te odpowiedzi wpływają na liczbę kanałów, poziom moderacji i zabezpieczeń oraz język wszystkich nazw i wiadomości.',
  render(s) {
    const a = s.answers;
    return {
      fields: [
        field('🗣️ Język serwera', `${LANGUAGES[a.language].emoji} ${LANGUAGES[a.language].label}`, true),
        field('📈 Rozmiar', `${SIZES[a.size].emoji} ${SIZES[a.size].label}`, true),
        field('🎂 Wiek', `${AGES[a.age].emoji} ${AGES[a.age].label}`, true),
        field('ℹ️ Co to zmienia?', '• **Rozmiar** – liczba kanałów głosowych, role ekipy, slowmode, poziom weryfikacji, reguły AutoMod\n• **Wiek** – role wiekowe, dostępność kanału 18+, treść regulaminu\n• **Język** – nazwy kanałów i ról, regulamin, panele'),
      ],
      rows: [
        selectRow(cid(s, 's', 'language'), {
          placeholder: 'Język serwera',
          options: opts(Object.entries(LANGUAGES), a.language, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
        selectRow(cid(s, 's', 'size'), {
          placeholder: 'Planowany rozmiar',
          options: opts(Object.entries(SIZES), a.size, (d) => ({ label: `${d.label}`, description: d.description, emoji: d.emoji })),
        }),
        selectRow(cid(s, 's', 'age'), {
          placeholder: 'Minimalny wiek',
          options: opts(Object.entries(AGES), a.age, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
      ],
    };
  },
  select: {
    language(s, [v]) { if (LANGUAGES[v]) s.answers.language = v; },
    size(s, [v]) { if (SIZES[v]) { s.answers.size = v; applyDefaults(s.answers); } },
    age(s, [v]) { if (AGES[v]) { s.answers.age = v; applyDefaults(s.answers); } },
  },
};

// ───────────────────────────── 4. WYGLĄD ─────────────────────────────

function stylePreview(a) {
  const cat = (emoji, name) => N.formatCategory(a.style.category, emoji, name);
  const text = (emoji, name, pos) => N.formatTextChannel(a.style.channel, emoji, N.slugify(name), pos);
  const voice = (emoji, name, pos) => N.formatVoiceChannel(a.style.channel, emoji, name, pos);
  const en = a.language === 'en';
  return [
    cat('📌', en ? 'Information' : 'Informacje'),
    `  # ${text('📜', en ? 'rules' : 'regulamin', { first: true })}`,
    `  # ${text('📢', en ? 'announcements' : 'ogłoszenia', { last: true })}`,
    cat('💬', en ? 'Community' : 'Społeczność'),
    `  # ${text('💬', en ? 'general' : 'ogólny', { first: true })}`,
    `  # ${text('📸', 'media', {})}`,
    `  🔊 ${voice('🎙️', en ? 'Lounge 1' : 'Rozmowy 1', { last: true })}`,
  ].join('\n');
}

const styleStep = {
  id: 'style',
  emoji: '🎨',
  title: 'Wygląd',
  intro: 'Wybierz styl nazw kanałów i kategorii oraz paletę kolorów ról. Podgląd poniżej aktualizuje się na żywo.',
  render(s) {
    const a = s.answers;
    const pal = PALETTES[a.style.palette];
    const roleOpts = new Set(a.style.options);
    return {
      fields: [
        field('👀 Podgląd', `\`\`\`\n${stylePreview(a)}\n\`\`\``),
        field('🎨 Paleta ról', `${pal.emoji} ${pal.label} – ${pal.description}`, true),
        field('🎭 Role', `Separatory: ${yesNo(roleOpts.has('separators'))}\nEmoji w nazwach: ${yesNo(roleOpts.has('roleEmoji'))}`, true),
      ],
      rows: [
        selectRow(cid(s, 's', 'channel'), {
          placeholder: 'Styl nazw kanałów',
          options: opts(Object.entries(CHANNEL_STYLES), a.style.channel, (d, key) => ({
            label: d.label, emoji: d.emoji,
            description: N.formatTextChannel(key, '💬', a.language === 'en' ? 'general' : 'ogólny', { first: true }),
          })),
        }),
        selectRow(cid(s, 's', 'category'), {
          placeholder: 'Styl nazw kategorii',
          options: opts(Object.entries(CATEGORY_STYLES), a.style.category, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
        selectRow(cid(s, 's', 'palette'), {
          placeholder: 'Paleta kolorów ról',
          options: opts(Object.entries(PALETTES), a.style.palette, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
        selectRow(cid(s, 's', 'roleopts'), {
          placeholder: 'Opcje ról (możesz odznaczyć wszystko)',
          min: 0,
          max: 2,
          options: [
            { value: 'separators', label: 'Role-separatory', description: '━━ ✦ ADMINISTRACJA ✦ ━━ dzielą listę ról na sekcje', emoji: '➖', default: roleOpts.has('separators') },
            { value: 'roleEmoji', label: 'Emoji w nazwach ról', description: 'np. 👑 Właściciel, 🔨 Moderator', emoji: '😀', default: roleOpts.has('roleEmoji') },
          ],
        }),
      ],
    };
  },
  select: {
    channel(s, [v]) { if (CHANNEL_STYLES[v]) s.answers.style.channel = v; },
    category(s, [v]) { if (CATEGORY_STYLES[v]) s.answers.style.category = v; },
    palette(s, [v]) { if (PALETTES[v]) s.answers.style.palette = v; },
    roleopts(s, values) { s.answers.style.options = values.filter((v) => ['separators', 'roleEmoji'].includes(v)); },
  },
};

// ───────────────────────────── 5. SEKCJE ─────────────────────────────

const modulesStep = {
  id: 'modules',
  emoji: '🧩',
  title: 'Sekcje serwera',
  intro: 'Zaznacz, jakie kanały i funkcje ma mieć serwer. Każde menu to inna grupa – zaznacz wszystko, czego potrzebujesz.',
  render(s) {
    const a = s.answers;
    const selected = new Set(a.modules);
    const rows = [];
    const fields = [];
    for (const [groupKey, group] of Object.entries(MODULE_GROUPS)) {
      const entries = Object.entries(MODULES).filter(([key, m]) => m.group === groupKey && (!m.adultOnly || a.age === '18'));
      const chosen = entries.filter(([key]) => selected.has(key)).map(([, m]) => `${m.emoji} ${m.label}`);
      fields.push(field(`${group.emoji} ${group.label} (${chosen.length}/${entries.length})`, chosen.join(', ') || '*nic nie wybrano*'));
      rows.push(selectRow(cid(s, 's', `group${groupKey}`), {
        placeholder: `${group.emoji} ${group.label}…`,
        min: 0,
        max: entries.length,
        options: opts(entries, a.modules, (m) => ({ label: m.label, description: m.description, emoji: m.emoji })),
      }));
    }
    if (a.age !== '18') fields.push(field('🔞 Kanał 18+', 'Dostępny tylko dla serwerów 18+ (krok „Język, rozmiar i wiek”).'));
    return { fields, rows };
  },
  select: Object.fromEntries(Object.keys(MODULE_GROUPS).map((groupKey) => [`group${groupKey}`, (s, values) => {
    const inGroup = new Set(Object.entries(MODULES).filter(([, m]) => m.group === groupKey).map(([k]) => k));
    const kept = s.answers.modules.filter((m) => !inGroup.has(m));
    const chosen = values.filter((v) => inGroup.has(v));
    s.answers.modules = Object.keys(MODULES).filter((k) => kept.includes(k) || chosen.includes(k));
    markTouched(s.answers, 'modules');
  }])),
};

// ───────────────────────────── 6. SPECJALNE ─────────────────────────────

const ITEM_OPTIONS = {
  text: { emoji: '💬', label: 'Kanał tekstowy', description: 'Osobny kanał tekstowy dla każdego elementu' },
  extra: { emoji: '➕', label: 'Dodatkowy kanał', description: '' },
  voice: { emoji: '🔊', label: 'Kanał głosowy', description: 'Osobny kanał głosowy dla każdego elementu' },
  role: { emoji: '🎭', label: 'Rola', description: 'Rola dla każdego elementu (do pingowania / wyboru)' },
  private: { emoji: '🔒', label: 'Prywatne kanały', description: 'Kanały widoczne tylko dla osób z daną rolą' },
};

const specialStep = {
  id: 'special',
  emoji: '⭐',
  title: 'Kanały specjalne',
  intro: 'Pytania dopasowane do typu serwera: lista elementów (np. gier, przedmiotów, działów), dla których powstaną kanały i role, oraz kanały charakterystyczne dla tego typu.',
  render(s) {
    const a = s.answers;
    const p = preset(s);
    const list = p.list;
    const sp = a.special;
    const fields = [];
    const rows = [];
    if (list) {
      const itemOpts = Object.entries(ITEM_OPTIONS).filter(([k]) => k !== 'extra' || list.extra);
      const chosenOpts = itemOpts.filter(([k]) => sp.options.includes(k)).map(([k, o]) => (k === 'extra' ? list.extra.label : o.label));
      fields.push(field(`📋 ${list.title} (${sp.items.length}/${LIST_MAX})`, `*${list.question}*\n${listPreview(sp.items)}`));
      fields.push(field('🛠️ Dla każdego elementu', chosenOpts.join(', ') || '*nic*', true));
      fields.push(field('🗂️ Układ', sp.layout === 'separate' ? 'Osobna kategoria na element' : `Wspólna kategoria „${tr(list.category, a.language)}”`, true));
      rows.push(selectRow(cid(s, 's', 'layout'), {
        placeholder: 'Układ kanałów listy',
        options: [
          { value: 'shared', label: `Wspólna kategoria „${tr(list.category, 'pl')}”`, description: 'Wszystkie elementy w jednej kategorii (przejrzyście)', emoji: '📂', default: sp.layout === 'shared' },
          { value: 'separate', label: 'Osobna kategoria dla każdego elementu', description: 'Idealne dla składów, działów i frakcji', emoji: '🗂️', default: sp.layout === 'separate' },
        ],
      }));
      rows.push(selectRow(cid(s, 's', 'itemopts'), {
        placeholder: 'Co utworzyć dla każdego elementu listy?',
        min: 0,
        max: itemOpts.length,
        options: itemOpts.map(([k, o]) => ({
          value: k,
          label: k === 'extra' ? list.extra.label : o.label,
          description: k === 'extra' ? `np. #${N.slugify(`${list.defaults[0] || 'element'}-${tr(list.extra.suffix, 'pl')}`)}` : o.description,
          emoji: o.emoji,
          default: sp.options.includes(k),
        })),
      }));
    } else {
      fields.push(field('📋 Lista', 'Ten typ serwera nie ma listy elementów.'));
    }
    const extras = p.extras || [];
    if (extras.length) {
      const chosen = extras.filter((e) => sp.extras.includes(e.key));
      fields.push(field(`✨ Kanały specjalne (${chosen.length}/${extras.length})`, chosen.map((e) => `${e.emoji} ${tr(e.name, a.language)}`).join(', ') || '*brak*'));
      rows.push(selectRow(cid(s, 's', 'extras'), {
        placeholder: '✨ Kanały specjalne dla tego typu serwera…',
        min: 0,
        max: extras.length,
        options: extras.map((e) => ({
          value: e.key,
          label: `${tr(e.name, 'pl')}${e.kind === 'forum' ? ' (forum)' : e.kind === 'voice' ? ' (głosowy)' : ''}`,
          description: tr(e.topic, 'pl') || 'Kanał głosowy',
          emoji: e.emoji,
          default: sp.extras.includes(e.key),
        })),
      }));
    }
    const infoFields = p.infoFields || [];
    if (infoFields.length) {
      fields.push(field('🔗 Dodatkowe informacje', infoFields.map((f) => `**${f.label}:** ${clip(sp.info[f.key], 150) || '*—*'}`).join('\n')));
    }
    if (list || infoFields.length) {
      rows.push(row(
        button(cid(s, 'b', 'editlist'), list ? `Edytuj listę: ${list.title}` : 'Uzupełnij informacje', { style: ButtonStyle.Primary, emoji: '✏️' }),
        list ? button(cid(s, 'b', 'clearlist'), 'Wyczyść listę', { emoji: '🧹', disabled: !sp.items.length }) : null,
        list ? button(cid(s, 'b', 'resetlist'), 'Przywróć domyślną', { emoji: '↩️' }) : null,
      ));
    }
    return { fields, rows };
  },
  select: {
    layout(s, [v]) { if (['shared', 'separate'].includes(v)) { s.answers.special.layout = v; markTouched(s.answers, 'special.layout'); } },
    itemopts(s, values) {
      let values2 = values.filter((v) => ITEM_OPTIONS[v]);
      if (values2.includes('private') && !values2.includes('role')) {
        values2.push('role');
        s.flash = 'ℹ️ Prywatne kanały wymagają ról – opcja „Rola” została włączona.';
      }
      s.answers.special.options = values2;
      markTouched(s.answers, 'special.options');
    },
    extras(s, values) { s.answers.special.extras = values; markTouched(s.answers, 'special.extras'); },
  },
  button: {
    editlist(s) {
      const p = preset(s);
      const sp = s.answers.special;
      const fields = [];
      if (p.list) {
        fields.push({
          id: 'items', label: clip(p.list.title, 45), description: clip(`${p.list.question} Oddziel przecinkami (max ${LIST_MAX}).`, 100),
          style: 'paragraph', value: sp.items.join(', '), max: 2000, placeholder: p.list.placeholder,
        });
      }
      for (const f of (p.infoFields || []).slice(0, 4)) {
        fields.push({ id: `info_${f.key}`, label: f.label, style: f.paragraph ? 'paragraph' : 'short', value: sp.info[f.key] || '', max: f.max || 200, placeholder: f.placeholder });
      }
      return { modal: modal(cid(s, 'm', 'list'), p.list ? p.list.title : 'Informacje', fields) };
    },
    clearlist(s) { s.answers.special.items = []; markTouched(s.answers, 'special.items'); },
    resetlist(s) { s.answers.special.items = [...(preset(s).list?.defaults || [])]; markTouched(s.answers, 'special.items'); },
  },
  modal: {
    list(s, i) {
      const p = preset(s);
      if (p.list) {
        const raw = modalText(i, 'items');
        const parsed = N.parseList(raw, { max: LIST_MAX, maxLength: 60 });
        const total = raw.split(/[,;\n]+/).filter((x) => x.trim()).length;
        if (total > LIST_MAX) s.flash = `⚠️ Lista może mieć maksymalnie ${LIST_MAX} elementów – nadmiarowe pominięto.`;
        s.answers.special.items = parsed;
        markTouched(s.answers, 'special.items');
      }
      for (const f of (p.infoFields || []).slice(0, 4)) {
        s.answers.special.info[f.key] = modalText(i, `info_${f.key}`).slice(0, f.max || 200);
      }
    },
  },
};

// ───────────────────────────── 7. EKIPA ─────────────────────────────

const LEVEL_OPTIONS = ['admin', 'mod', 'helper', 'trial', 'none'];
/** Role, których nazwy można zmienić (np. „Właściciel” → „CEO”). */
const RENAMABLE = ['owner', 'admin', 'mod', 'helper', 'member'];

function staffEntries(s) {
  const p = preset(s);
  return [
    ...Object.entries(STAFF_ROLES),
    ...(p.staffExtras || []).map((e) => [e.key, e]),
  ];
}

const staffStep = {
  id: 'staff',
  emoji: '🛡️',
  title: 'Role administracji',
  intro: 'Wybierz role ekipy. Każda rola dostanie dopasowane uprawnienia – od pełnych (Właściciel) po wyciszanie i usuwanie wiadomości (Pomocnik). Hierarchię zobaczysz poniżej.',
  render(s) {
    const a = s.answers;
    const entries = staffEntries(s);
    const selected = entries
      .filter(([k]) => a.staffRoles.includes(k))
      .map(([k, d]) => ({ name: a.roleNames?.[k] || tr(d.name, 'pl'), emoji: d.emoji, level: d.level, rank: STAFF_LEVELS[d.level].rank + (d.rankOffset || 0) }))
      .concat(a.customStaff.map((c) => ({ name: c.name, emoji: '🔰', level: c.level, rank: STAFF_LEVELS[c.level].rank + 0.7 })))
      .sort((x, y) => x.rank - y.rank);
    return {
      fields: [
        field(`👥 Hierarchia (${selected.length})`, selected.map((r) => `${r.emoji} **${r.name}** – ${tr(STAFF_LEVELS[r.level].short, 'pl')}`).join('\n') || '*brak ról ekipy – tylko właściciel będzie miał uprawnienia*'),
        field('🔰 Własne role ekipy', a.customStaff.map((c) => `${c.name} (${STAFF_LEVELS[c.level].label})`).join(', ') || '*brak*'),
      ],
      rows: [
        selectRow(cid(s, 's', 'staff'), {
          placeholder: '🛡️ Role ekipy…',
          min: 0,
          max: entries.length,
          options: opts(entries, a.staffRoles, (d) => ({ label: tr(d.name, 'pl'), description: d.description, emoji: d.emoji })),
        }),
        row(
          button(cid(s, 'b', 'custom'), 'Dodaj własne role ekipy', { style: ButtonStyle.Primary, emoji: '➕' }),
          button(cid(s, 'b', 'rename'), 'Zmień nazwy ról', { emoji: '✏️' }),
          button(cid(s, 'b', 'clear'), 'Usuń własne', { emoji: '🧹', disabled: !a.customStaff.length }),
        ),
      ],
    };
  },
  select: {
    staff(s, values) { s.answers.staffRoles = values; markTouched(s.answers, 'staffRoles'); },
  },
  button: {
    custom(s) {
      return {
        modal: modal(cid(s, 'm', 'custom'), 'Własne role ekipy', [
          { id: 'roles', label: 'Role (jedna w linii)', description: 'Format: Nazwa, #kolor, poziom (admin/mod/pomoc/próbny/brak)', style: 'paragraph', max: 1200, required: true, placeholder: 'Opiekun Discorda, #00B894, mod\nRekruter, #FDCB6E' },
          {
            id: 'level', label: 'Domyślny poziom', description: 'Dla ról, przy których nie wpisano poziomu',
            select: { options: LEVEL_OPTIONS.map((l) => ({ value: l, label: STAFF_LEVELS[l].label, description: tr(STAFF_LEVELS[l].short, 'pl'), default: l === 'none' })) },
          },
        ]),
      };
    },
    clear(s) { s.answers.customStaff = []; },
    rename(s) {
      const a = s.answers;
      const names = a.roleNames || {};
      const lang = a.language;
      const fields = RENAMABLE.map((key) => {
        const base = key === 'member' ? tr(preset(s).memberName, lang) : tr(STAFF_ROLES[key].name, lang);
        return { id: key, label: key === 'member' ? 'Rola członka' : tr(STAFF_ROLES[key].name, 'pl'), style: 'short', max: 60, value: names[key] || '', placeholder: base };
      });
      return { modal: modal(cid(s, 'm', 'rename'), 'Nazwy ról (puste = domyślne)', fields) };
    },
  },
  modal: {
    rename(s, i) {
      const names = {};
      for (const key of RENAMABLE) {
        const value = N.cleanName(modalText(i, key), 60);
        if (value) names[key] = value;
      }
      s.answers.roleNames = names;
    },
    custom(s, i) {
      const fallback = modalSelect(i, 'level')[0] || 'none';
      const hasLevelWord = (line) => line.split(/[|,;]/).some((part) => /^(admin|administrator|administracja|mod|moderator|moderacja|pomoc|pomocnik|helper|support|wsparcie|trial|próbny|probny|brak|none|zwykła|zwykla|bez)$/i.test(part.trim()));
      const parsed = [];
      for (const line of modalText(i, 'roles').split(/\n+/)) {
        const [role] = N.parseCustomRoles(line, { max: 1, withLevel: true });
        if (!role) continue;
        if (!hasLevelWord(line)) role.level = fallback;
        if (parsed.some((r) => r.name.toLocaleLowerCase('pl') === role.name.toLocaleLowerCase('pl'))) continue;
        parsed.push(role);
      }
      const merged = [...s.answers.customStaff, ...parsed].slice(0, 10);
      if (!parsed.length) s.flash = '⚠️ Nie rozpoznano żadnej roli. Wpisz np. „Opiekun Discorda, #00B894, mod”.';
      s.answers.customStaff = merged;
    },
  },
};

// ───────────────────────────── 8. ROLE SPOŁECZNOŚCI ─────────────────────────────

function roleGroupEntries(s) {
  const p = preset(s);
  return [
    ...Object.entries(ROLE_GROUP_OPTIONS)
      .filter(([k]) => !(k === 'age' && s.answers.age === '18'))
      .map(([k, d]) => [k, k === 'member' ? { ...d, label: `Rola członka: ${tr(p.memberName, 'pl')}` } : d]),
    ...(p.specials || []).map((sp) => [sp.key, { emoji: sp.emoji, label: tr(sp.name, 'pl'), description: sp.description }]),
  ];
}

const rolesStep = {
  id: 'roles',
  emoji: '🎭',
  title: 'Role społeczności',
  intro: 'Wybierz role dla członków: rolę członka, role specjalne, poziomy, kolory, powiadomienia, wiek, zaimki, platformy, region. Bot utworzy je z kolorami i uporządkuje, a na kanale #role opisze, jak je zdobyć – nadaje je ekipa.',
  render(s) {
    const a = s.answers;
    const entries = roleGroupEntries(s);
    const chosen = entries.filter(([k]) => a.communityRoles.includes(k)).map(([, d]) => `${d.emoji} ${d.label}`);
    const customSpecial = a.customRoles.filter((r) => !r.self).map((r) => r.name);
    const customSelf = a.customRoles.filter((r) => r.self).map((r) => r.name);
    return {
      fields: [
        field(`✅ Wybrane (${chosen.length})`, chosen.join('\n') || '*brak*'),
        field('✨ Własne role specjalne', customSpecial.join(', ') || '*brak*', true),
        field('🔹 Własne role dla członków', customSelf.join(', ') || '*brak*', true),
      ],
      rows: [
        selectRow(cid(s, 's', 'groups'), {
          placeholder: '🎭 Role społeczności…',
          min: 0,
          max: entries.length,
          options: opts(entries, a.communityRoles, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
        row(
          button(cid(s, 'b', 'custom'), 'Dodaj własne role', { style: ButtonStyle.Primary, emoji: '➕' }),
          button(cid(s, 'b', 'clear'), 'Usuń własne', { emoji: '🧹', disabled: !a.customRoles.length }),
        ),
      ],
    };
  },
  select: {
    groups(s, values) { s.answers.communityRoles = values; markTouched(s.answers, 'communityRoles'); },
  },
  button: {
    custom(s) {
      return {
        modal: modal(cid(s, 'm', 'custom'), 'Własne role', [
          { id: 'special', label: 'Role specjalne (nadaje ekipa)', description: 'Jedna w linii: Nazwa, #kolor', style: 'paragraph', max: 1000, placeholder: 'Zasłużony, #F1C40F\nTwórca treści, #9146FF' },
          { id: 'self', label: 'Role dla członków', description: 'Np. zainteresowania – pojawią się w opisie ról. Jedna w linii.', style: 'paragraph', max: 1000, placeholder: 'Szukam drużyny\nNocny marek\nStreamer' },
        ]),
      };
    },
    clear(s) { s.answers.customRoles = []; },
  },
  modal: {
    custom(s, i) {
      const special = N.parseCustomRoles(modalText(i, 'special'), { max: 10 }).map((r) => ({ ...r, self: false }));
      const self = N.parseCustomRoles(modalText(i, 'self'), { max: 20 }).map((r) => ({ ...r, self: true }));
      const all = [...s.answers.customRoles, ...special, ...self];
      s.answers.customRoles = [
        ...all.filter((r) => !r.self).slice(0, 10),
        ...all.filter((r) => r.self).slice(0, 25),
      ];
    },
  },
};

// ───────────────────────────── 9. UPRAWNIENIA ─────────────────────────────

const permissionsStep = {
  id: 'permissions',
  emoji: '🔐',
  title: 'Uprawnienia członków',
  intro: 'Zdecyduj, co mogą zwykli członkowie. Podstawy (pisanie, czytanie, reakcje, komendy, rozmowy głosowe) są zawsze włączone. Ekipa ma zawsze pełen zestaw.',
  render(s) {
    const a = s.answers;
    const on = Object.entries(MEMBER_TOGGLES).filter(([k]) => a.permissions.member.includes(k));
    const off = Object.entries(MEMBER_TOGGLES).filter(([k]) => !a.permissions.member.includes(k));
    const gate = a.modules.includes('verification');
    return {
      fields: [
        field(`✅ Dozwolone (${on.length})`, on.map(([, t]) => `${t.emoji} ${t.label}`).join('\n') || '*tylko podstawy*', true),
        field(`⛔ Zablokowane (${off.length})`, off.map(([, t]) => `${t.emoji} ${t.label}`).join('\n') || '*nic*', true),
        field('🔒 Zawsze zablokowane dla członków', '@everyone/@here, zarządzanie wiadomościami, kanałami i rolami, wyciszanie i banowanie innych.'),
        field('✅ Weryfikacja', gate
          ? 'Włączona – nowe osoby widzą tylko regulamin i kanał weryfikacji. Po kliknięciu przycisku dostają rolę członka z powyższymi uprawnieniami.'
          : 'Wyłączona – powyższe uprawnienia dostaje każdy (@everyone) od razu po wejściu.'),
      ],
      rows: [
        selectRow(cid(s, 's', 'member'), {
          placeholder: '🔐 Co mogą członkowie?',
          min: 0,
          max: Object.keys(MEMBER_TOGGLES).length,
          options: opts(Object.entries(MEMBER_TOGGLES), a.permissions.member, (t) => ({ label: t.label, description: t.description, emoji: t.emoji })),
        }),
        selectRow(cid(s, 's', 'notifications'), {
          placeholder: 'Domyślne powiadomienia',
          options: opts(NOTIFICATION_OPTIONS.map((o) => [o.value, o]), a.permissions.notifications, (o) => ({ label: o.label, description: o.description, emoji: o.emoji })),
        }),
      ],
    };
  },
  select: {
    member(s, values) { s.answers.permissions.member = values.filter((v) => MEMBER_TOGGLES[v]); markTouched(s.answers, 'permissions.member'); },
    notifications(s, [v]) { s.answers.permissions.notifications = v === 'all' ? 'all' : 'mentions'; },
  },
};

// ───────────────────────────── 10. DOSTĘP DO KANAŁÓW ─────────────────────────────

function sectionLabel(s, key) {
  const p = preset(s);
  if (key === 'special' && p.special) return { emoji: p.special.emoji, label: tr(p.special.name, 'pl') };
  if (key === 'items' && p.list) return { emoji: p.list.categoryEmoji, label: tr(p.list.category, 'pl') };
  const def = CATEGORIES[key];
  return def ? { emoji: def.emoji, label: tr(def.name, 'pl') } : { emoji: '📁', label: key };
}

/** Sekcje obecne na budowanym serwerze + podsumowanie uprawnień ich kanałów. */
function accessSections(s) {
  const bp = buildBlueprint(s.answers, { existingChannels: 0, existingRoles: 0 });
  const sections = new Map();
  for (const cat of bp.categories) {
    if (!cat.section) continue;
    if (!sections.has(cat.section)) sections.set(cat.section, { key: cat.section, channels: [] });
    sections.get(cat.section).channels.push(...cat.channels);
  }
  for (const sec of sections.values()) {
    const counts = new Map();
    for (const ch of sec.channels) {
      const label = describeAccess(ch.access, ch.kind).text;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    sec.summary = [...counts.entries()].map(([label, n]) => `${label}${n > 1 ? ` (×${n})` : ''}`);
    sec.voiceOnly = sec.channels.every((c) => c.kind === 'voice' || c.kind === 'stage');
  }
  return { bp, sections: [...sections.values()] };
}

const accessStep = {
  id: 'access',
  emoji: '🔑',
  title: 'Dostęp do kanałów',
  intro: 'Tu decydujesz, **kto widzi** kanały i **kto może w nich pisać** (na głosowych: mówić). Kreator już ustawia zalecane uprawnienia – np. ogłoszenia tylko do odczytu, kanały ekipy ukryte. Zmień tylko to, co chcesz inaczej: wybierz sekcję, a potem ustawienia.',
  render(s) {
    const { bp, sections } = accessSections(s);
    const overrides = s.answers.channelAccess || {};
    if (!sections.length) {
      return { fields: [field('📭 Brak sekcji', 'Najpierw wybierz sekcje serwera w kroku „Sekcje serwera”.')], rows: [] };
    }
    if (!sections.some((sec) => sec.key === s.accessSection)) s.accessSection = sections[0].key;
    const current = sections.find((sec) => sec.key === s.accessSection);
    const ov = overrides[current.key] || {};
    const fields = sections.slice(0, 20).map((sec) => {
      const { emoji, label } = sectionLabel(s, sec.key);
      const changed = overrides[sec.key] && (overrides[sec.key].view !== 'default' || overrides[sec.key].write !== 'default');
      const marker = sec.key === current.key ? '▶️ ' : '';
      return field(`${marker}${emoji} ${label}${changed ? ' ✏️' : ''}`, sec.summary.join('\n'));
    });
    fields.push(field('🔒 Zawsze chronione', 'Kanał weryfikacji, regulamin (przy weryfikacji), kanał zarządu i prywatne kanały ról zachowują swoje uprawnienia – inaczej serwer przestałby działać poprawnie.'));
    const { emoji, label } = sectionLabel(s, current.key);
    const gate = bp.meta.gate;
    return {
      lines: [`**Edytujesz:** ${emoji} **${label}** (${current.channels.length} kanałów) · ✏️ = zmienione przez Ciebie`],
      fields,
      rows: [
        selectRow(cid(s, 's', 'section'), {
          placeholder: 'Wybierz sekcję do zmiany…',
          options: sections.map((sec) => {
            const l = sectionLabel(s, sec.key);
            return { value: sec.key, label: l.label, emoji: l.emoji, description: clip(sec.summary.join(' | '), 100), default: sec.key === current.key };
          }),
        }),
        selectRow(cid(s, 's', 'view'), {
          placeholder: `👁️ Kto widzi sekcję „${label}”?`,
          options: [
            { value: 'default', label: 'Zalecane przez kreator', description: 'Uprawnienia dobrane do każdego kanału osobno', emoji: '⭐', default: !VIEW_OPTIONS[ov.view] },
            ...Object.entries(VIEW_OPTIONS)
              .filter(([k]) => k !== 'unverified' || gate)
              .map(([k, o]) => ({ value: k, label: o.label, description: o.description, emoji: o.emoji, default: ov.view === k })),
          ],
        }),
        selectRow(cid(s, 's', 'write'), {
          placeholder: current.voiceOnly ? `🎙️ Kto może mówić w „${label}”?` : `✍️ Kto może pisać w „${label}”?`,
          options: [
            { value: 'default', label: 'Zalecane przez kreator', description: 'Uprawnienia dobrane do każdego kanału osobno', emoji: '⭐', default: !WRITE_OPTIONS[ov.write] },
            ...Object.entries(WRITE_OPTIONS)
              .filter(([k]) => !(current.voiceOnly && k === 'threads'))
              .map(([k, o]) => ({ value: k, label: current.voiceOnly ? o.label.replace('pisać', 'mówić').replace('pisze', 'mówi') : o.label, description: o.description, emoji: o.emoji, default: ov.write === k })),
          ],
        }),
        row(
          button(cid(s, 'b', 'reset'), 'Zalecane dla tej sekcji', { emoji: '↩️', disabled: !overrides[current.key] }),
          button(cid(s, 'b', 'resetall'), 'Przywróć wszystko', { emoji: '🧹', disabled: !Object.keys(overrides).length }),
        ),
      ],
    };
  },
  select: {
    section(s, [v]) { s.accessSection = v; },
    view(s, [v]) { setAccess(s, 'view', v); },
    write(s, [v]) { setAccess(s, 'write', v); },
  },
  button: {
    reset(s) { if (s.answers.channelAccess) delete s.answers.channelAccess[s.accessSection]; },
    resetall(s) { s.answers.channelAccess = {}; },
  },
};

function setAccess(s, field_, value) {
  const valid = field_ === 'view' ? VIEW_OPTIONS : WRITE_OPTIONS;
  if (value !== 'default' && !valid[value]) return;
  if (!s.accessSection) return;
  s.answers.channelAccess ??= {};
  const entry = s.answers.channelAccess[s.accessSection] || { view: 'default', write: 'default' };
  entry[field_] = value;
  if (entry.view === 'default' && entry.write === 'default') delete s.answers.channelAccess[s.accessSection];
  else s.answers.channelAccess[s.accessSection] = entry;
}

// ───────────────────────────── 11. BEZPIECZEŃSTWO ─────────────────────────────

const VERIFY_OPTIONS = {
  captcha: { emoji: '🧮', label: 'Pytanie kontrolne (anty-bot)', description: 'Po kliknięciu trzeba rozwiązać proste działanie, np. 4 + 7' },
  age1: { emoji: '📅', label: 'Konto min. 1 dzień', description: 'Blokuje świeżo założone konta (raidy)' },
  age7: { emoji: '🗓️', label: 'Konto min. 7 dni', description: 'Mocniejsza ochrona przed multikontami' },
  age30: { emoji: '🛡️', label: 'Konto min. 30 dni', description: 'Najmocniejsza ochrona – dla dużych serwerów' },
  log: { emoji: '📝', label: 'Zapisuj weryfikacje w logach', description: 'Każda (także nieudana) próba trafi na kanał logów' },
};

const securityStep = {
  id: 'security',
  emoji: '🛡️',
  title: 'Bezpieczeństwo i AutoMod',
  intro: 'Ustaw poziom weryfikacji Discorda, filtr multimediów, reguły AutoMod (automatycznie blokują spam, oszustwa i wulgaryzmy – alerty trafią na kanał logów) oraz zabezpieczenia przycisku weryfikacji: pytanie kontrolne przeciw botom, minimalny wiek konta i zapis prób w logach.',
  render(s) {
    const a = s.answers;
    const lvl = VERIFICATION_LEVELS.find((v) => v.value === Number(a.security.verificationLevel));
    const flt = CONTENT_FILTERS.find((v) => v.value === Number(a.security.contentFilter));
    const am = Object.entries(AUTOMOD_OPTIONS).filter(([k]) => a.security.automod.includes(k));
    const gate = a.modules.includes('verification');
    const vo = Object.entries(VERIFY_OPTIONS).filter(([k]) => (a.security.verifyOptions || []).includes(k));
    return {
      fields: [
        field('🔐 Poziom weryfikacji', `${lvl.emoji} **${lvl.label}** – ${lvl.description}`, true),
        field('🖼️ Filtr multimediów', `${flt.emoji} **${flt.label}**`, true),
        field(`🤖 AutoMod (${am.length})`, am.map(([, o]) => `${o.emoji} ${o.label}`).join('\n') || '*wyłączony*', true),
        field('✅ Przycisk weryfikacji', gate ? (vo.map(([, o]) => `${o.emoji} ${o.label}`).join('\n') || '*zwykły przycisk*') : '*sekcja „Weryfikacja” wyłączona*', true),
        a.content.community !== 'off' ? field('ℹ️ Tryb Społeczności', 'Wymaga poziomu weryfikacji min. „Niski” i filtra „Wszyscy członkowie” – kreator dopilnuje tego automatycznie.') : null,
      ].filter(Boolean),
      rows: [
        selectRow(cid(s, 's', 'verification'), {
          placeholder: 'Poziom weryfikacji',
          options: VERIFICATION_LEVELS.map((v) => ({ value: String(v.value), label: v.label, description: v.description, emoji: v.emoji, default: v.value === Number(a.security.verificationLevel) })),
        }),
        selectRow(cid(s, 's', 'filter'), {
          placeholder: 'Filtr treści multimedialnych',
          options: CONTENT_FILTERS.map((v) => ({ value: String(v.value), label: v.label, description: v.description, emoji: v.emoji, default: v.value === Number(a.security.contentFilter) })),
        }),
        selectRow(cid(s, 's', 'automod'), {
          placeholder: '🤖 Reguły AutoMod…',
          min: 0,
          max: Object.keys(AUTOMOD_OPTIONS).length,
          options: opts(Object.entries(AUTOMOD_OPTIONS), a.security.automod, (o) => ({ label: o.label, description: o.description, emoji: o.emoji })),
        }),
        selectRow(cid(s, 's', 'verify'), {
          placeholder: gate ? '✅ Przycisk weryfikacji – zabezpieczenia…' : '✅ Zabezpieczenia weryfikacji (włącz sekcję „Weryfikacja”)',
          min: 0,
          max: Object.keys(VERIFY_OPTIONS).length,
          disabled: !gate,
          options: opts(Object.entries(VERIFY_OPTIONS), a.security.verifyOptions || [], (o) => ({ label: o.label, description: o.description, emoji: o.emoji })),
        }),
      ],
    };
  },
  select: {
    verification(s, [v]) { s.answers.security.verificationLevel = Number(v); markTouched(s.answers, 'security.verificationLevel'); },
    filter(s, [v]) { s.answers.security.contentFilter = Number(v); markTouched(s.answers, 'security.contentFilter'); },
    automod(s, values) { s.answers.security.automod = values.filter((v) => AUTOMOD_OPTIONS[v]); markTouched(s.answers, 'security.automod'); },
    verify(s, values) {
      let chosen = values.filter((v) => VERIFY_OPTIONS[v]);
      // Minimalny wiek konta – zostaje tylko najdłuższy wybrany próg.
      const ages = chosen.filter((v) => v.startsWith('age'));
      if (ages.length > 1) {
        const keep = ages.sort((x, y) => Number(y.slice(3)) - Number(x.slice(3)))[0];
        chosen = chosen.filter((v) => !v.startsWith('age') || v === keep);
        s.flash = `ℹ️ Można wybrać jeden próg wieku konta – zostawiono najwyższy (${keep.slice(3)} dni).`;
      }
      s.answers.security.verifyOptions = chosen;
      markTouched(s.answers, 'security.verifyOptions');
    },
  },
};

// ───────────────────────────── 12. KANAŁY ─────────────────────────────

const SLOWMODES = [0, 3, 5, 10, 15, 30, 60, 120];
const AFK_TIMEOUTS = [[60, '1 minuta'], [300, '5 minut'], [900, '15 minut'], [1800, '30 minut'], [3600, '1 godzina']];
const VOICE_LAYOUTS = {
  open: { emoji: '🔓', label: 'Tylko otwarte lobby', description: 'Kanały bez limitu osób' },
  mixed: { emoji: '👥', label: 'Lobby + Duo/Trio/Squad', description: 'Dodatkowe kanały z limitem 2, 3 i 4 osób' },
  big: { emoji: '🏟️', label: 'Lobby + pełen zestaw', description: 'Duo, Trio, Squad, Drużyna 5 i Drużyna 10' },
};

const channelsStep = {
  id: 'channels',
  emoji: '🔊',
  title: 'Ustawienia kanałów',
  intro: 'Tryb powolny na czatach, liczba kanałów głosowych i czas, po którym nieaktywne osoby trafiają na kanał AFK.',
  render(s) {
    const a = s.answers;
    const c = a.channels;
    const voiceOn = a.modules.includes('voice');
    const afkOn = a.modules.includes('afk');
    return {
      fields: [
        field('🐢 Slowmode czatów', c.slowmode ? `${c.slowmode} s` : 'wyłączony', true),
        field('🔊 Lobby głosowe', voiceOn ? `${c.voiceCount} × ${VOICE_LAYOUTS[c.voiceLayout].label}` : '*sekcja głosowa wyłączona*', true),
        field('💤 AFK po', afkOn ? AFK_TIMEOUTS.find(([v]) => v === Number(c.afkTimeout))?.[1] || '5 minut' : '*kanał AFK wyłączony*', true),
        field('ℹ️ Szczegóły', 'Slowmode dotyczy czatu ogólnego i offtopu (inne kanały mają własne, dobrane limity – np. #przedstaw-się raz na 30 min). Ekipa omija slowmode.'),
      ],
      rows: [
        selectRow(cid(s, 's', 'slowmode'), {
          placeholder: 'Tryb powolny (slowmode) czatów',
          options: SLOWMODES.map((v) => ({ value: String(v), label: v ? `${v} sekund` : 'Wyłączony', emoji: v ? '🐢' : '⚡', default: v === Number(c.slowmode) })),
        }),
        selectRow(cid(s, 's', 'voicecount'), {
          placeholder: 'Liczba lobby głosowych',
          disabled: !voiceOn,
          options: Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: `${i} ${i === 1 ? 'kanał' : i >= 2 && i <= 4 ? 'kanały' : 'kanałów'}`, emoji: '🔊', default: i === Number(c.voiceCount) })),
        }),
        selectRow(cid(s, 's', 'voicelayout'), {
          placeholder: 'Kanały z limitem osób',
          disabled: !voiceOn,
          options: opts(Object.entries(VOICE_LAYOUTS), c.voiceLayout, (d) => ({ label: d.label, description: d.description, emoji: d.emoji })),
        }),
        selectRow(cid(s, 's', 'afk'), {
          placeholder: 'Przenoś na AFK po…',
          disabled: !afkOn,
          options: AFK_TIMEOUTS.map(([v, label]) => ({ value: String(v), label, emoji: '💤', default: v === Number(c.afkTimeout) })),
        }),
      ],
    };
  },
  select: {
    slowmode(s, [v]) { s.answers.channels.slowmode = Number(v); markTouched(s.answers, 'channels.slowmode'); },
    voicecount(s, [v]) { s.answers.channels.voiceCount = Number(v); markTouched(s.answers, 'channels.voiceCount'); },
    voicelayout(s, [v]) { if (VOICE_LAYOUTS[v]) { s.answers.channels.voiceLayout = v; markTouched(s.answers, 'channels.voiceLayout'); } },
    afk(s, [v]) { s.answers.channels.afkTimeout = Number(v); markTouched(s.answers, 'channels.afkTimeout'); },
  },
};

// ───────────────────────────── 13. WŁASNE KATEGORIE ─────────────────────────────

const ACCESS = {
  public: { emoji: '🌍', label: 'Publiczna', description: 'Widoczna dla wszystkich członków' },
  readonly: { emoji: '👁️', label: 'Tylko do odczytu', description: 'Wszyscy widzą, pisze tylko ekipa' },
  staff: { emoji: '🛡️', label: 'Tylko ekipa', description: 'Prywatna kategoria administracji' },
  vip: { emoji: '💎', label: 'VIP / boosterzy', description: 'Dla VIP-ów, partnerów i boosterów' },
};
const MAX_CUSTOM = 10;

/** Gdzie można dodać własne kanały: nowa kategoria albo istniejąca sekcja. */
const CUSTOM_TARGETS = {
  new: { emoji: '🆕', label: 'Nowa kategoria', description: 'Utwórz osobną kategorię o podanej nazwie' },
  info: { emoji: '📌', label: 'Do sekcji Informacje', description: 'Kanały trafią do istniejącej kategorii' },
  news: { emoji: '📢', label: 'Do sekcji Ogłoszenia', description: 'Kanały trafią do istniejącej kategorii' },
  special: { emoji: '⭐', label: 'Do sekcji typu serwera', description: 'Np. „Granie”, „Serwer”, „Nauka”' },
  community: { emoji: '💬', label: 'Do sekcji Społeczność', description: 'Kanały trafią do istniejącej kategorii' },
  voice: { emoji: '🔊', label: 'Do sekcji Kanały głosowe', description: 'Kanały trafią do istniejącej kategorii' },
  vip: { emoji: '💎', label: 'Do Strefy VIP', description: 'Kanały trafią do istniejącej kategorii' },
  staff: { emoji: '🛡️', label: 'Do sekcji Administracja', description: 'Kanały trafią do istniejącej kategorii' },
};

/** Wyciąga emoji z początku nazwy („🏆 Turnieje” → emoji 🏆, nazwa „Turnieje”). */
function splitEmoji(text) {
  const match = String(text).match(/^\s*(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u);
  return match ? { emoji: match[1], name: text.slice(match[0].length) } : { emoji: null, name: text };
}

const customStep = {
  id: 'custom',
  emoji: '📁',
  title: 'Własne kanały i kategorie',
  intro: 'Brakuje czegoś? Dodaj własne kanały tekstowe i głosowe – w nowej kategorii albo w istniejącej sekcji (np. dodatkowe kanały w „Społeczności”). Ten krok jest opcjonalny.',
  render(s) {
    const cats = s.answers.customCategories;
    const fields = cats.map((c, i) => {
      const target = CUSTOM_TARGETS[c.target || 'new'];
      const where = (c.target || 'new') === 'new' ? `${c.emoji || '📁'} ${c.name}` : `${target.emoji} ${target.label.replace('Do sekcji ', '→ ').replace('Do ', '→ ')}`;
      return field(
        `${i + 1}. ${where} – ${ACCESS[c.access]?.emoji} ${ACCESS[c.access]?.label}`,
        [
          c.text.length ? `💬 ${c.text.map((t) => `#${N.slugify(t)}`).join(', ')}` : null,
          c.voice.length ? `🔊 ${c.voice.join(', ')}` : null,
        ].filter(Boolean).join('\n') || '*pusta – zostanie pominięta*',
      );
    });
    if (!cats.length) fields.push(field('📭 Brak własnych kanałów', 'Kliknij **Dodaj kanały**, aby utworzyć np. kategorię „🏆 Turnieje” z kanałami #zapisy i #drabinka albo dorzucić #pomysły do sekcji „Społeczność”.'));
    return {
      fields,
      rows: [row(
        button(cid(s, 'b', 'add'), 'Dodaj kanały', { style: ButtonStyle.Primary, emoji: '➕', disabled: cats.length >= MAX_CUSTOM }),
        button(cid(s, 'b', 'undo'), 'Usuń ostatnie', { emoji: '↩️', disabled: !cats.length }),
        button(cid(s, 'b', 'clear'), 'Usuń wszystkie', { emoji: '🧹', disabled: !cats.length }),
      )],
    };
  },
  button: {
    add(s) {
      return {
        modal: modal(cid(s, 'm', 'category'), 'Dodaj własne kanały', [
          {
            id: 'target', label: 'Gdzie dodać kanały?',
            select: { options: Object.entries(CUSTOM_TARGETS).map(([value, d]) => ({ value, label: d.label, description: d.description, emoji: d.emoji, default: value === 'new' })) },
          },
          { id: 'name', label: 'Nazwa nowej kategorii', description: 'Możesz zacząć od emoji, np. „🏆 Turnieje”. Pomiń przy istniejącej sekcji.', style: 'short', max: 60, placeholder: '🏆 Turnieje' },
          { id: 'text', label: 'Kanały tekstowe', description: 'Oddziel przecinkami', style: 'paragraph', max: 800, placeholder: 'zapisy, drabinka, wyniki' },
          { id: 'voice', label: 'Kanały głosowe', description: 'Oddziel przecinkami', style: 'paragraph', max: 500, placeholder: 'Sędziowie, Mecz 1, Mecz 2' },
          { id: 'access', label: 'Kto ma dostęp?', select: { options: Object.entries(ACCESS).map(([value, d]) => ({ value, label: d.label, description: d.description, emoji: d.emoji, default: value === 'public' })) } },
        ]),
      };
    },
    undo(s) { s.answers.customCategories.pop(); },
    clear(s) { s.answers.customCategories = []; },
  },
  modal: {
    category(s, i) {
      if (s.answers.customCategories.length >= MAX_CUSTOM) return;
      const target = CUSTOM_TARGETS[modalSelect(i, 'target')[0]] ? modalSelect(i, 'target')[0] : 'new';
      const { emoji, name: rawName } = splitEmoji(modalText(i, 'name'));
      const name = N.cleanName(rawName, 60);
      const text = N.parseList(modalText(i, 'text'), { max: 20, maxLength: 60 });
      const voice = N.parseList(modalText(i, 'voice'), { max: 20, maxLength: 60 });
      const access = modalSelect(i, 'access')[0] || 'public';
      if (target === 'new' && !name) { s.flash = '⚠️ Nowa kategoria musi mieć nazwę.'; return; }
      if (!text.length && !voice.length) { s.flash = '⚠️ Nie podano żadnych kanałów – nic nie dodano.'; return; }
      s.answers.customCategories.push({ target, name: target === 'new' ? name : '', text, voice, access: ACCESS[access] ? access : 'public', emoji: emoji || '📁' });
    },
  },
};

// ───────────────────────────── 14. TREŚCI ─────────────────────────────

const COMMUNITY_OPTIONS = {
  full: { emoji: '🌟', label: 'Społeczność + ekran powitalny', description: 'Kanały ogłoszeń, sceny, ekran powitalny (zalecane)' },
  basic: { emoji: '🏘️', label: 'Społeczność bez ekranu powitalnego', description: 'Kanały ogłoszeń i sceny' },
  off: { emoji: '🚫', label: 'Bez trybu Społeczności', description: 'Zwykły serwer (ogłoszenia jako kanały tekstowe)' },
};

const contentStep = {
  id: 'content',
  emoji: '📨',
  title: 'Wiadomości',
  intro: 'Bot może od razu opublikować gotowe treści tekstowe: regulamin, informacje o serwerze, opis ról, FAQ, przewodnik dla ekipy oraz panel weryfikacji z przyciskiem.',
  render(s) {
    const a = s.answers;
    const chosen = Object.entries(CONTENT_OPTIONS).filter(([k]) => a.content.panels.includes(k));
    const color = EMBED_COLORS[a.content.embedColor] || EMBED_COLORS.palette;
    return {
      fields: [
        field(`📨 Publikowane treści (${chosen.length})`, chosen.map(([, o]) => `${o.emoji} ${o.label}`).join('\n') || '*nic – serwer będzie pusty*'),
        field('🌟 Tryb Społeczności', `${COMMUNITY_OPTIONS[a.content.community].emoji} ${COMMUNITY_OPTIONS[a.content.community].label}`, true),
        field('🎨 Kolor wiadomości', `${color.emoji} ${color.label}`, true),
        field('ℹ️ Weryfikacja', 'Przycisk „Zweryfikuj się” obsługuje ten bot – musi być online, aby działał. Pozostałe wiadomości to zwykły tekst.'),
      ],
      rows: [
        selectRow(cid(s, 's', 'panels'), {
          placeholder: '📨 Co opublikować?',
          min: 0,
          max: Object.keys(CONTENT_OPTIONS).length,
          options: opts(Object.entries(CONTENT_OPTIONS), a.content.panels, (o) => ({ label: o.label, description: o.description, emoji: o.emoji })),
        }),
        selectRow(cid(s, 's', 'community'), {
          placeholder: 'Tryb Społeczności Discorda',
          options: opts(Object.entries(COMMUNITY_OPTIONS), a.content.community, (o) => ({ label: o.label, description: o.description, emoji: o.emoji })),
        }),
        selectRow(cid(s, 's', 'color'), {
          placeholder: 'Kolor wiadomości bota',
          options: opts(Object.entries(EMBED_COLORS), a.content.embedColor, (o) => ({ label: o.label, emoji: o.emoji })),
        }),
      ],
    };
  },
  select: {
    panels(s, values) { s.answers.content.panels = values.filter((v) => CONTENT_OPTIONS[v]); },
    community(s, [v]) { if (COMMUNITY_OPTIONS[v]) { s.answers.content.community = v; markTouched(s.answers, 'content.community'); } },
    color(s, [v]) { if (EMBED_COLORS[v]) s.answers.content.embedColor = v; },
  },
};

// ───────────────────────────── 15. REGULAMIN I TREŚCI ─────────────────────────────

const MAX_RULES = 20;
const MAX_FAQ = 15;

/** „Pytanie | Odpowiedź” (albo „Pytanie? Odpowiedź”) – jedna para w linii. */
function parseFaq(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    let q;
    let a;
    if (line.includes('|')) {
      [q, ...a] = line.split('|');
      a = a.join('|');
    } else if (line.includes('?')) {
      const i = line.indexOf('?');
      q = line.slice(0, i + 1);
      a = line.slice(i + 1);
    } else {
      continue;
    }
    q = N.cleanName(q, 200);
    a = String(a).trim().slice(0, 900);
    if (q && a) out.push({ q, a });
    if (out.length >= MAX_FAQ) break;
  }
  return out;
}

const textsStep = {
  id: 'texts',
  emoji: '📜',
  title: 'Regulamin i treści',
  intro: 'Dopasuj regulamin i teksty do siebie: wybierz paragrafy regulaminu i system kar, dopisz własne zasady i pytania FAQ oraz napisz pierwsze ogłoszenie, które bot opublikuje na start.',
  render(s) {
    const t = s.answers.texts;
    const chosen = Object.entries(RULE_SECTIONS).filter(([k]) => t.ruleSections.includes(k));
    const style = PUNISHMENT_STYLES[t.punishments] || PUNISHMENT_STYLES.ladder;
    const fields = [
      field(`📜 Paragrafy regulaminu (${chosen.length}/${Object.keys(RULE_SECTIONS).length})`, chosen.map(([, r]) => `${r.emoji} ${r.label}`).join('\n') || '*brak – regulamin będzie zawierał tylko Twoje zasady*', true),
      field('⚖️ System kar', `${style.emoji} **${style.label}**\n${style.description}`, true),
      field(`✍️ Twoje zasady (${t.customRules.length})`, t.customRules.length ? t.customRules.slice(0, 6).map((r, i) => `**${i + 1}.** ${clip(r, 120)}`).join('\n') + (t.customRules.length > 6 ? `\n…i ${t.customRules.length - 6} więcej` : '') : '*brak – kliknij „Własne zasady”*'),
      field(`❓ Twoje pytania FAQ (${t.customFaq.length})`, t.customFaq.length ? t.customFaq.slice(0, 5).map((e) => `❔ ${clip(e.q, 90)}`).join('\n') + `\n*Standardowe pytania: ${t.faqDefaults === false ? 'ukryte' : 'zostają'}*` : '*brak – bot doda standardowe pytania*'),
      field('📢 Pierwsze ogłoszenie', t.announcement?.text ? `**${clip(t.announcement.title || 'Ogłoszenie', 100)}**\n${clip(t.announcement.text, 250)}\n*Ping: ${{ none: 'bez oznaczenia', role: 'rola Ogłoszenia', everyone: '@everyone' }[t.announcement.ping] || 'bez oznaczenia'}*` : '*brak – kliknij „Pierwsze ogłoszenie”*'),
    ];
    if (!s.answers.modules.includes('rules')) fields.push(field('⚠️ Regulamin wyłączony', 'Sekcja „Regulamin” jest wyłączona w kroku „Sekcje serwera” – paragrafy i zasady nie zostaną opublikowane.'));
    return {
      fields,
      rows: [
        selectRow(cid(s, 's', 'sections'), {
          placeholder: '📜 Paragrafy regulaminu…',
          min: 0,
          max: Object.keys(RULE_SECTIONS).length,
          options: opts(Object.entries(RULE_SECTIONS), t.ruleSections, (r) => ({ label: r.label, description: r.description, emoji: r.emoji })),
        }),
        selectRow(cid(s, 's', 'punish'), {
          placeholder: '⚖️ System kar',
          options: opts(Object.entries(PUNISHMENT_STYLES), t.punishments, (r) => ({ label: r.label, description: r.description, emoji: r.emoji })),
        }),
        row(
          button(cid(s, 'b', 'rules'), 'Własne zasady', { style: ButtonStyle.Primary, emoji: '✍️' }),
          button(cid(s, 'b', 'faq'), 'Własne FAQ', { style: ButtonStyle.Primary, emoji: '❓' }),
          button(cid(s, 'b', 'announce'), 'Pierwsze ogłoszenie', { style: ButtonStyle.Primary, emoji: '📢' }),
          button(cid(s, 'b', 'clear'), 'Wyczyść własne teksty', { emoji: '🧹', disabled: !t.customRules.length && !t.customFaq.length && !t.announcement }),
        ),
      ],
    };
  },
  select: {
    sections(s, values) { s.answers.texts.ruleSections = values.filter((v) => RULE_SECTIONS[v]); },
    punish(s, [v]) { if (PUNISHMENT_STYLES[v]) s.answers.texts.punishments = v; },
  },
  button: {
    rules(s) {
      return {
        modal: modal(cid(s, 'm', 'rules'), 'Własne zasady regulaminu', [{
          id: 'rules', label: 'Zasady (jedna w linii)', description: `Pojawią się w regulaminie jako osobny paragraf (max ${MAX_RULES}).`,
          style: 'paragraph', max: 4000, value: s.answers.texts.customRules.join('\n'),
          placeholder: 'Zakaz rozmów o polityce\nNa kanale #memy tylko memy\nPrzed pytaniem przeczytaj FAQ',
        }]),
      };
    },
    faq(s) {
      const t = s.answers.texts;
      return {
        modal: modal(cid(s, 'm', 'faq'), 'Własne pytania FAQ', [
          {
            id: 'faq', label: 'Pytania i odpowiedzi', description: `Jedno w linii: Pytanie | Odpowiedź (max ${MAX_FAQ})`,
            style: 'paragraph', max: 4000, value: t.customFaq.map((e) => `${e.q} | ${e.a}`).join('\n'),
            placeholder: 'Kiedy są eventy? | W każdy piątek o 20:00\nJak zostać VIP? | Aktywnie pomagaj innym',
          },
          {
            id: 'defaults', label: 'Standardowe pytania', description: 'Pytania dodawane przez kreator (role, kary, reklama…)',
            select: { options: [
              { value: 'keep', label: 'Zostaw standardowe + moje', emoji: '➕', default: t.faqDefaults !== false },
              { value: 'only', label: 'Tylko moje pytania', emoji: '✍️', default: t.faqDefaults === false },
            ] },
          },
        ]),
      };
    },
    announce(s) {
      const a = s.answers.texts.announcement || {};
      return {
        modal: modal(cid(s, 'm', 'announce'), 'Pierwsze ogłoszenie', [
          { id: 'title', label: 'Tytuł', style: 'short', max: 200, value: a.title || '', placeholder: '🎉 Serwer oficjalnie otwarty!' },
          { id: 'text', label: 'Treść ogłoszenia', style: 'paragraph', max: 3500, required: true, value: a.text || '', placeholder: 'Witajcie! Od dziś startujemy z…' },
          {
            id: 'ping', label: 'Kogo oznaczyć?', select: { options: [
              { value: 'none', label: 'Nikogo', emoji: '🔕', default: !a.ping || a.ping === 'none' },
              { value: 'role', label: 'Rolę „Ogłoszenia” (jeśli istnieje)', emoji: '🔔', default: a.ping === 'role' },
              { value: 'everyone', label: '@everyone', emoji: '📣', default: a.ping === 'everyone' },
            ] },
          },
        ]),
      };
    },
    clear(s) {
      Object.assign(s.answers.texts, { customRules: [], customFaq: [], faqDefaults: true, announcement: null });
    },
  },
  modal: {
    rules(s, i) {
      const lines = modalText(i, 'rules').split(/\n+/).map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
      s.answers.texts.customRules = lines.slice(0, MAX_RULES).map((l) => l.slice(0, 500));
      if (lines.length > MAX_RULES) s.flash = `⚠️ Można dodać maksymalnie ${MAX_RULES} zasad – nadmiarowe pominięto.`;
      if (lines.length && !s.answers.modules.includes('rules')) {
        s.answers.modules = [...s.answers.modules, 'rules'];
        s.flash = 'ℹ️ Włączono sekcję „Regulamin”, żeby Twoje zasady zostały opublikowane.';
      }
    },
    faq(s, i) {
      const raw = modalText(i, 'faq');
      const parsed = parseFaq(raw);
      s.answers.texts.customFaq = parsed;
      s.answers.texts.faqDefaults = (modalSelect(i, 'defaults')[0] || 'keep') !== 'only';
      if (raw.trim() && !parsed.length) s.flash = '⚠️ Nie rozpoznano pytań. Wpisz np. „Kiedy są eventy? | W piątki o 20:00”.';
      if (parsed.length && !s.answers.modules.includes('faq')) {
        s.answers.modules = [...s.answers.modules, 'faq'];
        s.flash = 'ℹ️ Włączono sekcję „FAQ”, żeby Twoje pytania zostały opublikowane.';
      }
    },
    announce(s, i) {
      const text = modalText(i, 'text');
      s.answers.texts.announcement = text ? {
        title: modalText(i, 'title').slice(0, 200),
        text: text.slice(0, 3500),
        ping: ['none', 'role', 'everyone'].includes(modalSelect(i, 'ping')[0]) ? modalSelect(i, 'ping')[0] : 'none',
      } : null;
    },
  },
};

// ───────────────────────────── 16. TRYB BUDOWY ─────────────────────────────

const modeStep = {
  id: 'mode',
  emoji: '⚙️',
  title: 'Tryb budowy',
  intro: 'Możesz dobudować nową strukturę obok istniejącej albo wyczyścić serwer i zbudować go od zera.',
  render(s) {
    const m = s.answers.mode;
    const isOwner = s.env.isOwner;
    return {
      fields: [
        field('🏗️ Tryb', m.type === 'wipe' ? '🧨 **Wyczyść i zbuduj od nowa**' : '➕ **Dodaj do obecnej struktury**', true),
        field('👑 Nadaj mi rolę', yesNo(m.assign), true),
        m.type === 'wipe'
          ? field('⚠️ Uwaga – tryb czyszczenia', `Zostaną **nieodwracalnie usunięte**: wszystkie kanały i kategorie (${s.env.existingChannels ?? '?'}), role poniżej roli bota (${Math.max(0, (s.env.existingRoles ?? 1) - 1)}) oraz reguły AutoMod.\nZachowane zostaną: członkowie, emoji, naklejki, bany, role botów oraz kanał, z którego uruchomiono kreator (usuniesz go jednym kliknięciem na końcu).\nPrzed startem trzeba będzie wpisać nazwę serwera.`)
          : field('ℹ️ Tryb dodawania', 'Istniejące kanały i role zostaną nietknięte – nowa struktura pojawi się pod nimi.'),
        !isOwner ? field('🔒 Czyszczenie serwera', 'Tylko właściciel serwera może użyć trybu czyszczenia.') : null,
      ].filter(Boolean),
      rows: [
        selectRow(cid(s, 's', 'mode'), {
          placeholder: 'Tryb budowy',
          options: [
            { value: 'append', label: 'Dodaj do obecnej struktury', description: 'Bezpieczne – nic nie jest usuwane', emoji: '➕', default: m.type !== 'wipe' },
            { value: 'wipe', label: 'Wyczyść serwer i zbuduj od nowa', description: isOwner ? 'Usuwa kanały, role i AutoMod (wymaga potwierdzenia)' : 'Tylko dla właściciela serwera', emoji: '🧨', default: m.type === 'wipe' },
          ],
        }),
        selectRow(cid(s, 's', 'assign'), {
          placeholder: 'Nadać Ci rolę po zbudowaniu?',
          options: [
            { value: 'yes', label: 'Tak – nadaj mi najwyższą rolę', description: 'Właściciel serwera dostaje rolę Właściciel, Ty – najwyższą rolę ekipy', emoji: '👑', default: m.assign },
            { value: 'no', label: 'Nie – nadam role samodzielnie', emoji: '🙅', default: !m.assign },
          ],
        }),
      ],
    };
  },
  select: {
    mode(s, [v]) {
      if (v === 'wipe' && !s.env.isOwner) {
        s.flash = '🔒 Tryb czyszczenia jest dostępny tylko dla właściciela serwera.';
        s.answers.mode.type = 'append';
        return;
      }
      s.answers.mode.type = v === 'wipe' ? 'wipe' : 'append';
    },
    assign(s, [v]) { s.answers.mode.assign = v === 'yes'; },
  },
};

const STEPS = [
  typeStep, basicsStep, profileStep, styleStep, modulesStep, specialStep, staffStep, rolesStep,
  permissionsStep, accessStep, securityStep, channelsStep, customStep, contentStep, textsStep, modeStep,
];

const STEP_INDEX = Object.fromEntries(STEPS.map((step, i) => [step.id, i]));

module.exports = { STEPS, STEP_INDEX, COMMUNITY_OPTIONS, ACCESS, VOICE_LAYOUTS, LIST_MAX, VERIFY_OPTIONS, CUSTOM_TARGETS, parseFaq, splitEmoji };
