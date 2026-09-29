'use strict';

const { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

/** /stworz – otwiera kreator serwera (albo przywraca projekt / kopię zapasową z pliku). */
const data = new SlashCommandBuilder()
  .setName('stworz')
  .setDescription('Otwiera kreator, który krok po kroku zbuduje cały serwer (role, kanały, uprawnienia).')
  .setDescriptionLocalizations({
    'en-US': 'Opens a step-by-step wizard that builds your whole server (roles, channels, permissions).',
    'en-GB': 'Opens a step-by-step wizard that builds your whole server (roles, channels, permissions).',
  })
  .addAttachmentOption((option) => option
    .setName('projekt')
    .setDescription('(opcjonalnie) Plik .json: zapisany projekt albo kopia zapasowa z /usun')
    .setDescriptionLocalizations({
      'en-US': '(optional) .json file: a saved project or a backup from /usun',
      'en-GB': '(optional) .json file: a saved project or a backup from /usun',
    })
    .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

module.exports = { data };
