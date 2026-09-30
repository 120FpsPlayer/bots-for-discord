'use strict';

const { PermissionsBitField } = require('discord.js');
const { validateMessage, assertComponentEmojis } = require('./fakeDiscord');

/**
 * Atrapa interakcji Discord dla kreatora. Każda odpowiedź (reply/update/showModal)
 * jest walidowana tak, jak zrobiłby to Discord (limity embedów, komponentów, modali),
 * a kolejność odpowiedzi – jak w discord.js (druga pierwsza odpowiedź albo editReply
 * przed potwierdzeniem rzuca błąd).
 */

function validateModal(modal) {
  const json = modal.toJSON();
  if (!json.custom_id || json.custom_id.length > 100) throw new Error('modal custom_id');
  if (!json.title || json.title.length > 45) throw new Error(`modal title: ${json.title}`);
  if (json.components.length < 1 || json.components.length > 5) throw new Error('modal components 1-5');
  assertComponentEmojis(json.components, 'modal.components');
  for (const label of json.components) {
    if (label.label && label.label.length > 45) throw new Error(`label too long: ${label.label}`);
    if (label.description && label.description.length > 100) throw new Error('label description too long');
    const c = label.component;
    if (c?.value && c.max_length && c.value.length > c.max_length) throw new Error('prefilled value longer than max');
    if (c?.placeholder && c.placeholder.length > 100 && c.type === 4) throw new Error('text input placeholder too long');
  }
  return json;
}

function createInteraction({ guild, userId = '1', customId, values, fields = {}, kind = 'component', permissions = PermissionsBitField.All, channelId = 'origin', commandName = 'stworz', attachment = null, stringOptions = {} }) {
  const state = { replies: [], updates: [], modals: [], edits: [], dms: [], order: [] };
  const record = (bucket) => async (payload) => {
    if (payload.embeds || payload.components) validateMessage(payload);
    state[bucket].push(payload);
    state.order.push(bucket);
    return payload;
  };
  const acknowledged = () => interaction.deferred || interaction.replied;
  /** Pierwsza odpowiedź na interakcję – dozwolona tylko raz (InteractionAlreadyReplied). */
  const first = (bucket, flag) => async (payload) => {
    if (acknowledged()) throw new Error(`${bucket}: interakcja ma już odpowiedź`);
    interaction[flag] = true;
    if (bucket === 'deferred') {
      state.order.push('deferred');
      return undefined;
    }
    return record(bucket)(payload);
  };
  /** Kolejne wiadomości – dopiero po potwierdzeniu interakcji. */
  const later = (bucket) => async (payload) => {
    if (!acknowledged()) throw new Error(`${bucket}: interakcja nie została jeszcze potwierdzona`);
    return record(bucket)(payload);
  };
  const interaction = {
    state,
    customId,
    values,
    commandName: kind === 'command' ? commandName : undefined,
    options: { getAttachment: () => attachment, getString: (name) => stringOptions[name] ?? null },
    guild,
    guildId: guild.id,
    channelId,
    channel: { id: channelId, isThread: () => false },
    user: { id: userId, tag: `user#${userId}`, username: `user${userId}`, send: async (payload) => { state.dms.push(payload); } },
    member: { id: userId, permissions: new PermissionsBitField(permissions), roles: { cache: new Map() } },
    memberPermissions: new PermissionsBitField(permissions),
    replied: false,
    deferred: false,
    createdTimestamp: Date.now(),
    isChatInputCommand: () => kind === 'command',
    isMessageComponent: () => kind === 'component',
    isModalSubmit: () => kind === 'modal',
    isFromMessage: () => kind === 'modal',
    isButton: () => kind === 'component' && values === undefined,
    isStringSelectMenu: () => kind === 'component' && values !== undefined,
    fields: {
      getTextInputValue: (id) => {
        if (!(id in fields)) throw new Error(`no field ${id}`);
        return fields[id];
      },
      getStringSelectValues: (id) => fields[id] ?? [],
      getUploadedFiles: (id) => (Array.isArray(fields[id]) ? new Map(fields[id].map((f, i) => [String(i), f])) : null),
    },
    reply: first('replies', 'replied'),
    update: first('updates', 'replied'),
    editReply: later('edits'),
    deferReply: first('deferred', 'deferred'),
    deferUpdate: first('deferred', 'deferred'),
    followUp: later('replies'),
    showModal: async (modal) => {
      if (acknowledged()) throw new Error('showModal: interakcja ma już odpowiedź');
      interaction.replied = true;
      state.modals.push(validateModal(modal));
    },
  };
  return interaction;
}

/** Wyciąga wszystkie komponenty (w formie JSON) z payloadu. */
function componentsOf(payload) {
  return (payload.components || []).flatMap((row) => (typeof row.toJSON === 'function' ? row.toJSON() : row).components);
}

module.exports = { createInteraction, componentsOf, validateModal };
