'use strict';

const { AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { STEPS, STEP_INDEX } = require('./steps');
const { buildBlueprint } = require('../builder/blueprint');
const { channelPages, rolePages, summaryFields } = require('./preview');
const {
  COLORS, cid, embed, field, button, row, selectRow, progressBar, modal, modalText, clip, ButtonStyle, formatDuration,
} = require('./ui');
const { createLogger } = require('../utils/logger');

const log = createLogger('kreator');

/**
 * Router kreatora: renderuje panel (intro → kroki → podsumowanie → podgląd → budowa)
 * i obsługuje wszystkie interakcje z customId zaczynającym się od „wz:”.
 */
function createWizard({ store, config, runBuild }) {
  const footer = `Panel widzisz tylko Ty • sesja wygasa po ${config.sessionTimeoutMinutes} min bezczynności`;

  // ───────────── Ekrany ─────────────

  function introFrame(s) {
    const env = s.env;
    const checks = [
      `${env.botAdmin ? '✅' : '❌'} Bot ma uprawnienie **Administrator**`,
      `${env.botTop ? '✅' : '⚠️'} Rola bota ${env.botTop ? 'jest najwyżej na liście ról' : 'nie jest najwyżej – role nad nią nie zostaną zmienione ani usunięte'}`,
      `${env.existingChannels < 400 ? '✅' : '⚠️'} Kanały na serwerze: **${env.existingChannels}**/500`,
      `${env.existingRoles < 200 ? '✅' : '⚠️'} Role na serwerze: **${env.existingRoles}**/250`,
    ];
    return {
      embeds: [embed({
        title: '👋 Witaj w Kreatorze Serwera!',
        color: COLORS.primary,
        description: [
          'Odpowiesz na **14 krótkich pytań**, a ja zbuduję dla Ciebie kompletny, profesjonalny serwer: **role z uprawnieniami, kategorie, kanały, regulamin, panele, AutoMod i ustawienia bezpieczeństwa**.',
          '',
          '**Jak to działa?**',
          '1️⃣ Wybierasz typ serwera – dostajesz mądre ustawienia startowe',
          '2️⃣ Dopracowujesz szczegóły: nazwy, wygląd, sekcje, role, uprawnienia…',
          '3️⃣ Sprawdzasz podsumowanie oraz podgląd kanałów i ról',
          '4️⃣ Klikasz **Zbuduj serwer** – resztę robię ja ⚡',
          '',
          '💡 Na każdym etapie możesz przejść do **podsumowania** – pozostałe odpowiedzi uzupełnię zalecanymi wartościami.',
        ].join('\n'),
        fields: [field('🔎 Sprawdzenie gotowości', checks.join('\n'))],
        footer,
      })],
      components: [row(
        button(cid(s, 'n', 'start'), 'Rozpocznij', { style: ButtonStyle.Primary, emoji: '🚀', disabled: !env.botAdmin }),
        button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
      )],
    };
  }

  function navRow(s, index) {
    return row(
      button(cid(s, 'n', 'back'), 'Wstecz', { emoji: '◀️' }),
      button(cid(s, 'n', 'next'), index === STEPS.length - 1 ? 'Podsumowanie' : 'Dalej', { style: ButtonStyle.Primary, emoji: '▶️' }),
      button(cid(s, 'n', 'sum'), 'Podsumowanie', { style: ButtonStyle.Success, emoji: '⏭️', disabled: !s.typeChosen || index === STEPS.length - 1 }),
      button(cid(s, 'n', 'cancel'), 'Anuluj', { style: ButtonStyle.Danger, emoji: '✖️' }),
    );
  }

  function stepFrame(s) {
    const index = STEP_INDEX[s.step];
    const step = STEPS[index];
    const view = step.render(s);
    const description = [
      s.flash ? `> ${s.flash}\n` : null,
      step.intro,
      view.lines?.length ? `\n${view.lines.join('\n')}` : null,
      `\n${progressBar(index + 1, STEPS.length + 1)}`,
    ].filter(Boolean).join('\n');
    s.flash = null;
    return {
      embeds: [embed({
        title: `${step.emoji} Krok ${index + 1}/${STEPS.length} · ${step.title}`,
        description,
        fields: view.fields || [],
        color: COLORS.primary,
        footer,
      })],
      components: [...view.rows.slice(0, 4), navRow(s, index)],
    };
  }

  function computeBlueprint(s) {
    s.blueprint = buildBlueprint(s.answers, { existingChannels: s.env.existingChannels, existingRoles: s.env.existingRoles });
    return s.blueprint;
  }

  function summaryFrame(s) {
    const bp = computeBlueprint(s);
    const description = [
      s.flash ? `> ${s.flash}\n` : null,
      bp.errors.length
        ? '❌ **Popraw zaznaczone problemy, aby móc zbudować serwer.**'
        : '✅ **Wszystko gotowe!** Sprawdź podsumowanie, obejrzyj podgląd kanałów i ról, a potem kliknij **Zbuduj serwer**.',
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
          button(cid(s, 'n', 'export'), 'Eksport JSON', { emoji: '📄' }),
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
        footer: `Strona ${page + 1}/${pages.length} • 📨 = bot opublikuje tu wiadomość`,
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
    if (s.step === 'intro') return introFrame(s);
    if (s.step === 'summary') return summaryFrame(s);
    return stepFrame(s);
  }

  function endedFrame(title, description, color = COLORS.neutral) {
    return { embeds: [embed({ title, description, color })], components: [] };
  }

  // ───────────── Start (/stworz) ─────────────

  async function start(interaction) {
    const { guild, member } = interaction;
    const isOwner = guild.ownerId === interaction.user.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    if (config.ownerOnly ? !isOwner : !(isOwner || isAdmin)) {
      return interaction.reply({
        embeds: [embed({ title: '🔒 Brak uprawnień', description: config.ownerOnly ? 'Kreatora może używać tylko **właściciel serwera**.' : 'Kreatora mogą używać tylko osoby z uprawnieniem **Administrator**.', color: COLORS.danger })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const existing = store.get(guild.id);
    if (existing?.building) {
      return interaction.reply({
        embeds: [embed({ title: '🏗️ Trwa budowanie', description: `Na tym serwerze właśnie trwa budowa uruchomiona przez <@${existing.userId}>. Poczekaj, aż się zakończy.`, color: COLORS.warning })],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (existing && existing.userId !== interaction.user.id && !isOwner) {
      const minutes = Math.max(1, Math.ceil((store.timeoutMs - (Date.now() - existing.updatedAt)) / 60_000));
      return interaction.reply({
        embeds: [embed({ title: '⏳ Kreator jest zajęty', description: `Kreator jest otwarty przez <@${existing.userId}>. Sesja wygaśnie po ok. ${minutes} min bezczynności.\n*Właściciel serwera może przejąć kreator, uruchamiając /stworz.*`, color: COLORS.warning })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = guild.members.me ?? await guild.members.fetchMe();
    const highest = guild.roles.cache.reduce((max, r) => (r.position > max ? r.position : max), 0);
    const env = {
      guildName: guild.name,
      ownerId: guild.ownerId,
      isOwner,
      botAdmin: me.permissions.has(PermissionFlagsBits.Administrator),
      botTop: me.roles.highest.position >= highest,
      existingChannels: guild.channels.cache.filter((c) => !c.isThread()).size,
      existingRoles: guild.roles.cache.size,
      originChannelId: interaction.channelId,
    };
    const session = store.create(guild.id, interaction.user.id, env);
    log.info(`Nowa sesja ${session.id} na serwerze ${guild.name} (${guild.id}) – ${interaction.user.tag}`);

    const frame = introFrame(session);
    if (!env.botAdmin) {
      frame.embeds[0].addFields(field('❌ Bot potrzebuje uprawnienia Administrator', 'Bez niego nie mogę tworzyć ról z uprawnieniami ani ustawiać nadpisań kanałów.\n**Jak naprawić:** Ustawienia serwera → Role → rola bota → włącz **Administrator** (albo zaproś bota ponownie linkiem z konsoli, który zawiera `permissions=8`).'));
    }
    return interaction.reply({ ...frame, flags: MessageFlags.Ephemeral });
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

    // Nawigacja
    if (kind === 'n') return handleNav(session, interaction, id, arg);
    return undefined;
  }

  async function handleNav(s, interaction, id) {
    const index = STEP_INDEX[s.step];
    switch (id) {
      case 'start':
        s.step = STEPS[0].id;
        break;
      case 'next': {
        const error = STEPS[index]?.validate?.(s);
        if (error) { s.flash = `⚠️ ${error}`; break; }
        s.step = index >= STEPS.length - 1 ? 'summary' : STEPS[index + 1].id;
        break;
      }
      case 'back':
        if (s.step === 'summary') s.step = STEPS[STEPS.length - 1].id;
        else if (index === 0) s.step = 'intro';
        else if (index > 0) s.step = STEPS[index - 1].id;
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
      content: '📄 **Eksport projektu serwera** – plik zawiera Twoje odpowiedzi i pełny plan (role, kanały, uprawnienia). Możesz go zachować jako kopię lub dokumentację.',
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function startBuild(s, interaction) {
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
    s.building = true;
    s.abort = false;
    s.view = null;
    const bp = s.blueprint;
    await interaction.update({
      embeds: [embed({ title: '🏗️ Przygotowuję budowę…', description: `${progressBar(0, 1)}\n⏱️ Szacowany czas: ~${formatDuration(bp.estimatedSeconds)}`, color: COLORS.build })],
      components: [],
    });
    try {
      await runBuild({ session: s, blueprint: bp, interaction });
    } catch (err) {
      log.error('Budowa zakończona błędem:', err);
    } finally {
      s.building = false;
      store.delete(s.guildId);
    }
  }

  return { start, handle, render };
}

module.exports = { createWizard };
