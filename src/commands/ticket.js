const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const config = require('../lib/config');
const db = require('../lib/db');
const t = require('../lib/tickets');
const { COLORS, PRIORITIES, embed, reply, replyError, isStaff, slug, ts, duration } = require('../lib/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Zarządzanie ticketem na bieżącym kanale')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('dodaj')
        .setDescription('Dodaj osobę do ticketu')
        .addUserOption((o) => o.setName('uzytkownik').setDescription('Kogo dodać').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('usun')
        .setDescription('Usuń osobę z ticketu')
        .addUserOption((o) => o.setName('uzytkownik').setDescription('Kogo usunąć').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('przejmij').setDescription('Przejmij obsługę ticketu'))
    .addSubcommand((s) => s.setName('odpusc').setDescription('Przestań obsługiwać ticket'))
    .addSubcommand((s) =>
      s
        .setName('zamknij')
        .setDescription('Zamknij ticket')
        .addStringOption((o) => o.setName('powod').setDescription('Powód zamknięcia').setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName('priorytet')
        .setDescription('Ustaw priorytet ticketu')
        .addStringOption((o) =>
          o
            .setName('poziom')
            .setDescription('Poziom priorytetu')
            .setRequired(true)
            .addChoices(...Object.entries(PRIORITIES).map(([value, p]) => ({ name: `${p.emoji} ${p.label}`, value }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('nazwa')
        .setDescription('Zmień nazwę kanału ticketu')
        .addStringOption((o) => o.setName('nowa_nazwa').setDescription('Nowa nazwa').setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((s) => s.setName('info').setDescription('Informacje o tickecie')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { channel, member } = interaction;
    const ticket = db.getTicket(channel.id);
    if (!ticket) return replyError(interaction, 'Tej komendy można użyć tylko na kanale ticketu.');

    const type = config.getType(ticket.typeId);
    const staff = isStaff(member, type);
    const isOwner = ticket.ownerId === member.id;

    if (sub === 'zamknij') {
      if (!staff && !isOwner) return replyError(interaction, 'Nie masz uprawnień do zamknięcia tego ticketu.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await t.closeTicket(channel, member, interaction.options.getString('powod'));
      return reply(interaction, 'Ticket został zamknięty.');
    }

    if (sub === 'info') {
      const p = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
      return reply(interaction, {
        embeds: [
          embed(p.color)
            .setTitle(`🎫 Ticket #${String(ticket.number).padStart(4, '0')}`)
            .addFields(
              { name: 'Typ', value: `${type?.emoji ?? ''} ${type?.label ?? ticket.typeId}`, inline: true },
              { name: 'Status', value: ticket.status === 'open' ? '🟢 otwarty' : '🔴 zamknięty', inline: true },
              { name: 'Priorytet', value: `${p.emoji} ${p.label}`, inline: true },
              { name: 'Autor', value: `<@${ticket.ownerId}>`, inline: true },
              { name: 'Przejęty przez', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
              { name: 'Dodane osoby', value: ticket.participants.map((id) => `<@${id}>`).join(', ') || '—', inline: true },
              { name: 'Utworzony', value: `${ts(ticket.createdAt)} (${ts(ticket.createdAt, 'R')})`, inline: true },
              {
                name: 'Pierwsza odpowiedź',
                value: ticket.firstResponseAt ? `po ${duration(ticket.firstResponseAt - ticket.createdAt)}` : 'brak',
                inline: true,
              },
              { name: 'Ostatnia aktywność', value: ts(ticket.lastActivity, 'R'), inline: true },
            ),
        ],
      });
    }

    if (!staff) return replyError(interaction, 'Ta komenda jest dostępna tylko dla zespołu supportu.');

    switch (sub) {
      case 'dodaj':
        await t.addUser(channel, interaction.options.getUser('uzytkownik'), member);
        return reply(interaction, 'Dodano użytkownika.');
      case 'usun':
        await t.removeUser(channel, interaction.options.getUser('uzytkownik'), member);
        return reply(interaction, 'Usunięto użytkownika.');
      case 'przejmij':
        await t.claimTicket(channel, member);
        return reply(interaction, 'Przejąłeś ticket.');
      case 'odpusc':
        await t.unclaimTicket(channel, member);
        return reply(interaction, 'Nie obsługujesz już tego ticketu.');
      case 'priorytet':
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await t.setPriority(channel, interaction.options.getString('poziom'), member);
        return reply(interaction, 'Zmieniono priorytet.');
      case 'nazwa': {
        const name = slug(interaction.options.getString('nowa_nazwa'), 90);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await t.renameTicket(channel, name);
        return reply(interaction, `Zmieniono nazwę na \`${name}\`.`);
      }
    }
  },
};
