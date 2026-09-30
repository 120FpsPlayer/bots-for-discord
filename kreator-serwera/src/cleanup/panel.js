'use strict';

const crypto = require('node:crypto');
const { AttachmentBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { performCleanup, TARGETS, DEFAULT_TARGETS, MAX_UNBANS } = require('./cleaner');
const { snapshotGuild } = require('./snapshot');
const {
  COLORS, embed, field, button, linkButton, row, selectRow, modal, modalText, progressBar, clip, formatDuration, ButtonStyle, acknowledge, respond,
} = require('../wizard/ui');
const { createLogger } = require('../utils/logger');

const log = createLogger('usun');
const SESSION_TTL_MS = 15 * 60_000;
const EDIT_INTERVAL_MS = 1500;

/**
 * Komenda /usun – panel czyszczenia serwera.
 * Bezpieczeństwo:
 *  • tylko właściciel serwera (nawet administratorzy nie mogą),
 *  • potwierdzenie wpisaniem nazwy serwera,
 *  • domyślnie kopia zapasowa wysyłana PRZED usunięciem czegokolwiek (plik + wiadomość prywatna),
 *  • nigdy nie usuwa członków, a kanał, z którego uruchomiono komendę, zostaje do końca.
 */
function createCleanupPanel({ store }) {
  const sessions = new Map();

  const getSession = (guildId) => {
    const s = sessions.get(guildId);
    if (s && !s.running && Date.now() - s.updatedAt > SESSION_TTL_MS) {
      sessions.delete(guildId);
      return null;
    }
    return s || null;
  };
  const id = (s, action) => `cl:${s.id}:${action}`;

  // ───────────── Spis tego, co jest na serwerze ─────────────

  async function inventory(guild) {
    await guild.channels.fetch().catch(() => {});
    await guild.roles.fetch().catch(() => {});
    const channels = [...guild.channels.cache.values()].filter((c) => !c.isThread?.());
    const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id);
    const count = async (manager, opts) => {
      try {
        const col = await manager?.fetch(opts);
        return col?.size ?? 0;
      } catch {
        return null;
      }
    };
    return {
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length,
      text: channels.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)).length,
      forums: channels.filter((c) => [ChannelType.GuildForum, ChannelType.GuildMedia].includes(c.type)).length,
      voice: channels.filter((c) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type)).length,
      channels: channels.length,
      roles: roles.length,
      rolesDeletable: roles.filter((r) => !r.managed && r.editable).length,
      rolesAbove: roles.filter((r) => !r.managed && !r.editable).length,
      rolesManaged: roles.filter((r) => r.managed).length,
      automod: await count(guild.autoModerationRules),
      events: await count(guild.scheduledEvents),
      emojis: await count(guild.emojis),
      stickers: await count(guild.stickers),
      invites: await count(guild.invites),
      bans: await count(guild.bans, { limit: MAX_UNBANS }),
      members: guild.memberCount ?? null,
      community: Boolean(guild.features?.includes('COMMUNITY')),
    };
  }

  const n = (v) => (v === null || v === undefined ? '?' : v);

  function targetCount(inv, key) {
    switch (key) {
      case 'channels': return `${n(inv.channels)} (📁 ${inv.categories} kategorii, # ${inv.text} tekstowych, 🗂️ ${inv.forums} forów, 🔊 ${inv.voice} głosowych)`;
      case 'roles': return `${inv.rolesDeletable} z ${inv.roles}`;
      case 'automod': return n(inv.automod);
      case 'events': return n(inv.events);
      case 'emojis': return `${n(inv.emojis)} emoji, ${n(inv.stickers)} naklejek`;
      case 'invites': return n(inv.invites);
      case 'bans': return `${inv.bans !== null && inv.bans >= MAX_UNBANS ? `${MAX_UNBANS}+` : n(inv.bans)} osób`;
      case 'settings': return 'weryfikacja, filtr, powiadomienia, kanał systemowy, AFK';
      default: return '';
    }
  }

  // ───────────── Ekrany ─────────────

  function panelFrame(s) {
    const inv = s.inv;
    const chosen = Object.keys(TARGETS).filter((k) => s.targets.has(k));
    const kept = [
      '👥 członkowie serwera i ich konta',
      '🏷️ nazwa i ikona serwera, boosty',
      '🤖 role botów i integracji',
      inv.rolesAbove ? `🔒 ${inv.rolesAbove} ról powyżej roli bota` : null,
      '📍 ten kanał (do końca – potem usuniesz go jednym kliknięciem)',
      ...Object.keys(TARGETS).filter((k) => !s.targets.has(k)).map((k) => `${TARGETS[k].emoji} ${TARGETS[k].label.toLowerCase()}`),
    ].filter(Boolean);
    const notes = [];
    if (inv.community && (s.targets.has('channels') || s.targets.has('settings'))) notes.push('🌟 Tryb Społeczności zostanie wyłączony – inaczej Discord nie pozwala usunąć kanału regulaminu.');
    if (s.targets.has('roles') && inv.rolesAbove) notes.push(`🔒 ${inv.rolesAbove} ról jest powyżej roli bota – nie zostaną usunięte (przeciągnij rolę bota na górę).`);
    if (s.targets.has('bans')) notes.push('🔓 Wszyscy zbanowani będą mogli wrócić na serwer!');
    if (s.targets.has('invites')) notes.push('🔗 Wszystkie linki zaproszeń przestaną działać.');
    if (s.targets.has('roles')) notes.push('👥 Uprawnienia @everyone wrócą do domyślnych – członkowie znów zobaczą kanały.');
    if (!s.after.has('backup')) notes.push('💾 **Bez kopii zapasowej** – usuniętej struktury nie da się przywrócić!');

    return {
      embeds: [embed({
        title: '🧹 Czyszczenie serwera',
        color: COLORS.danger,
        description: [
          s.flash ? `> ${s.flash}\n` : null,
          `Ta operacja **nieodwracalnie** usuwa wybrane elementy serwera **${clip(s.guildName, 80)}**.`,
          'Zaznacz poniżej, co ma zniknąć. Na końcu trzeba będzie wpisać nazwę serwera, żeby potwierdzić.',
        ].filter(Boolean).join('\n'),
        fields: [
          field('📦 Na serwerze jest', [
            `💬 **${n(inv.channels)}** kanałów (📁 ${inv.categories} • # ${inv.text} • 🗂️ ${inv.forums} • 🔊 ${inv.voice})`,
            `🎭 **${inv.roles}** ról (✅ ${inv.rolesDeletable} do usunięcia • 🔒 ${inv.rolesAbove} ponad botem • 🤖 ${inv.rolesManaged} botów)`,
            `🤖 AutoMod: **${n(inv.automod)}** • 📅 wydarzenia: **${n(inv.events)}**`,
            `😀 emoji: **${n(inv.emojis)}** • 🏷️ naklejki: **${n(inv.stickers)}** • 🔗 zaproszenia: **${n(inv.invites)}** • 🔨 bany: **${inv.bans !== null && inv.bans >= MAX_UNBANS ? `${MAX_UNBANS}+` : n(inv.bans)}**`,
            inv.members ? `👥 członkowie: **${inv.members}** (zostają)` : null,
          ].filter(Boolean).join('\n')),
          field(`🗑️ Zostanie usunięte (${chosen.length})`, chosen.map((k) => `${TARGETS[k].emoji} ${TARGETS[k].label}: **${targetCount(inv, k)}**`).join('\n') || '*nic – zaznacz coś w menu*', true),
          field('🛡️ Zostanie zachowane', kept.join('\n'), true),
          field('✨ Po czyszczeniu', [
            s.after.has('backup') ? '💾 najpierw wyślę Ci **kopię zapasową** (plik + wiadomość prywatna) – przywrócisz ją przez `/stworz projekt:<plik>`' : '💾 kopia zapasowa: **wyłączona**',
            s.after.has('fresh') && s.targets.has('channels') ? '🆕 utworzę kanały startowe: #ogólny i 🔊 Ogólny (jak na nowym serwerze)' : null,
          ].filter(Boolean).join('\n')),
          ...(notes.length ? [field('⚠️ Ważne', notes.join('\n'))] : []),
        ],
        footer: 'Panel widzisz tylko Ty • dostępny tylko dla właściciela serwera',
      })],
      components: [
        selectRow(id(s, 'what'), {
          placeholder: '🗑️ Co usunąć?',
          min: 1,
          max: Object.keys(TARGETS).length,
          options: Object.entries(TARGETS).map(([k, t]) => ({ value: k, label: t.label, description: t.description, emoji: t.emoji, default: s.targets.has(k) })),
        }),
        selectRow(id(s, 'after'), {
          placeholder: '✨ Dodatkowe opcje',
          min: 0,
          max: 2,
          options: [
            { value: 'backup', label: 'Kopia zapasowa przed czyszczeniem', description: 'Zalecane – plik do przywrócenia struktury serwera', emoji: '💾', default: s.after.has('backup') },
            { value: 'fresh', label: 'Utwórz kanały startowe', description: '#ogólny i kanał głosowy „Ogólny”, jak na nowym serwerze', emoji: '🆕', default: s.after.has('fresh') },
          ],
        }),
        row(
          button(id(s, 'run'), 'Wyczyść serwer', { style: ButtonStyle.Danger, emoji: '🧹', disabled: !s.targets.size }),
          button(id(s, 'backup'), 'Tylko kopia zapasowa', { emoji: '💾' }),
          button(id(s, 'refresh'), 'Odśwież', { emoji: '🔄' }),
          button(id(s, 'cancel'), 'Anuluj', { emoji: '✖️' }),
        ),
      ],
    };
  }

  function progressFrame(s, state) {
    const phases = state.phases.map((p) => `✅ ${p}`);
    phases.push(`⏳ **${state.phase}**${state.label ? ` – ${clip(state.label, 80)}` : ''}`);
    return {
      embeds: [embed({
        title: '🧹 Czyszczę serwer…',
        color: COLORS.build,
        description: [
          progressBar(state.done, state.total, 18),
          `Operacje: **${Math.min(state.done, state.total)}/${state.total}** • czas: **${formatDuration(state.elapsed / 1000)}**`,
          '',
          phases.join('\n'),
        ].join('\n'),
      })],
      components: [row(button(id(s, 'abort'), 'Przerwij', { style: ButtonStyle.Danger, emoji: '⛔' }))],
    };
  }

  function doneFrame(s, result, guild, originChannelId) {
    const d = result.deleted;
    const problems = result.warnings.map((w) => `⚠️ ${w}`);
    let title = '✅ Serwer wyczyszczony';
    let color = COLORS.success;
    if (result.fatal) { title = '💥 Czyszczenie przerwane przez błąd'; color = COLORS.danger; }
    else if (result.aborted) { title = '⛔ Czyszczenie przerwane'; color = COLORS.warning; }
    else if (problems.length) { title = '✅ Serwer wyczyszczony (z uwagami)'; color = COLORS.warning; }
    const deletedLines = [
      d.channels || d.categories ? `💬 ${d.channels} kanałów, 📁 ${d.categories} kategorii` : null,
      d.roles ? `🎭 ${d.roles} ról` : null,
      d.automod ? `🤖 ${d.automod} reguł AutoMod` : null,
      d.events ? `📅 ${d.events} wydarzeń` : null,
      d.emojis || d.stickers ? `😀 ${d.emojis} emoji, 🏷️ ${d.stickers} naklejek` : null,
      d.invites ? `🔗 ${d.invites} zaproszeń` : null,
      d.unbanned ? `🔓 ${d.unbanned} zdjętych banów` : null,
      result.communityDisabled ? '🌟 tryb Społeczności wyłączony' : null,
    ].filter(Boolean);
    const buttons = [];
    if (result.freshChannelId) buttons.push(linkButton(`https://discord.com/channels/${guild.id}/${result.freshChannelId}`, 'Przejdź do #ogólny', '💬'));
    if (!result.fatal) buttons.push(button(`wzx:delorigin:${originChannelId}`, 'Usuń ten kanał', { style: ButtonStyle.Danger, emoji: '🗑️' }));
    return {
      embeds: [embed({
        title,
        color,
        description: result.fatal ? `Błąd: ${result.fatal}` : `Serwer **${clip(guild.name, 80)}** jest wyczyszczony.`,
        fields: [
          field('🗑️ Usunięto', deletedLines.join('\n') || '*nic*', true),
          field('⏱️ Czas', `${formatDuration(result.duration / 1000)}${result.created.channels ? `\n🆕 kanały startowe: ${result.created.channels}` : ''}`, true),
          ...(problems.length ? [field(`📝 Uwagi (${problems.length})`, problems.slice(0, 10).join('\n'))] : []),
          field('🚀 Co dalej?', [
            '• Wpisz **/stworz**, aby zbudować nowy serwer.',
            s.after.has('backup') ? '• Starą strukturę przywrócisz: **/stworz** + plik kopii w opcji **projekt**.' : null,
            '• Ten kanał możesz usunąć przyciskiem poniżej.',
          ].filter(Boolean).join('\n')),
        ],
      })],
      components: buttons.length ? [row(...buttons)] : [],
    };
  }

  function backupFile(snapshot, guild) {
    const date = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const safeName = guild.name.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'serwer';
    return new AttachmentBuilder(Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8'), { name: `kopia-${safeName}-${date}.json` });
  }

  /** mode: 'followUp' (nowa wiadomość) albo 'edit' (po deferReply). */
  async function sendBackup(interaction, guild, { mode }) {
    const snapshot = await snapshotGuild(guild);
    const st = snapshot.blueprint.stats;
    const content = [
      `💾 **Kopia zapasowa serwera ${guild.name}** – ${st.roles} ról, ${st.categories} kategorii, ${st.channels} kanałów, ${st.automod} reguł AutoMod.`,
      '📥 Przywrócisz ją komendą `/stworz` z tym plikiem w opcji **projekt**. Zachowaj plik – kopia nie zawiera wiadomości, emoji ani członków.',
    ].join('\n');
    const files = [backupFile(snapshot, guild)];
    if (mode === 'edit') await interaction.editReply({ content, files });
    else await interaction.followUp({ content, files, flags: MessageFlags.Ephemeral });
    // Druga kopia w wiadomości prywatnej – nie zniknie po zamknięciu panelu.
    await interaction.user.send({ content, files: [backupFile(snapshot, guild)] }).catch(() => {});
    return snapshot;
  }

  // ───────────── /usun ─────────────

  async function start(interaction) {
    const { guild } = interaction;
    if (guild.ownerId !== interaction.user.id) {
      return interaction.reply({
        embeds: [embed({ title: '🔒 Tylko dla właściciela', description: 'Czyścić serwer może wyłącznie **właściciel serwera** – to zabezpieczenie na wypadek przejęcia konta administratora.', color: COLORS.danger })],
        flags: MessageFlags.Ephemeral,
      });
    }
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [embed({ title: '❌ Bot potrzebuje uprawnienia Administrator', description: 'Ustawienia serwera → Role → rola bota → włącz **Administrator** i uruchom /usun ponownie.', color: COLORS.danger })],
        flags: MessageFlags.Ephemeral,
      });
    }
    const busy = store.lockedBy(guild.id) || (getSession(guild.id)?.running ? 'czyszczenie serwera' : null);
    if (busy) {
      return interaction.reply({
        embeds: [embed({ title: '⏳ Serwer jest zajęty', description: `Na tym serwerze trwa teraz: **${busy}**. Poczekaj, aż się zakończy.`, color: COLORS.warning })],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const s = {
      id: crypto.randomBytes(4).toString('hex'),
      guildId: guild.id,
      guildName: guild.name,
      userId: interaction.user.id,
      targets: new Set(DEFAULT_TARGETS),
      after: new Set(['backup', 'fresh']),
      inv: await inventory(guild),
      running: false,
      abort: false,
      flash: null,
      updatedAt: Date.now(),
    };
    sessions.set(guild.id, s);
    log.info(`Panel /usun na ${guild.name} (${guild.id}) – ${interaction.user.tag}`);
    return interaction.editReply(panelFrame(s));
  }

  async function handle(interaction) {
    const [, sid, action] = interaction.customId.split(':');
    const s = getSession(interaction.guildId);
    if (!s || s.id !== sid) {
      const frame = { embeds: [embed({ title: '⏱️ Panel wygasł', description: 'Użyj **/usun** ponownie.', color: COLORS.neutral })], components: [] };
      if (interaction.isModalSubmit() && !interaction.isFromMessage()) return interaction.reply({ ...frame, flags: MessageFlags.Ephemeral });
      return interaction.update(frame).catch(() => interaction.reply({ ...frame, flags: MessageFlags.Ephemeral }));
    }
    if (interaction.user.id !== s.userId || interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: '🔒 Ten panel należy do właściciela serwera.', flags: MessageFlags.Ephemeral });
    }
    s.updatedAt = Date.now();

    if (s.running) {
      if (action === 'abort') {
        s.abort = true;
        return interaction.reply({ content: '⛔ Przerywam po bieżącej operacji…', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: '🧹 Czyszczenie trwa – poczekaj na zakończenie.', flags: MessageFlags.Ephemeral });
    }

    switch (action) {
      case 'what':
        s.targets = new Set(interaction.values.filter((v) => TARGETS[v]));
        return interaction.update(panelFrame(s));
      case 'after':
        s.after = new Set(interaction.values.filter((v) => ['backup', 'fresh'].includes(v)));
        return interaction.update(panelFrame(s));
      case 'refresh':
        await interaction.deferUpdate();
        s.inv = await inventory(interaction.guild);
        s.guildName = interaction.guild.name;
        return interaction.editReply(panelFrame(s));
      case 'cancel':
        sessions.delete(s.guildId);
        return interaction.update({ embeds: [embed({ title: '✖️ Anulowano', description: 'Nic nie zostało usunięte.', color: COLORS.neutral })], components: [] });
      case 'backup':
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await sendBackup(interaction, interaction.guild, { mode: 'edit' });
        } catch (err) {
          log.error('Kopia zapasowa nieudana:', err);
          await interaction.editReply({ content: '❌ Nie udało się utworzyć kopii zapasowej. Szczegóły zapisano w konsoli bota.' }).catch(() => {});
        }
        return undefined;
      case 'run': {
        const list = [...s.targets].map((k) => TARGETS[k].label.toLowerCase()).join(', ');
        return interaction.showModal(modal(id(s, 'confirm'), 'Potwierdź czyszczenie serwera', [{
          id: 'confirm',
          label: 'Wpisz nazwę serwera, aby potwierdzić',
          description: clip(`Usunę: ${list}. Nazwa: ${interaction.guild.name}`, 100),
          style: 'short',
          required: true,
          max: 100,
          placeholder: clip(interaction.guild.name, 100),
        }]));
      }
      case 'confirm': {
        // Formularz potwierdzamy od razu – Discord czeka na odpowiedź tylko 3 s.
        await acknowledge(interaction);
        const typed = modalText(interaction, 'confirm').toLocaleLowerCase('pl');
        if (typed !== interaction.guild.name.trim().toLocaleLowerCase('pl')) {
          s.flash = '❌ Nazwa serwera się nie zgadza – nic nie zostało usunięte.';
          return respond(interaction, panelFrame(s));
        }
        return run(s, interaction);
      }
      default:
        return undefined;
    }
  }

  async function run(s, interaction) {
    const { guild } = interaction;
    if (store.lockedBy(guild.id)) {
      s.flash = `⏳ Na serwerze trwa: ${store.lockedBy(guild.id)}. Spróbuj za chwilę.`;
      return respond(interaction, panelFrame(s));
    }
    s.running = true;
    s.abort = false;
    store.lock(guild.id, 'czyszczenie serwera');
    let tokenAlive = true;
    let editing = Promise.resolve();
    let lastEdit = 0;
    let ran = false;
    const safeEdit = (payload) => {
      if (!tokenAlive) return editing;
      editing = editing.then(() => interaction.editReply(payload)).catch((err) => {
        if ([50027, 10008, 10015].includes(err?.code)) tokenAlive = false;
      });
      return editing;
    };
    try {
      await respond(interaction, progressFrame(s, { done: 0, total: 1, phase: 'Przygotowanie', label: '', phases: [], elapsed: 0 }));
      if (s.after.has('backup')) {
        try {
          await sendBackup(interaction, guild, { mode: 'followUp' });
        } catch (err) {
          log.error('Kopia zapasowa nieudana – przerywam czyszczenie:', err);
          s.flash = '❌ Nie udało się utworzyć kopii zapasowej, więc nic nie zostało usunięte. Spróbuj ponownie lub wyłącz kopię.';
          return safeEdit(panelFrame(s));
        }
      }
      ran = true;
      const keepChannelIds = [interaction.channelId];
      if (interaction.channel?.isThread?.()) keepChannelIds.push(interaction.channel.parentId);
      log.info(`Start czyszczenia ${guild.name} (${guild.id}): ${[...s.targets].join(', ')}`);
      const result = await performCleanup(guild, {
        targets: [...s.targets],
        fresh: s.after.has('fresh'),
        keepChannelIds,
        invokerId: interaction.user.id,
        shouldAbort: () => s.abort,
        onProgress: (state) => {
          const now = Date.now();
          if (now - lastEdit >= EDIT_INTERVAL_MS) {
            lastEdit = now;
            safeEdit(progressFrame(s, state));
          }
        },
      });
      log.info(`Koniec czyszczenia ${guild.name}: ${JSON.stringify(result.deleted)} w ${Math.round(result.duration / 1000)} s.`);
      await editing;
      tokenAlive = true;
      const frame = doneFrame(s, result, guild, interaction.channelId);
      await safeEdit(frame);
      if (!tokenAlive) await interaction.user.send({ embeds: frame.embeds }).catch(() => {});
      return result;
    } finally {
      s.running = false;
      store.unlock(guild.id);
      if (ran) sessions.delete(guild.id);
    }
  }

  return { start, handle, inventory, panelFrame };
}

module.exports = { createCleanupPanel };
