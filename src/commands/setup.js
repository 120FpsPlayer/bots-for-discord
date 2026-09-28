const { SlashCommandBuilder, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const db = require('../lib/db');
const { embed, COLORS, reply, replyError, isAdmin } = require('../lib/utils');
const { env, ticketRoleIds } = require('../lib/permissions');

const PRIVATE = (guild, staffRoleIds) => [
  { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
  { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ManageChannels'] },
  ...staffRoleIds.map((id) => ({ id, allow: ['ViewChannel', 'ReadMessageHistory'] })),
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Konfiguracja systemu ticketów')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('auto')
        .setDescription('Automatycznie utwórz kategorie i kanały logów/transkryptów')
        .addRoleOption((o) => o.setName('rola_supportu').setDescription('Rola zespołu obsługującego tickety').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('ustaw')
        .setDescription('Ręcznie ustaw opcje (podaj tylko te, które chcesz zmienić)')
        .addChannelOption((o) =>
          o.setName('kategoria').setDescription('Kategoria dla otwartych ticketów').addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) =>
          o
            .setName('kategoria_zamknietych')
            .setDescription('Kategoria, do której trafiają zamknięte tickety')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) => o.setName('kanal_logow').setDescription('Kanał logów').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) =>
          o.setName('kanal_transkryptow').setDescription('Kanał na transkrypty').addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((o) =>
          o.setName('limit').setDescription('Maks. otwartych ticketów na osobę (0 = bez limitu)').setMinValue(0).setMaxValue(25),
        )
        .addIntegerOption((o) =>
          o
            .setName('auto_zamkniecie_h')
            .setDescription('Po ilu godzinach bez odpowiedzi autora zamknąć ticket (0 = wyłączone)')
            .setMinValue(0)
            .setMaxValue(720),
        )
        .addIntegerOption((o) =>
          o
            .setName('ostrzezenie_h')
            .setDescription('Po ilu godzinach wysłać ostrzeżenie o zamknięciu (0 = wyłączone)')
            .setMinValue(0)
            .setMaxValue(720),
        )
        .addBooleanOption((o) => o.setName('ping_supportu').setDescription('Oznaczać rolę supportu przy nowym tickecie?')),
    )
    .addSubcommand((s) =>
      s
        .setName('rola-dodaj')
        .setDescription('Dodaj rolę zespołu supportu')
        .addRoleOption((o) => o.setName('rola').setDescription('Rola').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('rola-usun')
        .setDescription('Usuń rolę zespołu supportu')
        .addRoleOption((o) => o.setName('rola').setDescription('Rola').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('pokaz').setDescription('Pokaż aktualną konfigurację')),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) return replyError(interaction, 'Tę komendę mogą używać tylko administratorzy bota (OWNER_IDS / ADMIN_ROLE_IDS).');
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'auto') {
      const role = interaction.options.getRole('rola_supportu');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const staff = [...new Set([...db.settings(guild.id).staffRoleIds, role.id])];
      const everyoneHidden = [{ id: guild.roles.everyone.id, deny: ['ViewChannel'] }];

      const category = await guild.channels.create({
        name: '🎫 Tickety',
        type: ChannelType.GuildCategory,
        permissionOverwrites: everyoneHidden,
      });
      const closed = await guild.channels.create({
        name: '📁 Zamknięte tickety',
        type: ChannelType.GuildCategory,
        permissionOverwrites: everyoneHidden,
      });
      const logs = await guild.channels.create({
        name: 'ticket-logi',
        type: ChannelType.GuildText,
        parent: closed.id,
        permissionOverwrites: PRIVATE(guild, ticketRoleIds(staff).filter((id) => guild.roles.cache.has(id))),
      });
      const transcripts = await guild.channels.create({
        name: 'ticket-transkrypty',
        type: ChannelType.GuildText,
        parent: closed.id,
        permissionOverwrites: PRIVATE(guild, ticketRoleIds(staff).filter((id) => guild.roles.cache.has(id))),
      });

      db.updateSettings(guild.id, {
        staffRoleIds: staff,
        categoryId: category.id,
        closedCategoryId: closed.id,
        logChannelId: logs.id,
        transcriptChannelId: transcripts.id,
      });

      return reply(interaction, {
        embeds: [
          embed(COLORS.success)
            .setTitle('✅ Gotowe!')
            .setDescription(
              `Utworzono:\n• ${category} – otwarte tickety\n• ${closed} – zamknięte tickety\n• ${logs} – logi\n• ${transcripts} – transkrypty\n\n` +
                `Rola supportu: ${role}\n\nTeraz użyj **/panel** na kanale, na którym ma pojawić się panel ticketów.`,
            ),
        ],
      });
    }

    if (sub === 'ustaw') {
      const o = interaction.options;
      const patch = {};
      const map = {
        kategoria: ['categoryId', () => o.getChannel('kategoria')?.id],
        kategoria_zamknietych: ['closedCategoryId', () => o.getChannel('kategoria_zamknietych')?.id],
        kanal_logow: ['logChannelId', () => o.getChannel('kanal_logow')?.id],
        kanal_transkryptow: ['transcriptChannelId', () => o.getChannel('kanal_transkryptow')?.id],
        limit: ['maxOpenTicketsPerUser', () => o.getInteger('limit')],
        auto_zamkniecie_h: ['autoCloseHours', () => o.getInteger('auto_zamkniecie_h')],
        ostrzezenie_h: ['autoCloseWarningHours', () => o.getInteger('ostrzezenie_h')],
        ping_supportu: ['pingStaffOnOpen', () => o.getBoolean('ping_supportu')],
      };
      for (const [option, [key, get]] of Object.entries(map)) {
        const value = get();
        if (value !== undefined && value !== null) patch[key] = value;
      }
      if (Object.keys(patch).length === 0) return replyError(interaction, 'Nie podano żadnej opcji do zmiany.');
      db.updateSettings(guild.id, patch);
      return reply(interaction, { embeds: [summary(guild).setTitle('✅ Zapisano konfigurację')] });
    }

    if (sub === 'rola-dodaj' || sub === 'rola-usun') {
      const role = interaction.options.getRole('rola');
      const current = db.settings(guild.id).staffRoleIds;
      const next = sub === 'rola-dodaj' ? [...new Set([...current, role.id])] : current.filter((id) => id !== role.id);
      db.updateSettings(guild.id, { staffRoleIds: next });
      return reply(
        interaction,
        `${sub === 'rola-dodaj' ? 'Dodano' : 'Usunięto'} rolę ${role}. ` +
          '\n-# Uprawnienia w już istniejących ticketach nie zmieniają się automatycznie.',
      );
    }

    return reply(interaction, { embeds: [summary(guild)] });
  },
};

function summary(guild) {
  const s = db.settings(guild.id);
  const ch = (id) => (id ? `<#${id}>` : '*nie ustawiono*');
  const roles = (list) => list.map((id) => `<@&${id}>`).join(', ') || '*brak*';
  return embed(COLORS.info)
    .setTitle('⚙️ Konfiguracja ticketów')
    .addFields(
      { name: 'Kategoria ticketów', value: ch(s.categoryId), inline: true },
      { name: 'Kategoria zamkniętych', value: ch(s.closedCategoryId), inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'Kanał logów', value: ch(s.logChannelId), inline: true },
      { name: 'Kanał transkryptów', value: ch(s.transcriptChannelId), inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'Role supportu (/setup)', value: roles(s.staffRoleIds) },
      { name: '👑 Właściciele bota (.env)', value: env.ownerIds.map((id) => `<@${id}>`).join(', ') || '*brak*', inline: true },
      { name: '🛡️ Role adminów (.env)', value: roles(env.adminRoleIds), inline: true },
      { name: '🎧 Role supportu (.env)', value: roles(env.supportRoleIds), inline: true },
      { name: '✅ Kto może otwierać', value: env.openRoleIds.length ? roles(env.openRoleIds) : 'wszyscy', inline: true },
      { name: '⛔ Zablokowane role', value: roles(env.blockedRoleIds), inline: true },
      {
        name: '🔧 Opcje',
        value:
          `Admini Discorda = admini bota: **${env.discordAdminsAreAdmins ? 'tak' : 'nie'}**\n` +
          `Support może usuwać: **${env.staffCanDelete ? 'tak' : 'nie'}**\n` +
          `Autor może zamknąć: **${env.ownerCanClose ? 'tak' : 'nie'}**`,
        inline: true,
      },
      { name: 'Limit na osobę', value: s.maxOpenTicketsPerUser ? String(s.maxOpenTicketsPerUser) : 'bez limitu', inline: true },
      {
        name: 'Auto-zamykanie',
        value: s.autoCloseHours ? `po ${s.autoCloseHours} h (ostrzeżenie po ${s.autoCloseWarningHours} h)` : 'wyłączone',
        inline: true,
      },
      { name: 'Ping supportu', value: s.pingStaffOnOpen ? 'tak' : 'nie', inline: true },
    );
}
