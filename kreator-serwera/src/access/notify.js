'use strict';

const { EmbedBuilder, WebhookClient } = require('discord.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('powiadomienia');

const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d{17,20}\/[\w-]{20,}$/;

/**
 * Powiadomienia dla sprzedawcy na jego Discordzie: użycie kodu, budowa, cofnięcie, wyjście bota.
 * Kanał wskazujesz w .env: NOTIFY_WEBHOOK_URL (webhook kanału – bot nie musi być na Twoim serwerze)
 * albo NOTIFY_CHANNEL_ID (kanał na serwerze, na którym jest bot).
 */
class Notifier {
  constructor({ webhookUrl = '', channelId = '', client = null } = {}) {
    this.client = client;
    this.channelId = /^\d{17,20}$/.test(channelId) ? channelId : null;
    this.webhook = null;
    if (webhookUrl) {
      try {
        if (!WEBHOOK_RE.test(webhookUrl)) throw new Error('zły adres');
        this.webhook = new WebhookClient({ url: webhookUrl });
      } catch {
        log.warn('NOTIFY_WEBHOOK_URL nie wygląda na webhook Discorda – skopiuj go ponownie (Ustawienia kanału → Integracje → Webhooki).');
      }
    }
    this.sent = [];
  }

  get enabled() {
    return Boolean(this.webhook || this.channelId);
  }

  async send({ title, description = null, color = 0x5865f2, fields = [] }) {
    const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp(new Date());
    if (description) embed.setDescription(description);
    const clean = fields.filter((f) => f && f.value).map((f) => ({ name: f.name, value: String(f.value).slice(0, 1024), inline: f.inline ?? true }));
    if (clean.length) embed.addFields(clean.slice(0, 25));
    this.sent.push(embed.toJSON());
    if (!this.enabled) return false;
    try {
      if (this.webhook) {
        await this.webhook.send({ username: 'Kreator Serwera', embeds: [embed], allowedMentions: { parse: [] } });
      } else {
        const channel = await this.client?.channels.fetch(this.channelId);
        await channel?.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
      return true;
    } catch (err) {
      log.warn(`Nie udało się wysłać powiadomienia: ${err.message}`);
      return false;
    }
  }
}

module.exports = { Notifier, WEBHOOK_RE };
