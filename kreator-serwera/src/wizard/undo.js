'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { COLORS, embed, field, button, row, ButtonStyle, formatDuration } = require('./ui');
const { describeError } = require('../builder/executor');
const { createLogger } = require('../utils/logger');

const log = createLogger('cofanie');

/**
 * „Cofnij budowę” – usuwa wszystko, co utworzył kreator (role, kategorie, kanały, reguły AutoMod)
 * i przywraca ustawienia serwera sprzed budowy. Dane trzymamy w pamięci przez 2 godziny
 * (po restarcie bota cofnięcie nie jest już możliwe).
 */

const TTL_MS = 2 * 60 * 60 * 1000;
const records = new Map();

function remember(guildId, result, { userId, wipe }) {
  records.set(guildId, { ids: result.ids, previous: result.previous, userId, wipe, at: Date.now() });
}

function get(guildId) {
  const record = records.get(guildId);
  if (!record) return null;
  if (Date.now() - record.at > TTL_MS) {
    records.delete(guildId);
    return null;
  }
  return record;
}

function counts(record) {
  return {
    roles: record.ids.roles.length,
    channels: record.ids.channels.length + record.ids.categories.length,
    automod: record.ids.automod.length,
  };
}

/** Przycisk cofania do ekranu końcowego (tylko jeśli jest co cofać). */
function undoButton(guildId) {
  return get(guildId) ? button(`wzu:ask:${guildId}`, 'Cofnij budowę', { style: ButtonStyle.Secondary, emoji: '↩️' }) : null;
}

/** Wykonuje cofnięcie. Zwraca { deleted, restored, problems }. */
async function performUndo(guild, record) {
  const reason = 'Kreator Serwera – cofnięcie budowy';
  const problems = [];
  const deleted = { roles: 0, channels: 0, automod: 0 };
  const prev = record.previous || {};
  const safe = async (what, fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err?.code !== 10003 && err?.code !== 10011) problems.push(`${what}: ${describeError(err)}`);
      return null;
    }
  };

  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  // 1. Tryb Społeczności: najpierw oddajemy regulamin/ogłoszenia starym kanałom albo wyłączamy Społeczność,
  //    bo Discord nie pozwala usunąć kanałów, które ją obsługują.
  const createdChannels = new Set([...record.ids.channels, ...record.ids.categories]);
  if (guild.features.includes('COMMUNITY')) {
    if (!prev.community) {
      await safe('Wyłączanie trybu Społeczności', () => guild.edit({ features: guild.features.filter((f) => f !== 'COMMUNITY'), reason }));
    } else {
      const edit = { reason };
      if (prev.rulesChannelId && guild.channels.cache.has(prev.rulesChannelId)) edit.rulesChannel = prev.rulesChannelId;
      if (prev.publicUpdatesChannelId && guild.channels.cache.has(prev.publicUpdatesChannelId)) edit.publicUpdatesChannel = prev.publicUpdatesChannelId;
      if (edit.rulesChannel || edit.publicUpdatesChannel) await safe('Przywracanie kanałów Społeczności', () => guild.edit(edit));
    }
  }

  // 2. Reguły AutoMod
  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  for (const id of record.ids.automod) {
    const rule = rules?.get(id);
    if (rule && await safe(`AutoMod „${rule.name}”`, () => rule.delete(reason)) !== null) deleted.automod += 1;
  }

  // 3. Kanały (najpierw zwykłe, potem kategorie)
  for (const id of [...record.ids.channels, ...record.ids.categories]) {
    const channel = guild.channels.cache.get(id);
    if (!channel) continue;
    if (await safe(`Kanał #${channel.name}`, () => channel.delete(reason)) !== null) deleted.channels += 1;
  }

  // 4. Role (od najniższej, żeby nie zablokować się na hierarchii)
  for (const id of [...record.ids.roles].reverse()) {
    const role = guild.roles.cache.get(id);
    if (!role) continue;
    if (await safe(`Rola „${role.name}”`, () => role.delete(reason)) !== null) deleted.roles += 1;
  }

  // 5. Ustawienia serwera sprzed budowy
  const settings = {
    name: prev.name,
    verificationLevel: prev.verificationLevel,
    explicitContentFilter: prev.explicitContentFilter,
    defaultMessageNotifications: prev.defaultMessageNotifications,
    afkTimeout: prev.afkTimeout,
    reason,
  };
  if (guild.features.includes('COMMUNITY')) {
    settings.verificationLevel = Math.max(1, settings.verificationLevel ?? 1);
    settings.explicitContentFilter = 2;
  }
  const existsOrNull = (id) => (id && guild.channels.cache.has(id) && !createdChannels.has(id) ? id : null);
  settings.systemChannel = existsOrNull(prev.systemChannelId);
  settings.afkChannel = existsOrNull(prev.afkChannelId);
  Object.keys(settings).forEach((k) => settings[k] === undefined && delete settings[k]);
  const restored = await safe('Ustawienia serwera', () => guild.edit(settings)) !== null;
  if (prev.everyonePermissions !== undefined) {
    await safe('Uprawnienia @everyone', () => guild.roles.everyone.setPermissions(BigInt(prev.everyonePermissions), reason));
  }

  return { deleted, restored, problems };
}

/** Obsługa przycisków wzu:ask / wzu:yes / wzu:no (bez sesji – sprawdzamy uprawnienia). */
async function handleUndo(interaction, store) {
  const [, action, guildId] = interaction.customId.split(':');
  if (guildId !== interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🔒 Brak uprawnień.', flags: MessageFlags.Ephemeral });
  }
  const busy = store?.lockedBy(guildId);
  if (busy && action === 'yes') {
    return interaction.reply({ content: `⏳ Na serwerze trwa teraz: **${busy}**. Spróbuj cofnąć za chwilę.`, flags: MessageFlags.Ephemeral });
  }
  const record = get(guildId);
  if (!record) {
    return interaction.update({
      embeds: [embed({ title: '↩️ Cofnięcie niedostępne', description: 'Nie mam zapisanych danych o ostatniej budowie (minęły 2 godziny albo bot był restartowany).', color: COLORS.neutral })],
      components: [],
    });
  }
  const c = counts(record);

  if (action === 'ask') {
    return interaction.update({
      embeds: [embed({
        title: '↩️ Cofnąć budowę?',
        color: COLORS.warning,
        description: [
          'Usunę **wszystko, co utworzył kreator**, i przywrócę ustawienia serwera sprzed budowy:',
          `🎭 **${c.roles}** ról • 💬 **${c.channels}** kanałów i kategorii • 🤖 **${c.automod}** reguł AutoMod`,
          '⚙️ nazwa serwera, poziom weryfikacji, filtr multimediów, powiadomienia, uprawnienia @everyone',
          record.wipe ? '\n⚠️ Budowa była w trybie czyszczenia – **usuniętych wcześniej kanałów i ról nie da się przywrócić**. Serwer zostanie pusty.' : '',
        ].join('\n'),
      })],
      components: [row(
        button(`wzu:yes:${guildId}`, 'Tak, cofnij wszystko', { style: ButtonStyle.Danger, emoji: '↩️' }),
        button(`wzu:no:${guildId}`, 'Nie, zostaw', { emoji: '✖️' }),
      )],
    });
  }
  if (action === 'no') {
    return interaction.update({
      embeds: [embed({ title: '✅ Zostawiam serwer bez zmian', description: 'Cofnięcie jest dostępne jeszcze przez jakiś czas – możesz wrócić do tego przycisku.', color: COLORS.success })],
      components: [row(button(`wzu:ask:${guildId}`, 'Cofnij budowę', { emoji: '↩️' }))],
    });
  }
  if (action === 'yes') {
    records.delete(guildId);
    const started = Date.now();
    await interaction.update({ embeds: [embed({ title: '↩️ Cofam budowę…', description: 'To może chwilę potrwać – usuwam kanały i role.', color: COLORS.build })], components: [] });
    store?.lock(guildId, 'cofanie budowy');
    let result;
    try {
      result = await performUndo(interaction.guild, record);
    } finally {
      store?.unlock(guildId);
    }
    log.info(`Cofnięto budowę na ${interaction.guild.name}: ${JSON.stringify(result.deleted)}`);
    const frame = {
      embeds: [embed({
        title: result.problems.length ? '↩️ Cofnięto (z uwagami)' : '↩️ Budowa cofnięta',
        color: result.problems.length ? COLORS.warning : COLORS.success,
        fields: [
          field('🧹 Usunięto', `🎭 ${result.deleted.roles} ról\n💬 ${result.deleted.channels} kanałów i kategorii\n🤖 ${result.deleted.automod} reguł AutoMod`, true),
          field('⚙️ Ustawienia', result.restored ? 'przywrócone' : 'nie udało się przywrócić', true),
          field('⏱️ Czas', formatDuration((Date.now() - started) / 1000), true),
          ...(result.problems.length ? [field(`📝 Uwagi (${result.problems.length})`, result.problems.slice(0, 10).map((p) => `⚠️ ${p}`).join('\n'))] : []),
        ],
        description: 'Możesz uruchomić **/stworz** jeszcze raz i zbudować serwer od nowa.',
      })],
      components: [],
    };
    return interaction.editReply(frame).catch(() => interaction.followUp({ ...frame, flags: MessageFlags.Ephemeral }).catch(() => {}));
  }
  return undefined;
}

module.exports = { remember, get, undoButton, performUndo, handleUndo };
