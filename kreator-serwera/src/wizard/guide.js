'use strict';

const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { BOTS, inviteUrl, fillSetup } = require('../data/bots');
const { clip } = require('./ui');

/**
 * Przewodnik po zbudowanym serwerze: co ustawić dalej, linki do wybranych botów (z zaproszeniem
 * na ten serwer i panelem), weryfikacja, onboarding, emoji. Trafia w wiadomości prywatnej do osoby,
 * która budowała (z przyciskami), i na kanał ekipy (sam tekst – zostaje po usunięciu bota).
 */

const time = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

function buildGuide({ bp, result, guild, leaveAt = null, undoUntil = null }) {
  const ch = (key) => (result.channels?.[key] ? `<#${result.channels[key]}>` : null);
  const role = (key) => (result.roles?.[key] ? `<@&${result.roles[key]}>` : null);
  const name = bp.guild?.name || guild.name;
  const fields = [];

  const staff = ['owner', 'coowner', 'admin', 'mod', 'helper', 'trial'].map(role).filter(Boolean);
  fields.push({
    name: '1️⃣ Ekipa i role',
    value: clip([
      staff.length ? `Nadaj role ekipie: ${staff.join(' ')}` : 'Nadaj role ekipie w Ustawienia serwera → Członkowie.',
      'Role botów (np. MEE6, Dyno) przeciągnij **nad** role, które te boty mają nadawać.',
    ].join('\n'), 1024),
  });

  if (bp.meta?.gate) {
    fields.push({
      name: '2️⃣ Weryfikacja – ważne!',
      value: clip([
        `Nowe osoby widzą tylko ${ch('rules') || '#regulamin'} i ${ch('verify') || '#weryfikacja'}, dopóki nie dostaną roli ${role('member') || 'członka'}.`,
        'Dodaj bota weryfikacyjnego (np. Double Counter albo Captcha.bot – linki niżej, jeśli je wybrałeś) i ustaw w nim tę rolę po weryfikacji.',
      ].join('\n'), 1024),
    });
  }

  if (result.created?.onboarding) {
    fields.push({
      name: '🧭 Onboarding',
      value: `Pytania przy wejściu są gotowe (${result.created.onboarding}). Sprawdź je lub zmień: **Ustawienia serwera → Onboarding**. Discord sam nadaje wybrane role.`,
    });
  }

  for (const key of (bp.bots || []).slice(0, 14)) {
    const b = BOTS[key];
    if (!b) continue;
    fields.push({
      name: `${b.emoji} ${b.name}`,
      value: clip([
        `[➕ Dodaj bota](${inviteUrl(b, guild.id)}) • [⚙️ Strona i panel](${b.site})`,
        ...b.setup.map((line) => `• ${fillSetup(line, ch)}`),
        result.roles?.bots ? `• Nadaj mu rolę ${role('bots')}` : null,
      ].filter(Boolean).join('\n'), 1024),
    });
  }

  if (result.emojis?.length) {
    fields.push({ name: '😀 Emoji serwera', value: clip(`${result.emojis.join(' ')}\nUżywaj ich w wiadomościach i opisach – są w kolorach serwera.`, 1024) });
  }

  const extra = [];
  if (undoUntil && (!leaveAt || leaveAt > Date.now() + 120_000)) extra.push(`↩️ Budowę możesz cofnąć przyciskiem w panelu kreatora do ${time(undoUntil)}.`);
  if (leaveAt) extra.push(`🚪 Bot kreatora opuści serwer ${time(leaveAt)} – serwer działa bez niego.`);
  else extra.push('🧹 `/usun` wyczyści serwer (z kopią zapasową), jeśli zechcesz zacząć od nowa. Bota możesz też po prostu wyrzucić – serwer działa bez niego.');
  extra.push('📝 Regulamin i informacje to zwykłe wiadomości – możesz je usunąć i napisać własne, albo edytować przez bota typu Carl-bot.');
  fields.push({ name: '💡 Dobrze wiedzieć', value: clip(extra.join('\n'), 1024) });

  const embed = new EmbedBuilder()
    .setColor(bp.meta?.embedColor ?? 0x5865f2)
    .setTitle(clip(`📘 Przewodnik – co dalej z serwerem ${name}`, 256))
    .setDescription('Serwer jest zbudowany. Poniżej lista rzeczy, które warto jeszcze ustawić – zajmie to kilka minut.')
    .addFields(fields.slice(0, 25))
    .setFooter({ text: 'Kreator Serwera' })
    .setTimestamp(new Date());

  // Przyciski-linki do dodania botów (tylko w wiadomości prywatnej / panelu).
  const buttons = (bp.bots || []).filter((k) => BOTS[k]).slice(0, 25).map((k) => new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(inviteUrl(BOTS[k], guild.id))
    .setLabel(clip(`Dodaj ${BOTS[k].name}`, 80))
    .setEmoji(BOTS[k].emoji));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

  return { embeds: [embed], components: rows };
}

module.exports = { buildGuide };
