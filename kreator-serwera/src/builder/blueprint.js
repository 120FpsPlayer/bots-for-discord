'use strict';

const { SERVER_TYPES } = require('../data/serverTypes');
const { MODULES, CATEGORIES, CATEGORY_ORDER, SIZE_ORDER } = require('../data/modules');
const {
  STAFF_ROLES, STAFF_LEVELS, COMMUNITY_ROLES, LEVEL_ROLES, NOTIFICATION_ROLES,
  AGE_ROLES, PRONOUN_ROLES, PLATFORM_ROLES, REGION_ROLES, SEPARATORS,
} = require('../data/roles');
const { PALETTES, COLOR_ROLES, EMBED_COLORS, lerpColor } = require('../data/styles');
const { POLISH_PROFANITY, SCAM_KEYWORDS, INVITE_REGEX } = require('../data/security');
const P = require('./permissions');
const N = require('./naming');
const { L, tr, fill } = require('../utils/i18n');
const { BOTS } = require('../data/bots');

/**
 * Zamienia odpowiedzi z kreatora na „blueprint” – kompletny, niezależny od Discorda
 * opis serwera: role (w kolejności od najwyższej), kategorie z kanałami i nadpisaniami
 * uprawnień, wiadomości do opublikowania, reguły AutoMod i ustawienia serwera.
 *
 * Blueprint jest czystymi danymi (JSON), więc można go podejrzeć w kreatorze,
 * wyeksportować do pliku i przetestować bez łączenia się z Discordem.
 */

const LIMITS = { channels: 500, roles: 250, perCategory: 50 };
const TEXT_KINDS = new Set(['text', 'announcement', 'forum']);
const VOICE_KINDS = new Set(['voice', 'stage']);

const POST_PANEL = {
  rules: 'rules', info: 'info', rolesInfo: 'rolesInfo',
  welcomeChat: 'welcomeChat', staffGuide: 'staffGuide', faq: 'faq',
};

const HOISTED_LEVELS = new Set(['owner', 'admin', 'mod', 'helper', 'trial']);

/** Sekcja (do ustawień dostępu) dla klucza kategorii; własne kategorie mają dostęp ustawiany osobno. */
function sectionOfCategory(key) {
  const base = String(key).split('#')[0];
  if (base === 'items' || base.startsWith('item:')) return 'items';
  if (base.startsWith('custom')) return null;
  return base;
}

function sizeAtLeast(size, min) {
  return SIZE_ORDER.indexOf(size) >= SIZE_ORDER.indexOf(min || 'small');
}

/**
 * @param {object} input  odpowiedzi kreatora (answers)
 * @param {object} [env]  { existingChannels, existingRoles } – do walidacji limitów w trybie „dodaj”
 */
function buildBlueprint(input, env = {}) {
  const answers = structuredClone(input);
  const warnings = [];
  const errors = [];
  const lang = answers.language === 'en' ? 'en' : 'pl';
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const presetKey = SERVER_TYPES[answers.type] ? answers.type : 'custom';
  const preset = SERVER_TYPES[presetKey];
  const palette = PALETTES[answers.style.palette] ?? PALETTES.modern;
  const roleEmoji = answers.style.options.includes('roleEmoji');
  const useSeparators = answers.style.options.includes('separators');
  // Sekcje ukryte (grupa X) dodają tylko boty z kroku „Boty” – nie da się ich wybrać ręcznie.
  const modules = new Set(answers.modules.filter((m) => MODULES[m] && MODULES[m].group !== 'X'));
  const bots = [...new Set((answers.bots || []).filter((k) => BOTS[k]))];
  for (const key of bots) {
    for (const need of BOTS[key].needs) {
      if (need.unless && modules.has(need.unless)) continue;
      if (!modules.has(need.module)) {
        modules.add(need.module);
        if (MODULES[need.module]?.group !== 'X') warnings.push(`Bot ${BOTS[key].name} potrzebuje sekcji „${MODULES[need.module].label}” – została dodana.`);
      }
    }
  }
  const panels = new Set(answers.content.panels);
  const community = answers.content.community !== 'off';
  const size = SIZE_ORDER.includes(answers.size) ? answers.size : 'medium';
  const list = preset.list;
  const specialOpts = new Set(answers.special.options || []);
  const items = list ? (answers.special.items || []).slice(0, 25) : [];

  // ── Zależności między ustawieniami ────────────────────────────────
  if (String(answers.age) !== '18' && modules.has('nsfw')) {
    modules.delete('nsfw');
    warnings.push('Kanał 18+ usunięty – serwer nie jest oznaczony jako tylko dla dorosłych.');
  }
  if (community && !modules.has('rules')) {
    modules.add('rules');
    warnings.push('Tryb Społeczności wymaga kanału z regulaminem – dodano moduł „Regulamin”.');
  }
  if (community && !modules.has('staff')) {
    modules.add('staff');
    warnings.push('Tryb Społeczności wymaga kanału dla moderatorów – dodano „Strefę administracji”.');
  }
  const roleGroups = new Set(answers.communityRoles);
  if (bots.length && !roleGroups.has('bots')) {
    roleGroups.add('bots');
    warnings.push('Wybrane boty dostaną rolę „Boty” z dostępem do swoich kanałów – dodano ją automatycznie.');
  }
  if (modules.has('verification') && !roleGroups.has('member')) {
    roleGroups.add('member');
    warnings.push('Weryfikacja wymaga roli członka – została dodana automatycznie.');
  }
  if (specialOpts.has('private')) specialOpts.add('role');
  const gate = modules.has('verification');
  const memberToggles = answers.permissions.member.filter((t) => P.MEMBER_TOGGLES[t]);
  const memberPerms = P.unique([...P.MEMBER_CORE, ...memberToggles.flatMap((t) => P.MEMBER_TOGGLES[t].perms)]);
  const filesOff = !memberToggles.includes('files');
  const colorOf = (slot) => (typeof slot === 'number' ? slot : palette[slot] ?? 0);

  // ── ROLE ──────────────────────────────────────────────────────────
  const sections = [];
  const section = (key, header, roles) => { if (roles.length) sections.push({ key, header, roles }); };
  const roleName = (emoji, name) => N.formatRoleName(emoji, name, roleEmoji);

  // Personel
  const staffRoles = [];
  const extrasByKey = Object.fromEntries((preset.staffExtras || []).map((e) => [e.key, e]));
  answers.staffRoles.forEach((key, order) => {
    const def = STAFF_ROLES[key] || extrasByKey[key];
    if (!def) return;
    const isExtra = !STAFF_ROLES[key];
    const level = STAFF_LEVELS[def.level] ? def.level : 'none';
    const label = N.cleanName(answers.roleNames?.[key] || '', 80) || tr(def.name, lang);
    staffRoles.push({
      key,
      name: roleName(def.emoji, label),
      label,
      emoji: def.emoji,
      color: colorOf(def.color),
      hoist: HOISTED_LEVELS.has(level),
      mentionable: false,
      permissions: P.STAFF_PERMISSIONS[level],
      staff: true,
      level,
      rank: STAFF_LEVELS[level].rank + (def.rankOffset || 0) + (isExtra && level !== 'none' ? -0.5 : 0) + order / 1000,
    });
  });
  (answers.customStaff || []).forEach((c, i) => {
    const level = STAFF_LEVELS[c.level] ? c.level : 'none';
    staffRoles.push({
      key: `cstaff${i}`,
      name: roleName('🔰', N.cleanName(c.name, 80)),
      label: N.cleanName(c.name, 80),
      emoji: '🔰',
      color: c.color ?? colorOf('staffExtra'),
      hoist: HOISTED_LEVELS.has(level),
      mentionable: false,
      permissions: P.STAFF_PERMISSIONS[level],
      staff: true,
      level,
      rank: STAFF_LEVELS[level].rank + 0.7 + i / 1000,
    });
  });
  staffRoles.sort((a, b) => a.rank - b.rank);
  section('staff', SEPARATORS.staff, staffRoles);

  // Role specjalne
  const special = [];
  const communityRole = (key) => {
    const def = COMMUNITY_ROLES[key];
    return {
      key, name: roleName(def.emoji, tr(def.name, lang)), label: tr(def.name, lang), emoji: def.emoji,
      color: colorOf(def.color), hoist: Boolean(def.hoist), mentionable: false, permissions: [],
    };
  };
  if (roleGroups.has('bots')) special.push({ ...communityRole('bots'), permissions: P.ALL_MEMBER });
  if (roleGroups.has('partner')) special.push(communityRole('partner'));
  if (roleGroups.has('vip')) special.push(communityRole('vip'));
  for (const s of preset.specials || []) {
    if (!roleGroups.has(s.key)) continue;
    special.push({
      key: s.key, name: roleName(s.emoji, tr(s.name, lang)), label: tr(s.name, lang), emoji: s.emoji,
      color: colorOf(s.color), hoist: Boolean(s.hoist), mentionable: false, permissions: [],
    });
  }
  if (roleGroups.has('veteran')) special.push(communityRole('veteran'));
  if (roleGroups.has('active')) special.push(communityRole('active'));
  (answers.customRoles || []).filter((r) => !r.self).forEach((r, i) => {
    const name = N.cleanName(r.name, 80);
    special.push({ key: `cspecial${i}`, name: roleName('✨', name), label: name, emoji: '✨', color: r.color ?? colorOf('special'), hoist: true, mentionable: false, permissions: [] });
  });
  section('special', SEPARATORS.special, special);

  // Role elementów listy (gry, składy, działy…)
  const itemRoles = [];
  const privateItems = specialOpts.has('private');
  if (list && specialOpts.has('role')) {
    items.forEach((item, i) => {
      const name = N.cleanName(item, 80);
      itemRoles.push({
        key: `item${i}`,
        name: roleName(list.roleEmoji, name),
        label: name,
        emoji: list.roleEmoji,
        color: privateItems ? colorOf(list.roleColor || 'access') : 0,
        hoist: false,
        mentionable: Boolean(list.roleMentionable),
        permissions: [],
        self: privateItems ? undefined : { group: 'items', mode: 'multi' },
      });
    });
  }
  if (privateItems) section('access', list.category, itemRoles);

  // Kolory
  if (roleGroups.has('colors')) {
    section('colors', SEPARATORS.colors, COLOR_ROLES.map((c) => ({
      key: `c_${c.key}`, name: roleName(c.emoji, tr(c.name, lang)), label: tr(c.name, lang), emoji: c.emoji,
      color: c.color, hoist: false, mentionable: false, permissions: [], self: { group: 'colors', mode: 'single' },
    })));
  }

  // Poziomy
  if (roleGroups.has('levels')) {
    const levels = LEVEL_ROLES.filter((l) => sizeAtLeast(size, l.minSize));
    section('levels', SEPARATORS.levels, levels.map((l, i) => {
      const t = levels.length > 1 ? 1 - i / (levels.length - 1) : 1;
      const label = T(`Poziom ${l.lvl}`, `Level ${l.lvl}`);
      return {
        key: `lvl${l.lvl}`, name: roleName(l.emoji, label), label, emoji: l.emoji,
        color: lerpColor(palette.levels[0], palette.levels[1], t), hoist: false, mentionable: false, permissions: [],
      };
    }));
  }

  // Rola członka
  if (roleGroups.has('member')) {
    const label = N.cleanName(answers.roleNames?.member || '', 80) || tr(preset.memberName, lang);
    section('members', SEPARATORS.members, [{
      key: 'member', name: roleName(preset.memberEmoji, label), label, emoji: preset.memberEmoji,
      color: colorOf('member'), hoist: true, mentionable: false, permissions: gate ? memberPerms : [],
    }]);
  }

  if (!privateItems) section('items', list?.category ?? SEPARATORS.items, itemRoles);

  // Powiadomienia
  if (roleGroups.has('notifications')) {
    const notif = [
      ...NOTIFICATION_ROLES.filter((n) => modules.has(n.module)),
      ...(preset.notifications || []),
    ].map((n) => ({
      key: `n_${n.key}`, name: roleName(n.emoji, tr(n.name, lang)), label: tr(n.name, lang), emoji: n.emoji,
      color: 0, hoist: false, mentionable: false, permissions: [], self: { group: 'notifications', mode: 'multi' },
    }));
    if (!notif.length) warnings.push('Brak modułów z powiadomieniami (ogłoszenia, wydarzenia…) – role powiadomień pominięto.');
    section('notifications', SEPARATORS.notifications, notif);
  }

  // O mnie: wiek, zaimki, platformy, region
  const about = [];
  const aboutRole = (prefix, def, group, mode) => ({
    key: `${prefix}_${def.key}`, name: roleName(def.emoji, tr(def.name, lang)), label: tr(def.name, lang), emoji: def.emoji,
    color: 0, hoist: false, mentionable: false, permissions: [], self: { group, mode },
  });
  if (roleGroups.has('age')) {
    const min = Number(answers.age) || 13;
    AGE_ROLES.filter((a) => a.min >= min).forEach((a) => about.push(aboutRole('age', a, 'age', 'single')));
  }
  if (roleGroups.has('pronouns')) PRONOUN_ROLES.forEach((r) => about.push(aboutRole('pr', r, 'pronouns', 'multi')));
  if (roleGroups.has('platform')) PLATFORM_ROLES.forEach((r) => about.push(aboutRole('pf', r, 'platform', 'multi')));
  if (roleGroups.has('region')) REGION_ROLES[lang].forEach((r) => about.push(aboutRole('rg', r, 'region', 'single')));
  section('about', SEPARATORS.about, about);

  // Własne role do samodzielnego wyboru
  section('custom', SEPARATORS.custom, (answers.customRoles || []).filter((r) => r.self).map((r, i) => {
    const name = N.cleanName(r.name, 80);
    return {
      key: `cself${i}`, name: roleName('🔹', name), label: name, emoji: '🔹', color: r.color ?? 0,
      hoist: false, mentionable: false, permissions: [], self: { group: 'custom', mode: 'multi' },
    };
  }));

  const roles = [];
  for (const s of sections) {
    if (useSeparators) {
      roles.push({
        key: `sep_${s.key}`, name: N.formatSeparator(tr(s.header, lang)), label: tr(s.header, lang), color: 0,
        hoist: false, mentionable: false, permissions: [], separator: true,
      });
    }
    for (const r of s.roles) r.section = s.key;
    roles.push(...s.roles);
  }
  for (const r of roles) delete r.rank;
  const roleKeys = new Set(roles.map((r) => r.key));
  const has = (key) => roleKeys.has(key);

  // ── GRUPY RÓL DLA NADPISAŃ ────────────────────────────────────────
  // Role z uprawnieniem Administrator i tak widzą wszystko, więc nie zaśmiecamy nimi nadpisań.
  const staffNonOwner = roles.filter((r) => r.staff && r.level !== 'owner');
  const g = {
    admins: staffNonOwner.filter((r) => r.level === 'admin').map((r) => r.key),
    mods: staffNonOwner.filter((r) => ['admin', 'mod'].includes(r.level)).map((r) => r.key),
    staff: staffNonOwner.map((r) => r.key),
    member: has('member') ? ['member'] : [],
    vip: ['vip', 'partner'].filter(has),
    bots: has('bots') ? ['bots'] : [],
  };
  const existing = (keys = []) => keys.filter(has);

  // ── KANAŁY ────────────────────────────────────────────────────────
  const categories = new Map();
  const getCategory = (key, def = CATEGORIES[key]) => {
    if (!categories.has(key)) {
      categories.set(key, {
        key,
        label: tr(def.name, lang),
        emoji: def.emoji,
        profile: def.profile || 'public',
        access: def.access || [],
        channels: [],
      });
    }
    return categories.get(key);
  };
  const specialDef = preset.special ? { name: preset.special.name, emoji: preset.special.emoji } : CATEGORIES.special;
  const voiceParts = { lobbies: [], music: [], extras: [], stage: [], afk: [] };

  const resolveTags = (tags) => {
    if (!tags) return undefined;
    if (tags === 'listItems') {
      return items.slice(0, 20).map((item) => ({ name: N.truncateName(item, 20), moderated: false }));
    }
    return tags.slice(0, 20).map((t) => ({ name: N.truncateName(tr(t.name, lang), 20), emoji: t.emoji, moderated: Boolean(t.moderated) }));
  };

  const makeChannel = (def, overrides = {}) => {
    const kind = overrides.kind || def.kind || 'text';
    const rawName = overrides.name ?? tr(def.name, lang);
    const topicSource = overrides.topic !== undefined ? overrides.topic : def.topic;
    const slow = def.slowmode === 'chat' ? answers.channels.slowmode : def.slowmode || 0;
    return {
      key: overrides.key || def.key,
      kind,
      emoji: overrides.emoji || def.emoji,
      base: VOICE_KINDS.has(kind) ? N.cleanName(rawName, 90) : N.slugify(rawName),
      topic: topicSource ? N.truncateName(tr(topicSource, lang), kind === 'forum' ? 4000 : 1000) : null,
      profile: overrides.profile || def.profile || 'public',
      posters: existing(overrides.posters || def.posters),
      access: overrides.access || [],
      slowmode: VOICE_KINDS.has(kind) ? 0 : Math.min(21600, Math.max(0, Number(slow) || 0)),
      nsfw: Boolean(def.nsfw),
      userLimit: overrides.userLimit ?? def.userLimit ?? 0,
      tags: kind === 'forum' ? resolveTags(def.tags) : undefined,
      reaction: kind === 'forum' ? def.reaction : undefined,
      post: overrides.post !== undefined ? overrides.post : def.post,
    };
  };

  const place = (catKey, channel) => {
    if (catKey === 'voice') {
      voiceParts.extras.push(channel);
      return;
    }
    const def = catKey === 'special' ? specialDef : CATEGORIES[catKey];
    getCategory(catKey, def).channels.push(channel);
  };

  // Moduły
  for (const [moduleKey, mod] of Object.entries(MODULES)) {
    if (!modules.has(moduleKey)) continue;
    for (const def of mod.channels) {
      if (def.minSize && !sizeAtLeast(size, def.minSize)) continue;
      const channel = makeChannel(def);
      if (def.key === 'musicVoice') voiceParts.music.push(channel);
      else if (def.key === 'stage') voiceParts.stage.push(channel);
      else if (def.key === 'afk') voiceParts.afk.push(channel);
      else place(def.cat, channel);
    }
  }

  // Lobby głosowe
  if (modules.has('voice')) {
    const lobby = preset.voiceLobby || { name: L('Rozmowy', 'Lounge'), emoji: '🔊' };
    const count = Math.min(10, Math.max(0, Number(answers.channels.voiceCount) || 0));
    for (let i = 1; i <= count; i += 1) {
      const name = count > 1 ? `${tr(lobby.name, lang)} ${i}` : tr(lobby.name, lang);
      voiceParts.lobbies.push(makeChannel({ key: `lobby${i}`, kind: 'voice', emoji: lobby.emoji, name }));
    }
    const limited = {
      open: [],
      mixed: [['Duo', 2], ['Trio', 3], ['Squad', 4]],
      big: [['Duo', 2], ['Trio', 3], ['Squad', 4], [T('Drużyna 5', 'Team 5'), 5], [T('Drużyna 10', 'Team 10'), 10]],
    }[answers.channels.voiceLayout] || [];
    for (const [name, limit] of limited) {
      voiceParts.lobbies.push(makeChannel({ key: `limit${limit}`, kind: 'voice', emoji: '👥', name, userLimit: limit }));
    }
  }

  // Kanały specjalne presetu
  const selectedExtras = new Set(answers.special.extras || []);
  for (const def of preset.extras || []) {
    if (!selectedExtras.has(def.key)) continue;
    let overrides = {};
    if (def.access) {
      const access = existing(def.access);
      if (!access.length) {
        warnings.push(`Pominięto kanał „${tr(def.name, lang)}” – brak roli, która ma do niego dostęp.`);
        continue;
      }
      overrides = { profile: 'private', access };
    }
    place(def.cat || 'special', makeChannel(def, overrides));
  }

  // Elementy listy (gry / tryby / składy / działy…)
  const itemCategories = [];
  if (list && items.length) {
    const separate = answers.special.layout === 'separate';
    const itemChannels = (item, i) => {
      const out = [];
      const vars = { item };
      const privateAccess = privateItems && has(`item${i}`) ? { profile: 'private', access: [`item${i}`] } : {};
      const readonly = list.readonly ? { profile: 'readonly', posters: list.posters || [] } : {};
      if (specialOpts.has('text') || !(specialOpts.has('voice') || specialOpts.has('extra'))) {
        out.push(makeChannel({ key: `item${i}t`, emoji: list.emoji, name: item, topic: fill(tr(list.topic, lang), vars) }, { ...readonly, ...privateAccess }));
      }
      if (specialOpts.has('extra') && list.extra) {
        out.push(makeChannel({
          key: `item${i}x`, emoji: list.extra.emoji, name: `${item}-${tr(list.extra.suffix, lang)}`,
          topic: fill(tr(list.extra.topic, lang), vars),
        }, privateAccess));
      }
      if (specialOpts.has('voice')) {
        const prefix = list.voice?.prefix ? `${tr(list.voice.prefix, lang)} ` : '';
        out.push(makeChannel({ key: `item${i}v`, kind: 'voice', emoji: list.voice?.emoji || '🔊', name: `${prefix}${item}` }, privateAccess));
      }
      return out;
    };
    if (separate) {
      items.forEach((item, i) => {
        const cat = {
          key: `item:${i}`,
          label: N.cleanName(item, 80),
          emoji: list.categoryEmoji,
          profile: privateItems && has(`item${i}`) ? 'private' : 'public',
          access: privateItems && has(`item${i}`) ? [`item${i}`] : [],
          channels: itemChannels(item, i),
        };
        if (cat.channels.length) itemCategories.push(cat);
      });
    } else {
      const cat = { key: 'items', label: tr(list.category, lang), emoji: list.categoryEmoji, profile: 'public', access: [], channels: [] };
      items.forEach((item, i) => cat.channels.push(...itemChannels(item, i)));
      if (cat.channels.length) itemCategories.push(cat);
    }
  }

  // Własne kategorie
  const customCategories = [];
  (answers.customCategories || []).forEach((c, ci) => {
    const profile = { public: 'public', readonly: 'readonly', staff: 'staff', vip: 'vip' }[c.access] || 'public';
    const target = c.target && c.target !== 'new' && (CATEGORIES[c.target] || c.target === 'special') ? c.target : null;
    if (target) {
      // Kanały dokładane do istniejącej sekcji – dostęp „publiczny” = zalecane ustawienia tej sekcji.
      (c.text || []).forEach((name, i) => place(target, makeChannel({ key: `custom${ci}t${i}`, emoji: '💬', name }, { profile })));
      (c.voice || []).forEach((name, i) => place(target, makeChannel({ key: `custom${ci}v${i}`, kind: 'voice', emoji: '🔊', name }, { profile })));
      return;
    }
    const cat = { key: `custom${ci}`, label: N.cleanName(c.name, 80) || `Kategoria ${ci + 1}`, emoji: c.emoji || '📁', profile, access: [], channels: [] };
    (c.text || []).forEach((name, i) => cat.channels.push(makeChannel({ key: `custom${ci}t${i}`, emoji: '💬', name })));
    (c.voice || []).forEach((name, i) => cat.channels.push(makeChannel({ key: `custom${ci}v${i}`, kind: 'voice', emoji: '🔊', name })));
    if (cat.channels.length) customCategories.push(cat);
  });

  // Kategoria głosowa (kolejność: lobby → muzyka → dodatkowe → scena → AFK)
  const voiceChannels = [...voiceParts.lobbies, ...voiceParts.music, ...voiceParts.extras, ...voiceParts.stage, ...voiceParts.afk];
  if (voiceChannels.length) getCategory('voice').channels.push(...voiceChannels);

  // Mały serwer: ogłoszenia lądują w kategorii informacji
  const info = categories.get('info');
  const news = categories.get('news');
  if (news && (!info || size === 'small' || info.channels.length + news.channels.length <= 4)) {
    getCategory('info').channels.push(...news.channels);
    categories.delete('news');
  }

  // Kolejność kategorii
  const order = [...CATEGORY_ORDER];
  if (preset.specialPosition !== 'afterNews') {
    order.splice(order.indexOf('special'), 1);
    order.splice(order.indexOf('community') + 1, 0, 'special');
  }
  let orderedCategories = [];
  for (const key of order) {
    if (key === 'items') orderedCategories.push(...itemCategories);
    else if (key === 'custom') orderedCategories.push(...customCategories);
    else if (categories.has(key)) orderedCategories.push(categories.get(key));
  }
  orderedCategories = orderedCategories.filter((c) => c.channels.length);

  // Podział kategorii przekraczających limit 50 kanałów
  const splitCategories = [];
  for (const cat of orderedCategories) {
    if (cat.channels.length <= LIMITS.perCategory) { splitCategories.push(cat); continue; }
    for (let i = 0; i * LIMITS.perCategory < cat.channels.length; i += 1) {
      splitCategories.push({
        ...cat,
        key: i === 0 ? cat.key : `${cat.key}#${i + 1}`,
        label: i === 0 ? cat.label : `${cat.label} ${i + 1}`,
        channels: cat.channels.slice(i * LIMITS.perCategory, (i + 1) * LIMITS.perCategory),
      });
    }
  }

  // Nazwy, kolejność wyświetlania i uprawnienia.
  // Każdy kanał dostaje zalecane nadpisania wynikające z profilu; jeśli w kroku „Dostęp do kanałów”
  // zmieniono ustawienia sekcji, kanały tej sekcji dostają nadpisania z wybranej pary (kto widzi, kto pisze).
  const overwriteOpts = { gate, filesOff };
  const accessOverrides = answers.channelAccess || {};
  const finalCategories = splitCategories.map((cat) => {
    const section = sectionOfCategory(cat.key);
    const ov = section ? accessOverrides[section] : null;
    const ovView = ov && P.VIEW_OPTIONS[ov.view] ? ov.view : null;
    const ovWrite = ov && P.WRITE_OPTIONS[ov.write] ? ov.write : null;
    const overridden = Boolean(ovView || ovWrite);

    const baseCatOverwrites = P.profileOverwrites(cat.profile, g, { ...overwriteOpts, access: cat.access });
    let catOverwrites = baseCatOverwrites;
    if (overridden && cat.profile !== 'private') {
      const d = P.defaultAccess('public', cat.profile, gate);
      catOverwrites = P.accessOverwrites(ovView || d.view, ovWrite || d.write, g, { gate });
    }
    const display = [
      ...cat.channels.filter((c) => TEXT_KINDS.has(c.kind)),
      ...cat.channels.filter((c) => VOICE_KINDS.has(c.kind)),
    ];
    const channels = display.map((c, i) => {
      const pos = { first: i === 0, last: i === display.length - 1 };
      const name = VOICE_KINDS.has(c.kind)
        ? N.formatVoiceChannel(answers.style.channel, c.emoji, c.base, pos)
        : N.formatTextChannel(answers.style.channel, c.emoji, c.base, pos);
      const own = P.profileOverwrites(c.profile, g, { ...overwriteOpts, posters: c.posters, access: c.access });
      let overwrites = P.VISIBILITY_PROFILES.has(c.profile) ? P.mergeOverwrites(own) : P.mergeOverwrites(baseCatOverwrites, own);
      let access = { ...P.defaultAccess(c.profile, cat.profile, gate), custom: false };
      if (overridden && !P.isProtectedChannel(c.profile, gate)) {
        access = {
          view: ovView || access.view,
          // AFK i „cicha nauka” zawsze zostają bez mówienia – to ich jedyny sens.
          write: ['afk', 'quiet'].includes(c.profile) ? access.write : ovWrite || access.write,
          custom: true,
        };
        overwrites = P.accessOverwrites(access.view, access.write, g, { kind: c.kind, posters: c.posters, gate });
        if (c.profile === 'media' && filesOff) overwrites = P.mergeOverwrites(overwrites, [{ target: '@everyone', allow: ['AttachFiles', 'EmbedLinks'], deny: [] }]);
      }
      const out = { ...c, name, overwrites, access };
      delete out.base;
      return out;
    });
    return {
      key: cat.key,
      section,
      name: N.formatCategory(answers.style.category, cat.emoji, cat.label),
      overwrites: P.mergeOverwrites(catOverwrites),
      channels,
    };
  });

  const allChannels = finalCategories.flatMap((c) => c.channels);
  const channelKeys = new Set(allChannels.map((c) => c.key));
  const hasChannel = (key) => channelKeys.has(key);

  // ── WIADOMOŚCI ────────────────────────────────────────────────────
  const messages = [];
  for (const channel of allChannels) {
    if (!channel.post) continue;
    const panel = POST_PANEL[channel.post] || 'extras';
    if (!panels.has(panel)) continue;
    if (channel.post.startsWith('card:')) {
      const card = preset.cards?.[channel.post.slice(5)];
      if (!card || (card.needs && !String(answers.special.info?.[card.needs] ?? '').trim())) {
        warnings.push(`Kanał #${channel.name} będzie pusty – uzupełnij „dodatkowe informacje” w kroku „Kanały specjalne”, aby bot opublikował tam kartę.`);
        continue;
      }
    }
    messages.push({ channel: channel.key, kind: channel.post });
  }
  const texts = answers.texts || {};
  if (texts.announcement?.text?.trim()) {
    const target = ['announcements', 'changelog', 'general'].find(hasChannel);
    if (target) messages.push({ channel: target, kind: 'announcement' });
    else warnings.push('Pierwsze ogłoszenie nie zostanie opublikowane – brak kanału ogłoszeń i czatu ogólnego.');
  }
  if ((texts.customFaq || []).length && !hasChannel('faq')) {
    warnings.push('Masz własne pytania FAQ, ale sekcja „FAQ” jest wyłączona – włącz ją w kroku „Sekcje serwera”.');
  }
  if ((texts.customRules || []).length && !hasChannel('rules')) {
    warnings.push('Masz własne zasady, ale sekcja „Regulamin” jest wyłączona – włącz ją w kroku „Sekcje serwera”.');
  }

  // ── AUTOMOD ───────────────────────────────────────────────────────
  const automod = [];
  const alertChannel = ['logAutomod', 'staffReports', 'staffChat'].find(hasChannel) || null;
  const exemptRoles = P.unique([...roles.filter((r) => r.staff).map((r) => r.key), ...g.bots]).slice(0, 20);
  const blockMessage = N.truncateName(T(
    'Wiadomość zablokowana przez AutoMod serwera. Sprawdź regulamin.',
    'Message blocked by the server AutoMod. Please check the rules.',
  ), 150);
  const actions = (...extra) => [
    { type: 'block', message: blockMessage },
    ...(alertChannel ? [{ type: 'alert', channel: alertChannel }] : []),
    ...extra,
  ];
  const sel = new Set(answers.security.automod || []);
  if (sel.has('spam')) {
    automod.push({ key: 'spam', name: T('Kreator: blokada spamu', 'Builder: spam filter'), trigger: 'Spam', metadata: {}, actions: actions(), exemptRoles });
  }
  if (sel.has('mentions')) {
    const limit = { small: 6, medium: 5, large: 5, huge: 4 }[size];
    automod.push({
      key: 'mentions', name: T('Kreator: limit wzmianek', 'Builder: mention limit'), trigger: 'MentionSpam',
      metadata: { mentionTotalLimit: limit, mentionRaidProtectionEnabled: true },
      actions: actions({ type: 'timeout', seconds: 600 }), exemptRoles,
    });
  }
  const presets = [['presetProfanity', 'Profanity'], ['presetSexual', 'SexualContent'], ['presetSlurs', 'Slurs']]
    .filter(([key]) => sel.has(key)).map(([, preset]) => preset);
  if (presets.length) {
    automod.push({ key: 'presets', name: T('Kreator: filtr treści', 'Builder: content filter'), trigger: 'KeywordPreset', metadata: { presets }, actions: actions(), exemptRoles });
  }
  if (sel.has('polishProfanity')) {
    automod.push({ key: 'plProfanity', name: T('Kreator: polskie wulgaryzmy', 'Builder: Polish profanity'), trigger: 'Keyword', metadata: { keywordFilter: POLISH_PROFANITY }, actions: actions(), exemptRoles });
  }
  if (sel.has('scam')) {
    automod.push({
      key: 'scam', name: T('Kreator: oszustwa', 'Builder: scams'), trigger: 'Keyword', metadata: { keywordFilter: SCAM_KEYWORDS },
      actions: actions({ type: 'timeout', seconds: 3600 }), exemptRoles,
    });
  }
  if (sel.has('invites')) {
    automod.push({
      key: 'invites', name: T('Kreator: zaproszenia Discord', 'Builder: Discord invites'), trigger: 'Keyword',
      metadata: { regexPatterns: [INVITE_REGEX] }, actions: actions(), exemptRoles: P.unique([...exemptRoles, ...existing(['partner'])]).slice(0, 20),
    });
  }
  if (sel.has('profiles')) {
    // Nicki i opisy profilu: osoba z pasującym nickiem nie może pisać, dopóki go nie zmieni.
    automod.push({
      key: 'profiles', name: T('Kreator: nicki i profile', 'Builder: names and profiles'), trigger: 'MemberProfile', event: 'MemberUpdate',
      metadata: { keywordFilter: P.unique([...POLISH_PROFANITY, ...SCAM_KEYWORDS]).slice(0, 1000) },
      actions: [{ type: 'blockInteraction' }, ...(alertChannel ? [{ type: 'alert', channel: alertChannel }] : [])],
      exemptRoles,
    });
  }

  // ── ONBOARDING (natywne pytania Discorda przy wejściu – działa bez żadnego bota) ──
  const onboarding = buildOnboarding({
    answers, T, lang, list, items, privateItems, roles, has, allChannels, hasChannel, community, gate, warnings,
  });

  // ── USTAWIENIA SERWERA ────────────────────────────────────────────
  let verificationLevel = Math.min(4, Math.max(0, Number(answers.security.verificationLevel) || 0));
  let contentFilter = Math.min(2, Math.max(0, Number(answers.security.contentFilter) || 0));
  let communitySettings = null;
  if (community) {
    if (verificationLevel < 1) {
      verificationLevel = 1;
      warnings.push('Tryb Społeczności wymaga poziomu weryfikacji min. „Niski” – ustawiono „Niski”.');
    }
    if (contentFilter !== 2) {
      contentFilter = 2;
      warnings.push('Tryb Społeczności wymaga skanowania multimediów wszystkich członków – filtr ustawiono na „Wszyscy”.');
    }
    const updatesChannel = ['staffNews', 'staffChat', 'staffCmds', 'staffReports'].find(hasChannel) || null;
    const rulesChannel = hasChannel('rules') ? 'rules' : null;
    const description = (answers.basics.description || '').trim();
    const welcomeCandidates = gate
      ? [['verify', '✅', T('Zweryfikuj się', 'Verify yourself')], ['rules', '📜', T('Przeczytaj zasady', 'Read the rules')]]
      : [
        ['rules', '📜', T('Przeczytaj zasady', 'Read the rules')],
        ['roleinfo', '🎭', T('Poznaj role serwera', 'Learn the server roles')],
        ['general', '💬', T('Przywitaj się z nami', 'Say hi to everyone')],
        ['announcements', '📢', T('Bądź na bieżąco', 'Stay up to date')],
        ['introductions', '🙋', T('Przedstaw się', 'Introduce yourself')],
      ];
    communitySettings = {
      rulesChannel,
      updatesChannel,
      description: description ? N.truncateName(description, 120) : null,
      welcomeScreen: answers.content.community === 'full' ? {
        description: N.truncateName(description || T(`Witaj na ${answers.basics.name || 'naszym serwerze'}!`, `Welcome to ${answers.basics.name || 'our server'}!`), 140),
        channels: welcomeCandidates.filter(([key]) => hasChannel(key)).slice(0, 5).map(([channel, emoji, text]) => ({ channel, emoji, description: text })),
      } : null,
    };
    if (!rulesChannel || !updatesChannel) {
      errors.push('Tryb Społeczności wymaga kanału regulaminu i kanału dla moderatorów – włącz moduły „Regulamin” i „Strefa administracji” albo wyłącz tryb Społeczności.');
    }
  }

  const iconUrl = N.isValidUrl(answers.basics.iconUrl) ? answers.basics.iconUrl.trim() : null;
  const guild = {
    name: answers.basics.rename && answers.basics.name ? N.cleanName(answers.basics.name, 100) : null,
    iconUrl,
    verificationLevel,
    explicitContentFilter: contentFilter,
    defaultNotifications: answers.permissions.notifications === 'all' ? 0 : 1,
    systemChannel: ['welcome', 'general'].find(hasChannel) || null,
    suppressJoinReplies: hasChannel('welcome'),
    afkChannel: hasChannel('afk') ? 'afk' : null,
    afkTimeout: [60, 300, 900, 1800, 3600].includes(Number(answers.channels.afkTimeout)) ? Number(answers.channels.afkTimeout) : 300,
    locale: lang === 'en' ? 'en-US' : 'pl',
    community: communitySettings,
  };

  const embedColorKey = answers.content.embedColor;
  const embedColor = embedColorKey && embedColorKey !== 'palette' && EMBED_COLORS[embedColorKey]
    ? EMBED_COLORS[embedColorKey].color
    : palette.embed;

  // ── STATYSTYKI I WALIDACJA ────────────────────────────────────────
  const stats = {
    roles: roles.length,
    separators: roles.filter((r) => r.separator).length,
    categories: finalCategories.length,
    channels: allChannels.length,
    text: allChannels.filter((c) => TEXT_KINDS.has(c.kind)).length,
    voice: allChannels.filter((c) => VOICE_KINDS.has(c.kind)).length,
    forums: allChannels.filter((c) => c.kind === 'forum').length,
    messages: messages.length,
    automod: automod.length,
    hidden: allChannels.filter((c) => !['members', 'unverified'].includes(c.access.view)).length,
    readonly: allChannels.filter((c) => ['members', 'unverified'].includes(c.access.view) && c.access.write !== 'all').length,
    open: allChannels.filter((c) => ['members', 'unverified'].includes(c.access.view) && c.access.write === 'all').length,
    overwrites: finalCategories.reduce((n, c) => n + c.overwrites.length + c.channels.reduce((m, ch) => m + ch.overwrites.length, 0), 0),
  };
  const totalChannels = stats.categories + stats.channels;
  const wipe = answers.mode?.type === 'wipe';
  const existingChannels = wipe ? 0 : Number(env.existingChannels) || 0;
  const existingRoles = wipe ? 0 : Number(env.existingRoles) || 0;
  if (totalChannels + existingChannels > LIMITS.channels) {
    errors.push(`Za dużo kanałów: ${totalChannels} nowych + ${existingChannels} istniejących > limit Discorda ${LIMITS.channels}.`);
  }
  if (stats.roles + existingRoles > LIMITS.roles) {
    errors.push(`Za dużo ról: ${stats.roles} nowych + ${existingRoles} istniejących > limit Discorda ${LIMITS.roles}.`);
  }
  if (!stats.channels) errors.push('Serwer nie ma żadnych kanałów – wybierz przynajmniej jeden moduł.');
  if (gate) {
    const member = roles.find((r) => r.key === 'member')?.name || 'Członek';
    warnings.push(`Weryfikacja: nowe osoby widzą tylko regulamin i #weryfikacja, dopóki nie dostaną roli „${member}”. Kreator nie nadaje tej roli – właściciel serwera musi dodać własnego bota weryfikacyjnego, który ją nadaje.`);
    if (!wipe) warnings.push(`Obecni członkowie (poza Tobą i właścicielem) stracą dostęp do kanałów, dopóki nie dostaną roli „${member}”.`);
  }
  if (g.member.length && !gate) {
    warnings.push('Rola członka bez weryfikacji jest kosmetyczna – nadaj ją ręcznie albo botem „autorole”.');
  }

  const estimatedSeconds = Math.round(
    stats.roles * 0.5 + totalChannels * 0.9 + messages.length * 0.8 + automod.length * 0.6 + 6
    + (wipe ? (Number(env.existingChannels) || 0) * 0.6 + (Number(env.existingRoles) || 0) * 0.5 : 0),
  );

  return {
    version: 1,
    meta: {
      generatedAt: new Date().toISOString(),
      type: presetKey,
      typeLabel: preset.label,
      language: lang,
      size,
      age: String(answers.age),
      mode: wipe ? 'wipe' : 'append',
      gate,
      embedColor,
      typeEmoji: preset.emoji || '⭐',
      /** Nadawca wiadomości: 'server' = webhook z nazwą i ikoną serwera, 'bot' = sam bot. */
      sender: answers.content?.sender === 'bot' ? 'bot' : 'server',
      graphics: {
        banners: Boolean(answers.graphics?.banners),
        icon: Boolean(answers.graphics?.icon),
        emojiPack: Boolean(answers.graphics?.emojiPack),
      },
      leave: ['now', 'after'].includes(answers.mode?.leave) ? answers.mode.leave : 'no',
      guide: answers.mode?.guide !== false,
    },
    bots,
    onboarding,
    guild,
    everyone: gate ? [] : memberPerms,
    roles,
    categories: finalCategories,
    messages,
    automod,
    assign: {
      enabled: answers.mode?.assign !== false,
      owner: has('owner') ? 'owner' : null,
      invoker: ['coowner', 'admin', 'owner'].find(has) || null,
      member: has('member') ? 'member' : null,
      bot: has('bots') ? 'bots' : null,
    },
    stats,
    estimatedSeconds,
    warnings: [...new Set(warnings)],
    errors,
  };
}

/** Grupy pytań onboardingu (w tej kolejności). */
const ONBOARDING_GROUPS = {
  items: { emoji: '🎮', label: 'Elementy listy (gry, tryby, działy…)', title: null },
  notifications: { emoji: '🔔', label: 'Powiadomienia', title: L('Jakie powiadomienia chcesz dostawać?', 'Which notifications do you want?') },
  colors: { emoji: '🎨', label: 'Kolor nicku', title: L('Wybierz kolor swojego nicku', 'Pick your name color') },
  platform: { emoji: '🖥️', label: 'Platformy', title: L('Z jakich platform korzystasz?', 'Which platforms do you use?') },
  age: { emoji: '🎂', label: 'Wiek', title: L('Ile masz lat?', 'How old are you?') },
  pronouns: { emoji: '💬', label: 'Zaimki', title: L('Twoje zaimki', 'Your pronouns') },
  region: { emoji: '📍', label: 'Region', title: L('Skąd jesteś?', 'Where are you from?') },
  custom: { emoji: '🔹', label: 'Własne role dla członków', title: L('Co Cię opisuje?', 'What describes you?') },
};

/** Limity onboardingu Discorda (bezpieczne wartości). */
const ONBOARDING_LIMITS = { prompts: 8, options: 25, optionTitle: 50, promptTitle: 100, minDefault: 7, minWritable: 5 };

function buildOnboarding({ answers, T, lang, list, items, privateItems, roles, has, allChannels, hasChannel, community, gate, warnings }) {
  const ob = answers.onboarding || {};
  if (!ob.enabled) return null;
  const problems = [];
  if (!community) problems.push('wymaga trybu Społeczności');
  if (gate) problems.push('nie działa razem z sekcją „Weryfikacja” (nowe osoby muszą móc pisać na kanałach domyślnych)');
  if (problems.length) {
    warnings.push(`Onboarding pominięty – ${problems.join(' i ')}.`);
    return null;
  }
  const want = new Set(Array.isArray(ob.groups) && ob.groups.length ? ob.groups : Object.keys(ONBOARDING_GROUPS));
  const title = (text) => N.truncateName(text, ONBOARDING_LIMITS.optionTitle);
  const prompts = [];
  const optInChannels = new Set();

  // Elementy listy: wybór daje rolę elementu, a publiczne kanały elementu pojawiają się na liście kanałów.
  if (want.has('items') && list && items.length) {
    const options = items.slice(0, ONBOARDING_LIMITS.options).map((item, i) => {
      const channels = privateItems ? [] : [`item${i}t`, `item${i}x`, `item${i}v`].filter(hasChannel);
      return { title: title(N.cleanName(item, 80)), emoji: list.roleEmoji || list.emoji, roles: has(`item${i}`) ? [`item${i}`] : [], channels };
    }).filter((o) => o.roles.length || o.channels.length);
    if (options.length) {
      options.forEach((o) => o.channels.forEach((c) => optInChannels.add(c)));
      const cat = tr(list.category, lang);
      prompts.push({ key: 'items', title: N.truncateName(T(`${cat} – co Cię interesuje?`, `${cat} – what are you into?`), ONBOARDING_LIMITS.promptTitle), single: false, options });
    }
  }
  for (const [group, def] of Object.entries(ONBOARDING_GROUPS)) {
    if (group === 'items' || !want.has(group)) continue;
    const groupRoles = roles.filter((r) => r.self?.group === group);
    if (!groupRoles.length) continue;
    prompts.push({
      key: group,
      title: N.truncateName(tr(def.title, lang), ONBOARDING_LIMITS.promptTitle),
      single: groupRoles[0].self.mode === 'single',
      options: groupRoles.slice(0, ONBOARDING_LIMITS.options).map((r) => ({ title: title(r.label), emoji: r.emoji || null, roles: [r.key], channels: [] })),
    });
  }
  if (!prompts.length) {
    warnings.push('Onboarding pominięty – brak ról do wyboru (włącz np. kolory, powiadomienia albo role elementów listy w kroku „Role społeczności”).');
    return null;
  }
  const visible = (c) => ['members', 'unverified'].includes(c.access?.view);
  const defaults = allChannels.filter((c) => visible(c) && !optInChannels.has(c.key));
  const writable = defaults.filter((c) => ['text', 'forum'].includes(c.kind) && c.access.write === 'all');
  if (defaults.length < ONBOARDING_LIMITS.minDefault || writable.length < ONBOARDING_LIMITS.minWritable) {
    warnings.push(`Onboarding pominięty – Discord wymaga min. ${ONBOARDING_LIMITS.minDefault} kanałów widocznych dla wszystkich, w tym ${ONBOARDING_LIMITS.minWritable}, na których można pisać (jest ${defaults.length} i ${writable.length}). Dodaj kanały społeczności.`);
    return null;
  }
  const limited = prompts.slice(0, ONBOARDING_LIMITS.prompts);
  if (prompts.length > limited.length) warnings.push(`Onboarding: użyto ${limited.length} pierwszych pytań z ${prompts.length}.`);
  return {
    prompts: limited.map((p) => ({ ...p, required: Boolean(ob.required), dropdown: p.options.length > 8 })),
    defaultChannels: defaults.map((c) => c.key),
  };
}

module.exports = {
  buildBlueprint, sectionOfCategory, LIMITS, TEXT_KINDS, VOICE_KINDS, ONBOARDING_GROUPS, ONBOARDING_LIMITS,
};
