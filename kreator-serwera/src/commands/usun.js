'use strict';

const { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

/** /usun – panel czyszczenia serwera (tylko właściciel serwera). */
const data = new SlashCommandBuilder()
  .setName('usun')
  .setDescription('Czyści serwer: kanały, role, AutoMod i więcej – z kopią zapasową (tylko właściciel).')
  .setDescriptionLocalizations({
    'en-US': 'Cleans the server: channels, roles, AutoMod and more – with a backup (owner only).',
    'en-GB': 'Cleans the server: channels, roles, AutoMod and more – with a backup (owner only).',
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

module.exports = { data };
