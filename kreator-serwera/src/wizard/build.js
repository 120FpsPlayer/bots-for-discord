'use strict';

const { MessageFlags } = require('discord.js');
const { executeBlueprint } = require('../builder/executor');
const undo = require('./undo');
const {
  COLORS, embed, field, button, linkButton, row, progressBar, clip, formatDuration, ButtonStyle, cid,
} = require('./ui');
const { createLogger } = require('../utils/logger');

const log = createLogger('budowa');
const EDIT_INTERVAL_MS = 1500;

/**
 * Uruchamia budowę i na bieżąco odświeża panel (pasek postępu, etapy, czas).
 * Aktualizacje są dławione, żeby nie przekroczyć limitów edycji wiadomości.
 */
async function runBuild({ session, blueprint, interaction }) {
  const { guild } = interaction;
  let lastEdit = 0;
  let pending = null;
  let editing = Promise.resolve();
  let tokenAlive = true;

  const safeEdit = (payload) => {
    if (!tokenAlive) return Promise.resolve();
    editing = editing
      .then(() => interaction.editReply(payload))
      .catch((err) => {
        // Token interakcji wygasa po 15 minutach – dalej budujemy, raport trafi na kanał ekipy.
        if (err?.code === 50027 || err?.code === 10008 || err?.code === 10015) tokenAlive = false;
        log.debug('Nie udało się odświeżyć panelu:', err?.message);
      });
    return editing;
  };

  const progressFrame = (state) => {
    const phases = state.phases.map((p) => `✅ ${p}`);
    phases.push(`⏳ **${state.phase}**${state.label ? ` – ${clip(state.label, 80)}` : ''}`);
    return {
      embeds: [embed({
        title: blueprint.meta.type === 'backup'
          ? (blueprint.meta.mode === 'wipe' ? '🧨 Czyszczę serwer i przywracam kopię…' : '♻️ Przywracam kopię zapasową…')
          : (blueprint.meta.mode === 'wipe' ? '🧨 Czyszczę i buduję serwer…' : '🏗️ Buduję serwer…'),
        color: COLORS.build,
        description: [
          `${progressBar(state.done, state.total, 18)}`,
          `Operacje: **${state.done}/${state.total}** • czas: **${formatDuration(state.elapsed / 1000)}**`,
          '',
          phases.join('\n'),
          '',
          '*Możesz zamknąć ten panel – budowa i tak dokończy się w tle.*',
        ].join('\n'),
      })],
      components: [row(button(cid(session, 'n', 'abort'), 'Przerwij', { style: ButtonStyle.Danger, emoji: '⛔' }))],
    };
  };

  const onProgress = (state) => {
    pending = state;
    const now = Date.now();
    if (now - lastEdit >= EDIT_INTERVAL_MS) {
      lastEdit = now;
      safeEdit(progressFrame(pending));
    }
  };

  const keepChannelIds = [interaction.channelId];
  if (interaction.channel?.isThread()) keepChannelIds.push(interaction.channel.parentId);

  log.info(`Start budowy na ${guild.name} (${guild.id}) – tryb ${blueprint.meta.mode}, ${blueprint.stats.roles} ról, ${blueprint.stats.channels} kanałów.`);
  const result = await executeBlueprint({
    guild,
    blueprint,
    answers: session.answers,
    invokerId: interaction.user.id,
    keepChannelIds,
    onProgress,
    shouldAbort: () => session.abort,
  });
  log.info(`Koniec budowy na ${guild.name}: ${JSON.stringify(result.created)} w ${Math.round(result.duration / 1000)} s, błędy: ${result.errors.length}, uwagi: ${result.warnings.length}.`);
  const createdAnything = result.ids && Object.values(result.ids).some((list) => list.length);
  if (createdAnything) undo.remember(guild.id, result, { userId: interaction.user.id, wipe: blueprint.meta.mode === 'wipe' });

  await editing;
  const frame = doneFrame({ session, blueprint, result, guild, originChannelId: interaction.channelId });
  tokenAlive = true;
  await safeEdit(frame);
  if (!tokenAlive) {
    // Panel wygasł (bardzo długa budowa) – wysyłamy podsumowanie w wiadomości prywatnej.
    await interaction.user.send({ embeds: frame.embeds }).catch(() => {});
  }
  return result;
}

function doneFrame({ session, blueprint, result, guild, originChannelId }) {
  const c = result.created;
  const d = result.deleted;
  const problems = [...result.errors.map((e) => `❌ ${e}`), ...result.warnings.map((w) => `⚠️ ${w}`)];
  const backup = blueprint.meta.type === 'backup';
  let title = backup ? '♻️ Kopia zapasowa przywrócona!' : '🎉 Serwer gotowy!';
  let color = COLORS.success;
  if (result.fatal) { title = '💥 Budowa przerwana przez błąd'; color = COLORS.danger; }
  else if (result.aborted) { title = '⛔ Budowa przerwana'; color = COLORS.warning; }
  else if (result.errors.length) { title = backup ? '♻️ Kopia przywrócona (z uwagami)' : '✅ Serwer zbudowany (z uwagami)'; color = COLORS.warning; }

  const fields = [
    field('📊 Utworzono', [
      `🎭 **${c.roles}**/${blueprint.stats.roles} ról`,
      `📁 **${c.categories}**/${blueprint.stats.categories} kategorii`,
      `💬 **${c.channels}**/${blueprint.stats.channels} kanałów`,
      `📨 **${c.messages}** wiadomości`,
      `🤖 **${c.automod}** reguł AutoMod`,
    ].join('\n'), true),
  ];
  if (blueprint.meta.mode === 'wipe') {
    fields.push(field('🧹 Usunięto', `💬 ${d.channels} kanałów\n🎭 ${d.roles} ról\n🤖 ${d.automod} reguł AutoMod`, true));
  }
  fields.push(field('⏱️ Czas budowy', `${formatDuration(result.duration / 1000)}\n🌟 Społeczność: ${result.community ? 'włączona' : 'wyłączona'}`, true));
  const st = blueprint.stats;
  fields.push(field('🔑 Uprawnienia kanałów', [
    `⚙️ Ustawiono **${c.overwrites}** nadpisań uprawnień`,
    `💬 ${st.open} otwartych • 👁️ ${st.readonly} tylko do odczytu • 🔒 ${st.hidden} ukrytych`,
    backup ? '♻️ Uprawnienia odtworzone 1:1 z kopii' : blueprint.meta.gate ? '✅ Nowe osoby widzą tylko regulamin i weryfikację' : '👥 Nowe osoby od razu widzą kanały dla członków',
  ].join('\n')));
  if (result.fatal) fields.push(field('💥 Błąd krytyczny', result.fatal));
  if (problems.length) {
    const shown = problems.slice(0, 12).join('\n');
    fields.push(field(`📝 Uwagi (${problems.length})`, problems.length > 12 ? `${clip(shown, 900)}\n…i ${problems.length - 12} więcej (pełna lista w konsoli bota)` : shown));
  }
  if (backup) {
    fields.push(field('🚀 Następne kroki', [
      '1. **Przeciągnij rolę bota na samą górę** listy ról (Ustawienia → Role).',
      '2. **Nadaj role członkom ponownie** – Discord usuwa przypisania razem z rolami, a kopia ich nie przechowuje.',
      '3. Zaproś ponownie boty, jeśli zostały usunięte – ich role utworzą się same.',
      '↩️ Coś nie tak? **Cofnij budowę** usunie wszystko, co przywróciłem (przez 2 godziny).',
    ].join('\n')));
  } else fields.push(field('🚀 Następne kroki', [
    '1. **Przeciągnij rolę bota na samą górę** listy ról (Ustawienia → Role).',
    '2. Nadaj role ekipie i sprawdź regulamin – dopasuj go do siebie.',
    '3. Dodaj boty (moderacja/logi, poziomy, muzyka) i nadaj im rolę **Boty**.',
    '4. Zostaw tego bota online – obsługuje przycisk weryfikacji.',
    '↩️ Nie podoba Ci się wynik? **Cofnij budowę** usunie wszystko, co utworzyłem (przez 2 godziny).',
  ].join('\n')));

  const link = (key) => (result.channels[key] ? `https://discord.com/channels/${guild.id}/${result.channels[key]}` : null);
  const buttons = [];
  const firstText = backup ? blueprint.categories.flatMap((c) => c.channels).find((c) => ['text', 'announcement'].includes(c.kind) && result.channels[c.key]) : null;
  const general = link('general') || link('rules') || (firstText ? link(firstText.key) : null);
  if (general) buttons.push(linkButton(general, 'Przejdź na serwer', '💬'));
  if (link('rules') && general !== link('rules')) buttons.push(linkButton(link('rules'), 'Regulamin', '📜'));
  if (link('staffChat')) buttons.push(linkButton(link('staffChat'), 'Czat ekipy', '🛡️'));
  const undoBtn = undo.undoButton(guild.id);
  if (undoBtn) buttons.push(undoBtn);
  if (blueprint.meta.mode === 'wipe' && !result.fatal) {
    buttons.push(button(`wzx:delorigin:${originChannelId}`, 'Usuń ten kanał', { style: ButtonStyle.Danger, emoji: '🗑️' }));
  }

  const description = result.fatal
    ? 'Budowa zatrzymała się z powodu błędu. Elementy utworzone do tej pory zostały na serwerze.'
    : result.aborted
      ? 'Budowa została przerwana. Elementy utworzone do tej pory zostały na serwerze – możesz je usunąć ręcznie lub uruchomić kreator ponownie w trybie czyszczenia.'
      : backup
        ? `Struktura serwera **${guild.name}** została odtworzona z kopii zapasowej.`
        : `Serwer **${guild.name}** został zbudowany zgodnie z Twoim projektem. Raport trafił też na kanał ekipy.`;

  return {
    embeds: [embed({ title, description, color, fields, footer: `Kreator Serwera • sesja ${session.id}` })],
    components: buttons.length ? [row(...buttons)] : [],
  };
}

/** Przycisk „Usuń ten kanał” po czyszczeniu (bez sesji – sprawdzamy uprawnienia). */
async function handleOriginDelete(interaction) {
  const [, , channelId] = interaction.customId.split(':');
  if (!interaction.memberPermissions?.has('Administrator') || channelId !== interaction.channelId) {
    return interaction.reply({ content: '🔒 Brak uprawnień.', flags: MessageFlags.Ephemeral });
  }
  await interaction.update({ embeds: [embed({ title: '🗑️ Usuwam kanał…', color: COLORS.neutral })], components: [] });
  await interaction.channel?.delete('Kreator Serwera – sprzątanie po budowie').catch(() => {});
  return undefined;
}

module.exports = { runBuild, doneFrame, handleOriginDelete };
