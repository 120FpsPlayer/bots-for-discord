const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { COLORS, embed, reply, isStaff, isAdmin } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomoc')
    .setDescription('Lista komend systemu ticketów')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const member = interaction.member;
    const e = embed(COLORS.brand)
      .setTitle('📖 Pomoc – system ticketów')
      .setDescription('Aby otworzyć ticket, skorzystaj z **panelu ticketów** na serwerze i wybierz kategorię.')
      .addFields({
        name: '👤 Dla wszystkich',
        value: [
          '`/ticket info` – szczegóły ticketu',
          '`/ticket zamknij` – zamknij swój ticket',
          '🔔 **Wezwij support** – przycisk w tickecie, gdy długo czekasz na odpowiedź',
        ].join('\n'),
      });
    if (isStaff(member)) {
      e.addFields({
        name: '🎧 Support',
        value: [
          '`/ticket przejmij` · `/ticket odpusc` – obsługa ticketu',
          '`/ticket dodaj` · `/ticket usun` – osoby w tickecie (albo menu w karcie ticketu)',
          '`/ticket priorytet` · `/ticket przenies` · `/ticket nazwa`',
          '`/ticket prosba-zamkniecia` – autor potwierdza rozwiązanie',
          '`/odpowiedz` – gotowe odpowiedzi',
          '`/blacklist` – blokady · `/statystyki` – statystyki i ranking',
        ].join('\n'),
      });
    }
    if (isAdmin(member)) {
      e.addFields({
        name: '🛡️ Administracja',
        value: ['`/setup auto` – automatyczna konfiguracja', '`/setup ustaw` · `/setup pokaz` · `/setup rola-dodaj`', '`/panel` – wyślij panel ticketów'].join('\n'),
      });
    }
    return reply(interaction, { embeds: [e] });
  },
};
