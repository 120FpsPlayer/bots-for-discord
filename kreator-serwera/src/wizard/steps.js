'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { MODULES, MODULE_GROUPS } = require('../data/modules');
const { STAFF_ROLES, STAFF_LEVELS, ROLE_GROUP_OPTIONS } = require('../data/roles');
const { CHANNEL_STYLES, CATEGORY_STYLES, PALETTES, EMBED_COLORS } = require('../data/styles');
const {
  VERIFICATION_LEVELS, CONTENT_FILTERS, NOTIFICATION_OPTIONS, AUTOMOD_OPTIONS,
} = require('../data/security');
const { MEMBER_TOGGLES } = require('../builder/permissions');
const { CONTENT_OPTIONS } = require('../builder/content');
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
      .map(([k, d]) => ({ name: tr(d.name, 'pl'), emoji: d.emoji, level: d.level, rank: STAFF_LEVELS[d.level].rank + (d.rankOffset || 0) }))
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
  },
  modal: {
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
  intro: 'Wybierz role dla członków. Role oznaczone jako „do wyboru” (kolory, powiadomienia, wiek, zaimki, platformy, region, zainteresowania) trafią do panelu, w którym każdy wybierze je sam.',
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
        field('🔹 Własne role do wyboru', customSelf.join(', ') || '*brak*', true),
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
          { id: 'self', label: 'Role do samodzielnego wyboru', description: 'Trafią do panelu wyboru ról. Jedna w linii.', style: 'paragraph', max: 1000, placeholder: 'Szukam drużyny\nNocny marek\nStreamer' },
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

// ───────────────────────────── 10. BEZPIECZEŃSTWO ─────────────────────────────

const securityStep = {
  id: 'security',
  emoji: '🛡️',
  title: 'Bezpieczeństwo i AutoMod',
  intro: 'Ustaw poziom weryfikacji Discorda, filtr multimediów i reguły AutoMod, które automatycznie blokują spam, oszustwa i wulgaryzmy. Alerty trafią na kanał logów.',
  render(s) {
    const a = s.answers;
    const lvl = VERIFICATION_LEVELS.find((v) => v.value === Number(a.security.verificationLevel));
    const flt = CONTENT_FILTERS.find((v) => v.value === Number(a.security.contentFilter));
    const am = Object.entries(AUTOMOD_OPTIONS).filter(([k]) => a.security.automod.includes(k));
    return {
      fields: [
        field('🔐 Poziom weryfikacji', `${lvl.emoji} **${lvl.label}** – ${lvl.description}`, true),
        field('🖼️ Filtr multimediów', `${flt.emoji} **${flt.label}**`, true),
        field(`🤖 AutoMod (${am.length})`, am.map(([, o]) => `${o.emoji} ${o.label}`).join('\n') || '*wyłączony*'),
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
      ],
    };
  },
  select: {
    verification(s, [v]) { s.answers.security.verificationLevel = Number(v); markTouched(s.answers, 'security.verificationLevel'); },
    filter(s, [v]) { s.answers.security.contentFilter = Number(v); markTouched(s.answers, 'security.contentFilter'); },
    automod(s, values) { s.answers.security.automod = values.filter((v) => AUTOMOD_OPTIONS[v]); markTouched(s.answers, 'security.automod'); },
  },
};

// ───────────────────────────── 11. KANAŁY ─────────────────────────────

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

// ───────────────────────────── 12. WŁASNE KATEGORIE ─────────────────────────────

const ACCESS = {
  public: { emoji: '🌍', label: 'Publiczna', description: 'Widoczna dla wszystkich członków' },
  readonly: { emoji: '👁️', label: 'Tylko do odczytu', description: 'Wszyscy widzą, pisze tylko ekipa' },
  staff: { emoji: '🛡️', label: 'Tylko ekipa', description: 'Prywatna kategoria administracji' },
  vip: { emoji: '💎', label: 'VIP / boosterzy', description: 'Dla VIP-ów, partnerów i boosterów' },
};
const MAX_CUSTOM = 10;

const customStep = {
  id: 'custom',
  emoji: '📁',
  title: 'Własne kategorie',
  intro: 'Brakuje czegoś? Dodaj własne kategorie z dowolnymi kanałami tekstowymi i głosowymi. Ten krok jest opcjonalny.',
  render(s) {
    const cats = s.answers.customCategories;
    const fields = cats.map((c, i) => field(
      `${i + 1}. ${c.emoji || '📁'} ${c.name} – ${ACCESS[c.access]?.emoji} ${ACCESS[c.access]?.label}`,
      [
        c.text.length ? `💬 ${c.text.map((t) => `#${N.slugify(t)}`).join(', ')}` : null,
        c.voice.length ? `🔊 ${c.voice.join(', ')}` : null,
      ].filter(Boolean).join('\n') || '*pusta – zostanie pominięta*',
    ));
    if (!cats.length) fields.push(field('📭 Brak własnych kategorii', 'Kliknij **Dodaj kategorię**, aby utworzyć np. „Turnieje” z kanałami #zapisy, #drabinka i kanałem głosowym „Sędziowie”.'));
    return {
      fields,
      rows: [row(
        button(cid(s, 'b', 'add'), 'Dodaj kategorię', { style: ButtonStyle.Primary, emoji: '➕', disabled: cats.length >= MAX_CUSTOM }),
        button(cid(s, 'b', 'undo'), 'Usuń ostatnią', { emoji: '↩️', disabled: !cats.length }),
        button(cid(s, 'b', 'clear'), 'Usuń wszystkie', { emoji: '🧹', disabled: !cats.length }),
      )],
    };
  },
  button: {
    add(s) {
      return {
        modal: modal(cid(s, 'm', 'category'), 'Nowa kategoria', [
          { id: 'name', label: 'Nazwa kategorii', style: 'short', required: true, max: 60, placeholder: 'np. Turnieje' },
          { id: 'text', label: 'Kanały tekstowe', description: 'Oddziel przecinkami', style: 'paragraph', max: 800, placeholder: 'zapisy, drabinka, wyniki' },
          { id: 'voice', label: 'Kanały głosowe', description: 'Oddziel przecinkami', style: 'paragraph', max: 500, placeholder: 'Sędziowie, Mecz 1, Mecz 2' },
          { id: 'access', label: 'Kto ma dostęp?', select: { options: Object.entries(ACCESS).map(([value, d]) => ({ value, label: d.label, description: d.description, emoji: d.emoji, default: value === 'public' })) } },
          { id: 'emoji', label: 'Emoji kategorii (opcjonalnie)', style: 'short', max: 16, placeholder: '🏆' },
        ]),
      };
    },
    undo(s) { s.answers.customCategories.pop(); },
    clear(s) { s.answers.customCategories = []; },
  },
  modal: {
    category(s, i) {
      if (s.answers.customCategories.length >= MAX_CUSTOM) return;
      const name = N.cleanName(modalText(i, 'name'), 60);
      const text = N.parseList(modalText(i, 'text'), { max: 20, maxLength: 60 });
      const voice = N.parseList(modalText(i, 'voice'), { max: 20, maxLength: 60 });
      const access = modalSelect(i, 'access')[0] || 'public';
      const emojiRaw = modalText(i, 'emoji');
      const emoji = /\p{Extended_Pictographic}/u.test(emojiRaw) ? Array.from(emojiRaw).slice(0, 4).join('') : '📁';
      if (!name) { s.flash = '⚠️ Kategoria musi mieć nazwę.'; return; }
      if (!text.length && !voice.length) s.flash = '⚠️ Dodano kategorię bez kanałów – zostanie pominięta przy budowie.';
      s.answers.customCategories.push({ name, text, voice, access: ACCESS[access] ? access : 'public', emoji });
    },
  },
};

// ───────────────────────────── 13. TREŚCI ─────────────────────────────

const COMMUNITY_OPTIONS = {
  full: { emoji: '🌟', label: 'Społeczność + ekran powitalny', description: 'Kanały ogłoszeń, sceny, ekran powitalny (zalecane)' },
  basic: { emoji: '🏘️', label: 'Społeczność bez ekranu powitalnego', description: 'Kanały ogłoszeń i sceny' },
  off: { emoji: '🚫', label: 'Bez trybu Społeczności', description: 'Zwykły serwer (ogłoszenia jako kanały tekstowe)' },
};

const contentStep = {
  id: 'content',
  emoji: '📨',
  title: 'Wiadomości i panele',
  intro: 'Bot może od razu opublikować gotowe treści: regulamin, informacje, panel weryfikacji z przyciskiem, panel wyboru ról, system ticketów i przewodnik dla ekipy.',
  render(s) {
    const a = s.answers;
    const chosen = Object.entries(CONTENT_OPTIONS).filter(([k]) => a.content.panels.includes(k));
    const color = EMBED_COLORS[a.content.embedColor] || EMBED_COLORS.palette;
    return {
      fields: [
        field(`📨 Publikowane treści (${chosen.length})`, chosen.map(([, o]) => `${o.emoji} ${o.label}`).join('\n') || '*nic – serwer będzie pusty*'),
        field('🌟 Tryb Społeczności', `${COMMUNITY_OPTIONS[a.content.community].emoji} ${COMMUNITY_OPTIONS[a.content.community].label}`, true),
        field('🎨 Kolor wiadomości', `${color.emoji} ${color.label}`, true),
        field('ℹ️ Panele działają na stałe', 'Przyciski weryfikacji, menu ról i tickety obsługuje ten bot – musi być online, aby działały.'),
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

// ───────────────────────────── 14. TRYB BUDOWY ─────────────────────────────

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
  permissionsStep, securityStep, channelsStep, customStep, contentStep, modeStep,
];

const STEP_INDEX = Object.fromEntries(STEPS.map((step, i) => [step.id, i]));

module.exports = { STEPS, STEP_INDEX, COMMUNITY_OPTIONS, ACCESS, VOICE_LAYOUTS, LIST_MAX };
