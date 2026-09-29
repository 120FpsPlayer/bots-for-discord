'use strict';

const { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

/** Jedyna komenda bota: /stworz – otwiera kreator serwera. */
const data = new SlashCommandBuilder()
  .setName('stworz')
  .setDescription('Otwiera kreator, który krok po kroku zbuduje cały serwer (role, kanały, uprawnienia).')
  .setDescriptionLocalizations({
    'en-US': 'Opens a step-by-step wizard that builds your whole server (roles, channels, permissions).',
    'en-GB': 'Opens a step-by-step wizard that builds your whole server (roles, channels, permissions).',
  })
  .addAttachmentOption((option) => option
    .setName('projekt')
    .setDescription('(opcjonalnie) Wczytaj zapisany projekt – plik .json z przycisku „Zapisz projekt”')
    .setDescriptionLocalizations({
      'en-US': '(optional) Load a saved project – the .json file from "Zapisz projekt"',
      'en-GB': '(optional) Load a saved project – the .json file from "Zapisz projekt"',
    })
    .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

module.exports = { data };
