'use strict';

const crypto = require('node:crypto');
const {
  EmbedBuilder, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { isSafeSelfRole } = require('./guards');
const { createLogger } = require('../utils/logger');

const log = createLogger('weryfikacja');

/**
 * Przycisk „Zweryfikuj się”. Działa bez bazy danych – ustawienia są w customId:
 *   vf:<język>:<idRoli>[:<opcje>]
 * opcje (sklejone, bez separatorów):
 *   q          – pytanie kontrolne (anty-bot) w okienku,
 *   a<dni>     – minimalny wiek konta Discord w dniach,
 *   l<idKanału> – kanał, na który trafia log weryfikacji.
 * Odpowiedź na pytanie kontrolne wraca jako modal:
 *   vfq:<język>:<idRoli>:<opcje>:<a>:<b>:<podpis>
 * Podpis (HMAC) pilnuje, żeby nikt nie podmienił pytania na własne.
 */

const SECRET = crypto.randomBytes(32);
const DAY = 86_400_000;

function parseOptions(raw = '') {
  return {
    captcha: raw.includes('q'),
    minAgeDays: Number(raw.match(/a(\d{1,3})/)?.[1] || 0),
    logChannelId: raw.match(/l(\d{17,20})/)?.[1] || null,
  };
}

/** Buduje customId przycisku weryfikacji (używane przy publikowaniu panelu). */
function verifyButtonId(lang, roleId, { captcha = false, minAgeDays = 0, logChannelId = null } = {}) {
  const opts = `${captcha ? 'q' : ''}${minAgeDays ? `a${minAgeDays}` : ''}${logChannelId ? `l${logChannelId}` : ''}`;
  return `vf:${lang}:${roleId}${opts ? `:${opts}` : ''}`;
}

function sign(...parts) {
  return crypto.createHmac('sha256', SECRET).update(parts.join('|')).digest('base64url').slice(0, 10);
}

function ephemeral(interaction, description, color) {
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setDescription(description)], flags: MessageFlags.Ephemeral });
}

async function logVerification(interaction, channelId, { ok, reason, T }) {
  if (!channelId) return;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.()) return;
  const { user } = interaction;
  const embed = new EmbedBuilder()
    .setColor(ok ? 0x57f287 : 0xfee75c)
    .setAuthor({ name: user.tag ?? user.username, iconURL: user.displayAvatarURL?.() })
    .setDescription(ok
      ? T(`✅ ${user} przeszedł weryfikację.`, `✅ ${user} passed verification.`)
      : T(`⚠️ ${user} nie przeszedł weryfikacji: ${reason}`, `⚠️ ${user} failed verification: ${reason}`))
    .addFields({ name: T('Konto założone', 'Account created'), value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true })
    .setFooter({ text: `ID: ${user.id}` })
    .setTimestamp(new Date());
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => log.debug('Log weryfikacji nieudany:', err?.message));
}

/** Wspólne sprawdzenia: rola istnieje, jest bezpieczna, użytkownik nie jest już zweryfikowany. */
function checkRole(interaction, roleId, T) {
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return { error: T('❌ Rola weryfikacyjna nie istnieje. Poinformuj administrację serwera.', '❌ The verification role no longer exists. Please tell the staff.') };
  if (!isSafeSelfRole(role)) {
    return { error: T('❌ Nie mogę nadać tej roli (jest powyżej mojej roli lub ma uprawnienia moderacyjne). Poinformuj administrację.', '❌ I cannot assign this role (it is above my role or has moderation permissions). Please tell the staff.') };
  }
  if (interaction.member.roles.cache.has(role.id)) return { done: true, role };
  return { role };
}

async function grant(interaction, role, opts, T) {
  const member = interaction.member;
  await member.roles.add(role, T('Weryfikacja przyciskiem', 'Button verification'));
  await logVerification(interaction, opts.logChannelId, { ok: true, T });
  return ephemeral(interaction,
    T(`🎉 **Witaj na serwerze, ${member.displayName}!**\nWeryfikacja zakończona – masz już dostęp do wszystkich kanałów.`,
      `🎉 **Welcome, ${member.displayName}!**\nYou are verified and can now see all channels.`),
    0x57f287);
}

/** Kliknięcie przycisku „Zweryfikuj się”. */
async function handleVerification(interaction) {
  const [, lang, roleId, rawOpts] = interaction.customId.split(':');
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const opts = parseOptions(rawOpts);

  const check = checkRole(interaction, roleId, T);
  if (check.error) return ephemeral(interaction, check.error, 0xed4245);
  if (check.done) return ephemeral(interaction, T('✅ Jesteś już zweryfikowany – miłego pobytu!', '✅ You are already verified – enjoy your stay!'), 0x57f287);

  if (opts.minAgeDays) {
    const ageMs = Date.now() - interaction.user.createdTimestamp;
    if (ageMs < opts.minAgeDays * DAY) {
      const readyAt = Math.floor((interaction.user.createdTimestamp + opts.minAgeDays * DAY) / 1000);
      await logVerification(interaction, opts.logChannelId, { ok: false, reason: T(`konto młodsze niż ${opts.minAgeDays} dni`, `account younger than ${opts.minAgeDays} days`), T });
      return ephemeral(interaction,
        T(`⏳ Twoje konto Discord jest za młode. Na tym serwerze konto musi mieć co najmniej **${opts.minAgeDays} dni**.\nSpróbuj ponownie <t:${readyAt}:R>.`,
          `⏳ Your Discord account is too new. Accounts must be at least **${opts.minAgeDays} days** old.\nTry again <t:${readyAt}:R>.`),
        0xfee75c);
    }
  }

  if (opts.captcha) {
    const a = crypto.randomInt(2, 10);
    const b = crypto.randomInt(2, 10);
    const sig = sign(interaction.user.id, roleId, a, b);
    const modal = new ModalBuilder()
      .setCustomId(`vfq:${lang}:${roleId}:${rawOpts || '-'}:${a}:${b}:${sig}`)
      .setTitle(T('Weryfikacja', 'Verification'))
      .addLabelComponents(new LabelBuilder()
        .setLabel(T(`Ile to ${a} + ${b}?`, `What is ${a} + ${b}?`))
        .setDescription(T('Wpisz wynik cyframi, np. 12', 'Type the result as a number, e.g. 12'))
        .setTextInputComponent(new TextInputBuilder().setCustomId('answer').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4)));
    return interaction.showModal(modal);
  }

  return grant(interaction, check.role, opts, T);
}

/** Odpowiedź na pytanie kontrolne. */
async function handleVerificationAnswer(interaction) {
  const [, lang, roleId, rawOpts, a, b, sig] = interaction.customId.split(':');
  const T = (pl, en) => (lang === 'en' ? en : pl);
  const opts = parseOptions(rawOpts === '-' ? '' : rawOpts);
  if (sig !== sign(interaction.user.id, roleId, a, b)) {
    return ephemeral(interaction, T('⌛ To pytanie wygasło – kliknij przycisk weryfikacji jeszcze raz.', '⌛ This question expired – click the verification button again.'), 0xfee75c);
  }
  let answer = '';
  try {
    answer = interaction.fields.getTextInputValue('answer').trim();
  } catch {
    answer = '';
  }
  if (Number.parseInt(answer, 10) !== Number(a) + Number(b)) {
    await logVerification(interaction, opts.logChannelId, { ok: false, reason: T('zła odpowiedź na pytanie kontrolne', 'wrong answer to the check question'), T });
    return ephemeral(interaction, T('❌ Zła odpowiedź. Kliknij przycisk weryfikacji i spróbuj jeszcze raz.', '❌ Wrong answer. Click the verification button and try again.'), 0xed4245);
  }
  const check = checkRole(interaction, roleId, T);
  if (check.error) return ephemeral(interaction, check.error, 0xed4245);
  if (check.done) return ephemeral(interaction, T('✅ Jesteś już zweryfikowany – miłego pobytu!', '✅ You are already verified – enjoy your stay!'), 0x57f287);
  return grant(interaction, check.role, opts, T);
}

module.exports = { handleVerification, handleVerificationAnswer, verifyButtonId, parseOptions };
