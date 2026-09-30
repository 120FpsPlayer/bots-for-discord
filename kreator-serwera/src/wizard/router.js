'use strict';

const { AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { STEPS, STEP_INDEX } = require('./steps');
const { buildBlueprint } = require('../builder/blueprint');
const { channelPages, rolePages, summaryFields } = require('./preview');
const {
  COLORS, cid, embed, field, button, row, selectRow, progressBar, modal, modalText, clip, ButtonStyle, formatDuration,
} = require('./ui');
const { loadProjectAttachment } = require('./project');
const { computeStats } = require('../cleanup/snapshot');
const { AttemptLimiter, maskCode, CODE_LENGTH } = require('../access/codes');
const { createLogger } = require('../utils/logger');

const log = createLogger('kreator');

/** Szybki kreator: tylko najważniejsze pytania, reszta z zalecanych ustawień. */
const QUICK_STEPS = ['type', 'basics', 'profile', 'modules'];
const FULL_STEPS = STEPS.map((st) => st.id);

/** Kolejność kroków w bieżącym trybie (szybki / pełny). */
function sequence(s) {
  return s.quick && QUICK_STEPS.includes(s.step) ? QUICK_STEPS : FULL_STEPS;
}

/**
 * Router kreatora: renderuje panel (intro → kroki → podsumowanie → podgląd → budowa)
 * i obsługuje wszystkie interakcje z customId zaczynającym się od „wz:”.
 */
function createWizard({ store, config, runBuild, codes = null }) {
  const footer = `Panel widzisz tylko Ty • sesja wygasa po ${config.sessionTimeoutMinutes} min bezczynności`;

  // ───────────── Ekrany ─────────────

  function introFrame(s) {
    const env = s.env;
    const checks = [
      `${env.botAdmin ? '✅' : '❌'} Bot ma uprawnienie **Administrator**`,
      `${env.botTop ? '✅' : '⚠️'} Rola bota ${env.botTop ? 'jest najwyżej na liście ról' : 'nie jest najwyżej – role nad nią nie zostaną zmienione ani usunięte'}`,
      `${env.existingChannels < 400 ? '✅' : '⚠️'} Kanały na serwerze: **${env.existingChannels}**/500`,
      `${env.existingRoles < 200 ? '✅' : '⚠️'} Role na serwerze: **${env.existingRoles}**/250`,
      env.code ? `🔑 Kod dostępu \`${env.code.masked}\` – pozostało budów: **${env.code.remaining}**/${env.code.uses}` : null,
    ].filter(Boolean);
    return {
      embeds: [embed({
        title: '👋 Witaj w Kreatorze Serwera!',
        color: COLORS.primary,
        description: [
          `Odpowiesz na **${STEPS.length} krótkich pytań**, a ja zbuduję dla Ciebie kompletny, profesjonalny serwer: **role z uprawnieniami, kategorie i kanały z ustawionym dostępem (kto widzi, kto pisze), regulamin, informacje, weryfikację, AutoMod i ustawienia bezpieczeństwa**.`,
          '',
          '**Jak to działa?**',
          '1️⃣ Wybierasz typ serwera – dostajesz mądre ustawienia startowe',
          '2️⃣ Dopracowujesz szczegóły: nazwy, wygląd, sekcje, role, kto widzi i kto pisze na kanałach…',
          '3️⃣ Sprawdzasz podsumowanie oraz podgląd kanałów i ról',
          '4️⃣ Klikasz **Zbuduj serwer** – resztę robię ja ⚡',
          '',
          '💡 Na każdym etapie możesz przejść do **podsumowania** – pozostałe odpowiedzi uzupełnię zalecanymi wartościami.',
          `⚡ **Szybki kreator** zada tylko ${QUICK_STEPS.length} najważniejsze pytania – resztę dobiorę sam.`,
          '📥 Masz zapisany projekt albo kopię zapasową z `/usun`? Wpisz `/stworz` i dołącz plik w opcji **projekt**.',
          '🧹 Chcesz zacząć od czystego serwera? Najpierw użyj **/usun** (z kopią zapasową).',
        ].join('\n'),
        fields: [field('🔎 Sprawdzenie gotowości', checks.join('\n'))],
        footer,
      })],
      components: [row(
        button(cid(s, 'n', 'start'), `Pełny kreator (${STEPS.length} kroków)`, { style: ButtonStyle.Primary, emoji: '🚀', disabled: !env.botAdmin }),
        button(cid(s, 'n', 'quick'), `Szybki kreator (${QUICK_STEPS.length} kroki)`, { style: ButtonStyle.Success, emoji: '⚡', disabled: !env.botAdmin }),
        button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
      )],
    };
  }

  function navRow(s, pos, total) {
    const last = pos === total - 1;
    return row(
      button(cid(s, 'n', 'back'), 'Wstecz', { emoji: '◀️' }),
      button(cid(s, 'n', 'next'), last ? 'Podsumowanie' : 'Dalej', { style: ButtonStyle.Primary, emoji: '▶️' }),
      button(cid(s, 'n', 'sum'), 'Podsumowanie', { style: ButtonStyle.Success, emoji: '⏭️', disabled: !s.typeChosen || last }),
      button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
    );
  }

  function stepFrame(s) {
    const step = STEPS[STEP_INDEX[s.step]];
    const seq = sequence(s);
    const pos = seq.indexOf(s.step);
    const view = step.render(s);
    const description = [
      s.flash ? `> ${s.flash}\n` : null,
      step.intro,
      view.lines?.length ? `\n${view.lines.join('\n')}` : null,
      `\n${progressBar(pos + 1, seq.length + 1)}`,
    ].filter(Boolean).join('\n');
    s.flash = null;
    return {
      embeds: [embed({
        title: `${step.emoji} ${seq === QUICK_STEPS ? '⚡ ' : ''}Krok ${pos + 1}/${seq.length} · ${step.title}`,
        description,
        fields: view.fields || [],
        color: COLORS.primary,
        footer,
      })],
      components: [...view.rows.slice(0, 4), navRow(s, pos, seq.length)],
    };
  }

  /** Informacja, ile użyć kodu zostanie po budowie. */
  function codeLine(s) {
    const c = s.env?.code;
    if (!c) return null;
    return `🔑 Budowa zużyje 1 użycie kodu \`${c.masked}\` (zostanie ${Math.max(0, c.remaining - 1)}/${c.uses}). Budowa, która nic nie utworzy albo zostanie cofnięta, odda użycie.`;
  }

  function computeBlueprint(s) {
    if (s.restore) return (s.blueprint = restoreBlueprint(s));
    s.blueprint = buildBlueprint(s.answers, { existingChannels: s.env.existingChannels, existingRoles: s.env.existingRoles });
    return s.blueprint;
  }

  // ───────────── Przywracanie kopii zapasowej (z /usun) ─────────────

  const RESTORE_OPTIONS = {
    identity: { emoji: '🏷️', label: 'Nazwa i ikona serwera', description: 'Przywróć nazwę i ikonę z kopii' },
    settings: { emoji: '⚙️', label: 'Ustawienia serwera', description: 'Weryfikacja, filtr, powiadomienia, kanał systemowy, AFK' },
    automod: { emoji: '🤖', label: 'Reguły AutoMod', description: 'Przywróć reguły automatycznej moderacji' },
    community: { emoji: '🌟', label: 'Tryb Społeczności', description: 'Włącz Społeczność z kanałem regulaminu z kopii' },
  };

  /** Blueprint z kopii z uwzględnieniem wybranych opcji i trybu (dodaj / wyczyść). */
  function restoreBlueprint(s) {
    const r = s.restore;
    const bp = JSON.parse(JSON.stringify(r.blueprint));
    const on = (k) => r.options.includes(k);
    bp.meta.mode = r.mode;
    if (!on('identity')) { bp.guild.name = null; bp.guild.iconUrl = null; }
    if (!on('settings')) {
      Object.assign(bp.guild, { verificationLevel: s.env.verificationLevel ?? 0, explicitContentFilter: s.env.explicitContentFilter ?? 0, defaultNotifications: s.env.defaultNotifications ?? 1, systemChannel: null, afkChannel: null });
    }
    if (!on('automod')) bp.automod = [];
    if (!on('community')) bp.guild.community = null;
    bp.stats = computeStats(bp);
    const errors = [];
    if (r.mode === 'append') {
      const channels = s.env.existingChannels + bp.stats.channels + bp.stats.categories;
      const roles = s.env.existingRoles + bp.stats.roles;
      if (channels > 500) errors.push(`Za dużo kanałów: ${s.env.existingChannels} na serwerze + ${bp.stats.channels + bp.stats.categories} z kopii > 500. Wybierz tryb „Wyczyść i przywróć” albo najpierw użyj /usun.`);
      if (roles > 250) errors.push(`Za dużo ról: ${s.env.existingRoles} na serwerze + ${bp.stats.roles} z kopii > 250. Wybierz tryb „Wyczyść i przywróć” albo najpierw użyj /usun.`);
    }
    bp.errors = errors;
    return bp;
  }

  function restoreFrame(s) {
    const r = s.restore;
    const bp = computeBlueprint(s);
    const st = bp.stats;
    const wipe = r.mode === 'wipe';
    const created = r.createdAt ? `<t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:f>` : 'nieznana data';
    const description = [
      s.flash ? `> ${s.flash}\n` : null,
      `Wczytano **kopię zapasową** serwera **${clip(r.guildName || bp.guild.name || 'bez nazwy', 80)}** z ${created}.`,
      'Odtworzę role (z uprawnieniami, kolorami i kolejnością), kategorie i kanały (z uprawnieniami, tematami i ustawieniami) oraz wybrane poniżej elementy.',
      bp.errors.length ? `\n${bp.errors.map((e) => `❌ ${e}`).join('\n')}` : null,
      codeLine(s),
    ].filter(Boolean).join('\n');
    s.flash = null;
    return {
      embeds: [embed({
        title: '♻️ Przywracanie kopii zapasowej',
        color: bp.errors.length ? COLORS.danger : wipe ? COLORS.warning : COLORS.success,
        description,
        fields: [
          field('📦 Zawartość kopii', [
            `🎭 **${st.roles}** ról`,
            `📁 **${st.categories}** kategorii • 💬 **${st.channels}** kanałów (# ${st.text - st.forums} • 🗂️ ${st.forums} • 🔊 ${st.voice})`,
            `🔑 **${st.overwrites}** nadpisań uprawnień`,
            `🤖 **${r.blueprint.automod.length}** reguł AutoMod`,
          ].join('\n'), true),
          field('🧭 Tryb', wipe
            ? '🧨 **Wyczyść i przywróć** – najpierw usunę obecne kanały, role i AutoMod, potem odtworzę kopię.'
            : '➕ **Dodaj** – kopia zostanie dodana obok tego, co już jest na serwerze.', true),
          field('✅ Przywrócę też', Object.entries(RESTORE_OPTIONS).map(([k, o]) => `${r.options.includes(k) ? '✅' : '❌'} ${o.label}`).join('\n'), true),
          field('ℹ️ Czego nie ma w kopii', 'Wiadomości, członków, emoji, naklejek, banów i zaproszeń – Discord nie pozwala ich odtworzyć. Role botów dodadzą się same po ponownym zaproszeniu botów.'),
        ],
        footer,
      })],
      components: [
        selectRow(cid(s, 'r', 'mode'), {
          placeholder: '🧭 Tryb przywracania',
          options: [
            { value: 'append', label: 'Dodaj do obecnego serwera', description: 'Nic nie usuwam – kopia pojawi się obok obecnych kanałów', emoji: '➕', default: !wipe },
            { value: 'wipe', label: 'Wyczyść i przywróć (tylko właściciel)', description: 'Usuwam obecne kanały i role, potem odtwarzam kopię', emoji: '🧨', default: wipe },
          ],
        }),
        selectRow(cid(s, 'r', 'opts'), {
          placeholder: '✅ Co jeszcze przywrócić?',
          min: 0,
          max: Object.keys(RESTORE_OPTIONS).length,
          options: Object.entries(RESTORE_OPTIONS).map(([k, o]) => ({ value: k, label: o.label, description: o.description, emoji: o.emoji, default: r.options.includes(k) })),
        }),
        row(
          button(cid(s, 'n', 'build'), wipe ? 'Wyczyść i przywróć' : 'Przywróć kopię', { style: wipe ? ButtonStyle.Danger : ButtonStyle.Success, emoji: '♻️', disabled: bp.errors.length > 0 || !s.env.botAdmin }),
          button(cid(s, 'n', 'pvc'), 'Kanały', { emoji: '📁' }),
          button(cid(s, 'n', 'pvr'), 'Role', { emoji: '🎭' }),
          button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
        ),
      ],
    };
  }

  function handleRestore(s, interaction, id) {
    if (!s.restore) return interaction.update(render(s));
    if (id === 'mode') {
      const mode = interaction.values[0] === 'wipe' ? 'wipe' : 'append';
      if (mode === 'wipe' && interaction.guild.ownerId !== interaction.user.id) {
        s.flash = '🔒 Tryb „Wyczyść i przywróć” jest dostępny tylko dla właściciela serwera.';
      } else {
        s.restore.mode = mode;
        s.answers.mode.type = mode;
      }
    } else if (id === 'opts') {
      s.restore.options = interaction.values.filter((v) => RESTORE_OPTIONS[v]);
    }
    return interaction.update(render(s));
  }

  function summaryFrame(s) {
    const bp = computeBlueprint(s);
    const description = [
      s.flash ? `> ${s.flash}\n` : null,
      bp.errors.length
        ? '❌ **Popraw zaznaczone problemy, aby móc zbudować serwer.**'
        : '✅ **Wszystko gotowe!** Sprawdź podsumowanie, obejrzyj podgląd kanałów i ról, a potem kliknij **Zbuduj serwer**.',
      codeLine(s),
      `\n${progressBar(STEPS.length + 1, STEPS.length + 1)}`,
    ].filter(Boolean).join('\n');
    s.flash = null;
    return {
      embeds: [embed({
        title: '📋 Podsumowanie – sprawdź, zanim zbuduję',
        description,
        fields: summaryFields(s, bp),
        color: bp.errors.length ? COLORS.danger : COLORS.success,
        footer,
      })],
      components: [
        row(
          button(cid(s, 'n', 'build'), s.answers.mode.type === 'wipe' ? 'Wyczyść i zbuduj' : 'Zbuduj serwer', {
            style: s.answers.mode.type === 'wipe' ? ButtonStyle.Danger : ButtonStyle.Success, emoji: '🏗️', disabled: bp.errors.length > 0,
          }),
          button(cid(s, 'n', 'pvc'), 'Kanały', { emoji: '📁' }),
          button(cid(s, 'n', 'pvr'), 'Role', { emoji: '🎭' }),
          button(cid(s, 'n', 'export'), 'Zapisz projekt', { emoji: '💾' }),
        ),
        selectRow(cid(s, 's', 'goto'), {
          placeholder: '✏️ Zmień odpowiedź w kroku…',
          options: STEPS.map((st, i) => ({ value: st.id, label: `${i + 1}. ${st.title}`, emoji: st.emoji })),
        }),
        row(
          button(cid(s, 'n', 'back'), 'Wstecz', { emoji: '◀️' }),
          button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
        ),
      ],
    };
  }

  function previewFrame(s) {
    const bp = s.blueprint || computeBlueprint(s);
    const pages = s.view.kind === 'roles' ? rolePages(bp) : channelPages(bp);
    const page = Math.min(Math.max(0, s.view.page), pages.length - 1);
    s.view.page = page;
    const title = s.view.kind === 'roles'
      ? `🎭 Podgląd ról – ${bp.stats.roles} (od najwyższej)`
      : `📁 Podgląd struktury – ${bp.stats.categories} kategorii, ${bp.stats.channels} kanałów`;
    return {
      embeds: [embed({
        title,
        description: pages[page],
        color: COLORS.neutral,
        footer: s.view.kind === 'roles' ? `Strona ${page + 1}/${pages.length}` : `Strona ${page + 1}/${pages.length} • bez opisu = widzą i piszą wszyscy członkowie • 📨 = wiadomość bota • ✏️ = zmienione przez Ciebie`,
      })],
      components: [row(
        button(cid(s, 'n', 'pprev'), 'Poprzednia', { emoji: '⬅️', disabled: page === 0 }),
        button(cid(s, 'n', 'pnext'), 'Następna', { emoji: '➡️', disabled: page >= pages.length - 1 }),
        button(cid(s, 'n', s.view.kind === 'roles' ? 'pvc' : 'pvr'), s.view.kind === 'roles' ? 'Kanały' : 'Role', { emoji: s.view.kind === 'roles' ? '📁' : '🎭' }),
        button(cid(s, 'n', 'ret'), 'Wróć do podsumowania', { style: ButtonStyle.Primary, emoji: '↩️' }),
      )],
    };
  }

  function render(s) {
    if (s.view) return previewFrame(s);
    if (s.restore) return restoreFrame(s);
    if (s.step === 'intro') return introFrame(s);
    if (s.step === 'summary') return summaryFrame(s);
    return stepFrame(s);
  }

  function endedFrame(title, description, color = COLORS.neutral) {
    return { embeds: [embed({ title, description, color })], components: [] };
  }

  // ───────────── Kod dostępu ─────────────

  const gated = () => Boolean(config.requireCode && codes);
  const limiter = new AttemptLimiter();
  /** Plik projektu z /stworz czekający, aż ktoś wpisze kod: `${guildId}:${userId}` → { attachment, at }. */
  const pendingFiles = new Map();
  const PENDING_TTL_MS = 15 * 60_000;
  const CODE_DB_ERROR = 'Baza kodów jest chwilowo niedostępna – skontaktuj się ze sprzedawcą.';

  /** Aktywny kod serwera ({ code, remaining, uses }), null gdy brak, albo { error } przy problemie z plikiem kodów. */
  function grantOf(guildId) {
    try {
      return codes.grantFor(guildId);
    } catch (err) {
      log.error(err.message);
      return { error: CODE_DB_ERROR };
    }
  }

  function codeFrame({ error, left, blockedMinutes } = {}) {
    const lines = [
      'Kreator Serwera działa na **kod dostępu** – dostajesz go od sprzedawcy razem z zakupem serwera.',
      '',
      '1️⃣ Kliknij **Wpisz kod** poniżej',
      `2️⃣ Wklej kod (${CODE_LENGTH} znaków, np. \`ABCDE-FGHJK-LMNPQ-RSTUV\`)`,
      '3️⃣ Gotowe – otworzy się kreator serwera',
      '',
      '🔒 Kod przypisze się do tego serwera. Jedno użycie kodu = jedna budowa serwera – budowa, która nic nie utworzy albo zostanie cofnięta, oddaje użycie.',
    ];
    if (error) lines.unshift(`> ❌ ${error}${left !== undefined && left <= 3 ? ` Pozostałe próby: **${left}**.` : ''}\n`);
    if (blockedMinutes) lines.unshift(`> ⏳ Za dużo błędnych prób – spróbuj ponownie za **${blockedMinutes} min**.\n`);
    return {
      embeds: [embed({
        title: '🔑 Wymagany kod dostępu',
        description: lines.join('\n'),
        color: error || blockedMinutes ? COLORS.danger : COLORS.primary,
        footer: 'Nie masz kodu? Skontaktuj się ze sprzedawcą serwera.',
      })],
      components: [row(
        button('wzk:enter', 'Wpisz kod', { style: ButtonStyle.Primary, emoji: '🔑', disabled: Boolean(blockedMinutes) }),
        button('wzk:cancel', 'Anuluj', { emoji: '✖️' }),
      )],
    };
  }

  /** Sprawdza kod wpisany przez kupującego (z limitem błędnych prób). */
  function tryRedeem(interaction, typed) {
    const { guild, user } = interaction;
    const blockedMinutes = limiter.blockedFor(user.id);
    if (blockedMinutes) return { ok: false, frame: codeFrame({ blockedMinutes }) };
    let res;
    try {
      res = codes.redeem(typed, { guildId: guild.id, guildName: guild.name, userId: user.id });
    } catch (err) {
      log.error(err.message);
      return { ok: false, frame: codeFrame({ error: CODE_DB_ERROR }) };
    }
    if (!res.ok) {
      // Zły format niczego nie zdradza – nie liczymy go jako próby zgadnięcia.
      const left = res.reason === 'format' ? undefined : limiter.fail(user.id);
      log.warn(`🔑 Nieudana próba kodu na ${guild.name} (${guild.id}) – ${user.tag}: ${res.reason}`);
      return { ok: false, frame: left === 0 ? codeFrame({ blockedMinutes: limiter.blockedFor(user.id) }) : codeFrame({ error: res.error, left }) };
    }
    limiter.reset(user.id);
    log.info(`🔑 Kod ${maskCode(res.code)} przypisany do ${guild.name} (${guild.id}) przez ${user.tag} – pozostało budów: ${res.remaining}/${res.uses}`);
    return { ok: true, res };
  }

  function takePending(key) {
    const pending = pendingFiles.get(key);
    pendingFiles.delete(key);
    for (const [k, v] of pendingFiles) if (Date.now() - v.at > PENDING_TTL_MS) pendingFiles.delete(k);
    return pending && Date.now() - pending.at <= PENDING_TTL_MS ? pending.attachment : null;
  }

  /** Obsługa przycisków i formularza kodu: wzk:enter / wzk:cancel / wzk:submit. */
  async function handleCode(interaction) {
    const action = interaction.customId.split(':')[1];
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if (action === 'cancel') {
      pendingFiles.delete(key);
      return interaction.update(endedFrame('✖️ Anulowano', 'Użyj **/stworz**, kiedy będziesz mieć kod dostępu.'));
    }
    const problem = accessProblem(interaction);
    if (problem) return interaction.reply({ ...problem, flags: MessageFlags.Ephemeral });
    if (!gated()) return open(interaction, { attachment: takePending(key), respond: interaction.isModalSubmit?.() && !interaction.isFromMessage() ? 'reply' : 'update' });

    if (action === 'enter') {
      const blockedMinutes = limiter.blockedFor(interaction.user.id);
      if (blockedMinutes) return interaction.update(codeFrame({ blockedMinutes }));
      return interaction.showModal(modal('wzk:submit', 'Kod dostępu', [{
        id: 'code',
        label: 'Kod dostępu',
        description: `${CODE_LENGTH} znaków – myślniki, spacje i wielkość liter nie mają znaczenia`,
        style: 'short',
        required: true,
        min: CODE_LENGTH,
        max: 40,
        placeholder: 'ABCDE-FGHJK-LMNPQ-RSTUV',
      }]));
    }
    if (action === 'submit') {
      const respond = interaction.isFromMessage() ? 'update' : 'reply';
      const grant = grantOf(interaction.guildId);
      if (grant?.error) return interaction[respond]({ ...codeFrame({ error: grant.error }), ...(respond === 'reply' ? { flags: MessageFlags.Ephemeral } : {}) });
      // Kod mógł już zostać przypisany do serwera (np. przez innego administratora) – wtedy nie pytamy drugi raz.
      if (!grant) {
        const r = tryRedeem(interaction, modalText(interaction, 'code'));
        if (!r.ok) return interaction[respond]({ ...r.frame, ...(respond === 'reply' ? { flags: MessageFlags.Ephemeral } : {}) });
      }
      return open(interaction, { attachment: takePending(key), respond });
    }
    return undefined;
  }

  // ───────────── Start (/stworz) ─────────────

  /** Czy ta osoba może teraz otworzyć kreator? Zwraca ramkę z powodem odmowy albo null. */
  function accessProblem(interaction) {
    const { guild, member } = interaction;
    const isOwner = guild.ownerId === interaction.user.id;
    const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (config.ownerOnly ? !isOwner : !(isOwner || isAdmin)) {
      return { embeds: [embed({ title: '🔒 Brak uprawnień', description: config.ownerOnly ? 'Kreatora może używać tylko **właściciel serwera**.' : 'Kreatora mogą używać tylko osoby z uprawnieniem **Administrator**.', color: COLORS.danger })] };
    }
    const existing = store.get(guild.id);
    if (existing?.building) {
      return { embeds: [embed({ title: '🏗️ Trwa budowanie', description: `Na tym serwerze właśnie trwa budowa uruchomiona przez <@${existing.userId}>. Poczekaj, aż się zakończy.`, color: COLORS.warning })] };
    }
    const busy = store.lockedBy(guild.id);
    if (busy) {
      return { embeds: [embed({ title: '⏳ Serwer jest zajęty', description: `Na tym serwerze trwa teraz: **${busy}**. Poczekaj, aż się zakończy, i użyj /stworz ponownie.`, color: COLORS.warning })] };
    }
    if (existing && existing.userId !== interaction.user.id && !isOwner) {
      const minutes = Math.max(1, Math.ceil((store.timeoutMs - (Date.now() - existing.updatedAt)) / 60_000));
      return { embeds: [embed({ title: '⏳ Kreator jest zajęty', description: `Kreator jest otwarty przez <@${existing.userId}>. Sesja wygaśnie po ok. ${minutes} min bezczynności.\n*Właściciel serwera może przejąć kreator, uruchamiając /stworz.*`, color: COLORS.warning })] };
    }
    return null;
  }

  async function start(interaction) {
    const problem = accessProblem(interaction);
    if (problem) return interaction.reply({ ...problem, flags: MessageFlags.Ephemeral });
    const attachment = interaction.options?.getAttachment?.('projekt') || null;

    if (gated()) {
      const grant = grantOf(interaction.guildId);
      if (grant?.error) return interaction.reply({ ...codeFrame({ error: grant.error }), flags: MessageFlags.Ephemeral });
      if (!grant) {
        const typed = interaction.options?.getString?.('kod');
        const key = `${interaction.guildId}:${interaction.user.id}`;
        if (attachment) pendingFiles.set(key, { attachment, at: Date.now() });
        else pendingFiles.delete(key);
        if (!typed) return interaction.reply({ ...codeFrame(), flags: MessageFlags.Ephemeral });
        const r = tryRedeem(interaction, typed);
        if (!r.ok) return interaction.reply({ ...r.frame, flags: MessageFlags.Ephemeral });
        pendingFiles.delete(key);
      }
    }
    return open(interaction, { attachment, respond: 'reply' });
  }

  /**
   * Otwiera kreator (albo wczytany projekt / kopię zapasową).
   * respond: 'reply' – nowa wiadomość (komenda), 'update' – podmiana wiadomości z ekranem kodu.
   */
  async function open(interaction, { attachment = null, respond = 'reply' } = {}) {
    const { guild } = interaction;
    const isOwner = guild.ownerId === interaction.user.id;
    const send = (payload) => (respond === 'update' ? interaction.update(payload) : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }));
    const me = guild.members.me ?? await guild.members.fetchMe();
    const highest = guild.roles.cache.reduce((max, r) => (r.position > max ? r.position : max), 0);
    const grant = gated() ? grantOf(guild.id) : null;
    const env = {
      guildName: guild.name,
      ownerId: guild.ownerId,
      isOwner,
      botAdmin: me.permissions.has(PermissionFlagsBits.Administrator),
      botTop: me.roles.highest.position >= highest,
      existingChannels: guild.channels.cache.filter((c) => !c.isThread()).size,
      existingRoles: guild.roles.cache.size,
      originChannelId: interaction.channelId,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultNotifications: guild.defaultMessageNotifications,
      code: grant && !grant.error ? { masked: maskCode(grant.code), remaining: grant.remaining, uses: grant.uses } : null,
    };
    // /stworz projekt:<plik.json> – wczytanie zapisanego projektu i przejście od razu do podsumowania.
    let imported = null;
    if (attachment) {
      if (respond === 'update') await interaction.deferUpdate();
      else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        imported = await loadProjectAttachment(attachment);
      } catch (err) {
        return interaction.editReply({
          embeds: [embed({ title: '📥 Nie udało się wczytać pliku', description: `${err.message}\n\nUżyj pliku z przycisku **Zapisz projekt** w podsumowaniu kreatora albo kopii zapasowej z komendy **/usun**.`, color: COLORS.danger })],
          components: [],
        });
      }
    }

    const session = store.create(guild.id, interaction.user.id, env);
    log.info(`Nowa sesja ${session.id} na serwerze ${guild.name} (${guild.id}) – ${interaction.user.tag}${imported ? ` (wczytany plik: ${imported.kind})` : ''}`);

    if (imported?.kind === 'backup') {
      session.restore = { blueprint: imported.blueprint, guildName: imported.guildName, createdAt: imported.createdAt, mode: 'append', options: ['identity', 'settings', 'automod', 'community'] };
      session.answers.mode.type = 'append';
      session.typeChosen = true;
      session.step = 'summary';
      if (!env.botAdmin) session.flash = '❌ Bot nie ma uprawnienia Administrator – nadaj je przed przywracaniem.';
      else if (!isOwner) session.flash = 'ℹ️ Tryb „Wyczyść i przywróć” może wybrać tylko właściciel serwera.';
      return interaction.editReply(render(session));
    }

    if (imported) {
      imported = imported.answers;
      session.answers = imported;
      session.typeChosen = true;
      session.step = 'summary';
      session.flash = `📥 Wczytano projekt **${imported.basics.name || 'bez nazwy'}** – sprawdź podsumowanie. Tryb budowy ustawiono na „dodaj” (czyszczenie wybierzesz ręcznie w kroku „Tryb budowy”).`;
      if (!env.botAdmin) session.flash += '\n❌ Bot nie ma uprawnienia Administrator – nadaj je przed budową.';
      return interaction.editReply(render(session));
    }

    const frame = introFrame(session);
    if (!env.botAdmin) {
      frame.embeds[0].addFields(field('❌ Bot potrzebuje uprawnienia Administrator', 'Bez niego nie mogę tworzyć ról z uprawnieniami ani ustawiać nadpisań kanałów.\n**Jak naprawić:** Ustawienia serwera → Role → rola bota → włącz **Administrator** (albo zaproś bota ponownie linkiem z konsoli, który zawiera `permissions=8`).'));
    }
    return send(frame);
  }

  // ───────────── Obsługa interakcji ─────────────

  async function handle(interaction) {
    const [, sid, kind, id, arg] = interaction.customId.split(':');
    const session = store.get(interaction.guildId);

    if (!session || session.id !== sid) {
      const frame = endedFrame('⏱️ Sesja wygasła', 'Ta sesja kreatora wygasła lub została zastąpiona nową. Użyj **/stworz**, aby zacząć od nowa.');
      if (interaction.isModalSubmit() && !interaction.isFromMessage()) return interaction.reply({ ...frame, flags: MessageFlags.Ephemeral });
      return interaction.update(frame).catch(() => interaction.reply({ ...frame, flags: MessageFlags.Ephemeral }));
    }
    if (session.userId !== interaction.user.id) {
      return interaction.reply({ content: '🔒 Ten panel należy do innej osoby.', flags: MessageFlags.Ephemeral });
    }
    if (session.building) {
      if (kind === 'n' && id === 'abort') {
        session.abort = true;
        return interaction.reply({ content: '⛔ Przerywam budowę po bieżącej operacji…', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: '🏗️ Trwa budowanie serwera – poczekaj na zakończenie.', flags: MessageFlags.Ephemeral });
    }
    store.touch(session);

    const step = STEPS[STEP_INDEX[session.step]];

    // Menu wyboru
    if (kind === 's') {
      if (id === 'goto' && session.step === 'summary') {
        if (STEP_INDEX[interaction.values[0]] !== undefined) session.step = interaction.values[0];
      } else {
        const handler = step?.select?.[id];
        if (handler) handler(session, interaction.values);
      }
      return interaction.update(render(session));
    }

    // Przyciski kroku
    if (kind === 'b') {
      const handler = step?.button?.[id];
      const result = handler ? handler(session, interaction) : null;
      if (result?.modal) return interaction.showModal(result.modal);
      return interaction.update(render(session));
    }

    // Formularze (modale)
    if (kind === 'm') {
      if (id === 'wipe') return handleWipeConfirm(session, interaction);
      const handler = step?.modal?.[id];
      if (handler) handler(session, interaction);
      if (interaction.isFromMessage()) return interaction.update(render(session));
      return interaction.reply({ ...render(session), flags: MessageFlags.Ephemeral });
    }

    // Przywracanie kopii zapasowej
    if (kind === 'r') return handleRestore(session, interaction, id);

    // Nawigacja
    if (kind === 'n') return handleNav(session, interaction, id, arg);
    return undefined;
  }

  async function handleNav(s, interaction, id) {
    const seq = sequence(s);
    const pos = seq.indexOf(s.step);
    switch (id) {
      case 'start':
      case 'quick':
        s.quick = id === 'quick';
        s.step = STEPS[0].id;
        break;
      case 'next': {
        const error = STEPS[STEP_INDEX[s.step]]?.validate?.(s);
        if (error) { s.flash = `⚠️ ${error}`; break; }
        s.step = pos >= seq.length - 1 ? 'summary' : seq[pos + 1];
        break;
      }
      case 'back':
        if (s.step === 'summary') s.step = s.quick ? QUICK_STEPS[QUICK_STEPS.length - 1] : FULL_STEPS[FULL_STEPS.length - 1];
        else if (pos === 0) s.step = 'intro';
        else if (pos > 0) s.step = seq[pos - 1];
        break;
      case 'sum':
        if (!s.typeChosen) { s.flash = '⚠️ Najpierw wybierz typ serwera.'; break; }
        s.step = 'summary';
        break;
      case 'pvc':
        s.view = { kind: 'channels', page: s.view?.kind === 'channels' ? s.view.page : 0 };
        break;
      case 'pvr':
        s.view = { kind: 'roles', page: s.view?.kind === 'roles' ? s.view.page : 0 };
        break;
      case 'pprev':
        if (s.view) s.view.page -= 1;
        break;
      case 'pnext':
        if (s.view) s.view.page += 1;
        break;
      case 'ret':
        s.view = null;
        s.step = 'summary';
        break;
      case 'export':
        return exportBlueprint(s, interaction);
      case 'build':
        return startBuild(s, interaction);
      case 'cancel':
        store.delete(s.guildId);
        return interaction.update(endedFrame('✖️ Kreator anulowany', 'Nic nie zostało zmienione. Użyj **/stworz**, kiedy będziesz gotowy.'));
      default:
        break;
    }
    return interaction.update(render(s));
  }

  async function exportBlueprint(s, interaction) {
    const bp = s.blueprint || computeBlueprint(s);
    const json = JSON.stringify({ answers: s.answers, blueprint: bp }, null, 2);
    const file = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: `kreator-${interaction.guildId}.json` });
    return interaction.reply({
      content: '📄 **Projekt serwera zapisany** – plik zawiera Twoje odpowiedzi i pełny plan (role, kanały, uprawnienia).\n📥 Aby go wczytać później (także na innym serwerze), wpisz `/stworz` i dołącz ten plik w opcji **projekt**.',
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function startBuild(s, interaction) {
    const busy = store.lockedBy(s.guildId);
    if (busy) {
      s.flash = `⏳ Na serwerze trwa teraz: ${busy}. Poczekaj, aż się zakończy.`;
      return interaction.update(render(s));
    }
    if (gated()) {
      const grant = grantOf(s.guildId);
      if (!grant || grant.error) {
        s.flash = grant?.error
          ? `🔑 ${grant.error}`
          : '🔑 Kod dostępu tego serwera jest już nieaktywny (wykorzystany lub anulowany). Kliknij **Zapisz projekt**, a potem użyj `/stworz` z nowym kodem i dołącz plik projektu – nic nie stracisz.';
        return interaction.update(render(s));
      }
      s.env.code = { masked: maskCode(grant.code), remaining: grant.remaining, uses: grant.uses };
    }
    const bp = computeBlueprint(s);
    if (bp.errors.length) {
      s.flash = '❌ Najpierw popraw problemy wymienione w podsumowaniu.';
      return interaction.update(render(s));
    }
    if (s.answers.mode.type === 'wipe') {
      if (interaction.guild.ownerId !== interaction.user.id) {
        s.flash = '🔒 Tryb czyszczenia jest dostępny tylko dla właściciela serwera.';
        s.answers.mode.type = 'append';
        return interaction.update(render(s));
      }
      return interaction.showModal(modal(cid(s, 'm', 'wipe'), 'Potwierdź wyczyszczenie serwera', [{
        id: 'confirm',
        label: 'Wpisz nazwę serwera, aby potwierdzić',
        description: clip(`Wszystkie kanały i role zostaną usunięte. Wpisz: ${interaction.guild.name}`, 100),
        style: 'short',
        required: true,
        max: 100,
        placeholder: clip(interaction.guild.name, 100),
      }]));
    }
    return launch(s, interaction);
  }

  async function handleWipeConfirm(s, interaction) {
    const typed = modalText(interaction, 'confirm').toLocaleLowerCase('pl');
    if (typed !== interaction.guild.name.trim().toLocaleLowerCase('pl')) {
      s.flash = '❌ Nazwa serwera się nie zgadza – czyszczenie anulowane. Nic nie zostało usunięte.';
      if (interaction.isFromMessage()) return interaction.update(render(s));
      return interaction.reply({ ...render(s), flags: MessageFlags.Ephemeral });
    }
    return launch(s, interaction);
  }

  async function launch(s, interaction) {
    // Kod dostępu: jedno użycie schodzi w chwili startu budowy (dwie budowy naraz nie przejdą na jednym kodzie).
    let ticket = null;
    if (gated()) {
      let res;
      try {
        res = codes.consume(s.guildId, { guildName: interaction.guild.name, userId: interaction.user.id, kind: s.restore ? 'przywrócenie kopii' : 'budowa' });
      } catch (err) {
        log.error(err.message);
        res = { ok: false, error: CODE_DB_ERROR };
      }
      if (!res.ok) {
        s.flash = `🔑 ${res.error}`;
        return interaction.update(render(s));
      }
      ticket = res;
      log.info(`🔑 Kod ${maskCode(res.code)}: start budowy na ${interaction.guild.name} (${s.guildId}) – pozostało ${res.remaining}/${res.uses}`);
    }
    s.ticket = ticket;
    s.building = true;
    s.abort = false;
    s.view = null;
    const bp = s.blueprint;
    let result = null;
    try {
      await interaction.update({
        embeds: [embed({ title: '🏗️ Przygotowuję budowę…', description: `${progressBar(0, 1)}\n⏱️ Szacowany czas: ~${formatDuration(bp.estimatedSeconds)}`, color: COLORS.build })],
        components: [],
      });
      result = await runBuild({ session: s, blueprint: bp, interaction });
    } catch (err) {
      log.error('Budowa zakończona błędem:', err);
    } finally {
      s.building = false;
      store.delete(s.guildId);
      // Budowa, która nic nie utworzyła (błąd, przerwanie na starcie), oddaje użycie kodu.
      // Jeśli coś powstało, użycie wraca dopiero po „Cofnij budowę”.
      const createdAnything = result?.ids && Object.values(result.ids).some((list) => list.length);
      if (ticket && !createdAnything) {
        try {
          if (codes.refund(ticket)) log.info(`🔑 Kod ${maskCode(ticket.code)}: budowa nic nie utworzyła – użycie zwrócone.`);
        } catch (err) {
          log.error(err.message);
        }
      }
    }
    return result;
  }

  return { start, handle, handleCode, render };
}

module.exports = { createWizard };
