const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const db = require('../lib/db');
const { COLORS, embed, reply, replyError, isStaff, duration } = require('../lib/utils');

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('statystyki')
    .setDescription('Statystyki systemu ticketów')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('pracownik').setDescription('Pokaż statystyki konkretnej osoby z supportu'))
    .addIntegerOption((o) => o.setName('dni').setDescription('Zakres w dniach (domyślnie wszystko)').setMinValue(1).setMaxValue(3650)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyError(interaction, 'Statystyki są dostępne tylko dla zespołu supportu.');

    const days = interaction.options.getInteger('dni');
    const since = days ? Date.now() - days * 86_400_000 : 0;
    const staffUser = interaction.options.getUser('pracownik');
    let tickets = db.tickets((t) => t.guildId === interaction.guild.id && t.createdAt >= since);
    if (staffUser) tickets = tickets.filter((t) => t.claimedBy === staffUser.id || t.closedBy === staffUser.id);

    const open = tickets.filter((t) => t.status === 'open').length;
    const ratings = tickets.filter((t) => t.rating).map((t) => t.rating.stars);
    const responses = tickets.filter((t) => t.firstResponseAt).map((t) => t.firstResponseAt - t.createdAt);
    const resolutions = tickets.filter((t) => t.closedAt).map((t) => t.closedAt - t.createdAt);
    const avgRating = avg(ratings);

    const e = embed(COLORS.brand)
      .setTitle(`📊 Statystyki${staffUser ? ` – ${staffUser.displayName}` : ''}${days ? ` (ostatnie ${days} dni)` : ''}`)
      .addFields(
        { name: 'Wszystkie', value: String(tickets.length), inline: true },
        { name: 'Otwarte', value: String(open), inline: true },
        { name: 'Zamknięte', value: String(tickets.length - open), inline: true },
        {
          name: 'Średnia ocena',
          value: avgRating ? `${'⭐'.repeat(Math.round(avgRating))} **${avgRating.toFixed(2)}**/5 (${ratings.length} ocen)` : 'brak ocen',
          inline: true,
        },
        { name: 'Śr. czas 1. odpowiedzi', value: responses.length ? duration(avg(responses)) : '—', inline: true },
        { name: 'Śr. czas rozwiązania', value: resolutions.length ? duration(avg(resolutions)) : '—', inline: true },
      );

    if (!staffUser) {
      const board = new Map();
      for (const t of tickets) {
        const id = t.claimedBy ?? (t.closedBy && t.closedBy !== t.ownerId ? t.closedBy : null);
        if (!id || id === interaction.client.user.id) continue;
        const entry = board.get(id) ?? { count: 0, stars: [] };
        entry.count += 1;
        if (t.rating) entry.stars.push(t.rating.stars);
        board.set(id, entry);
      }
      const top = [...board.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([id, s], i) => {
          const r = avg(s.stars);
          return `${['🥇', '🥈', '🥉'][i] ?? `**${i + 1}.**`} <@${id}> – ${s.count} ticketów${r ? ` · ⭐ ${r.toFixed(1)}` : ''}`;
        });
      if (top.length) e.addFields({ name: '🏆 Ranking supportu', value: top.join('\n') });
    }

    return reply(interaction, { embeds: [e] });
  },
};
