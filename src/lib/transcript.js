// Generuje samodzielny plik HTML wyglądający jak kanał Discorda.
const { AttachmentBuilder } = require('discord.js');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function formatContent(text, message) {
  let html = esc(text);
  // bloki kodu i kod w linii
  html = html.replace(/```(?:\w+\n)?([\s\S]*?)```/g, '<pre>$1</pre>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // pogrubienie, kursywa, przekreślenie
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // linki
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // wzmianki
  html = html.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
    const u = message.mentions.users.get(id);
    return `<span class="mention">@${esc(u?.username ?? id)}</span>`;
  });
  html = html.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
    const r = message.guild?.roles.cache.get(id);
    return `<span class="mention">@${esc(r?.name ?? id)}</span>`;
  });
  html = html.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
    const c = message.guild?.channels.cache.get(id);
    return `<span class="mention">#${esc(c?.name ?? id)}</span>`;
  });
  return html.replace(/\n/g, '<br>');
}

function renderEmbed(e) {
  const color = e.hexColor ?? '#202225';
  const fields = (e.fields ?? [])
    .map((f) => `<div class="field${f.inline ? ' inline' : ''}"><div class="fname">${esc(f.name)}</div><div>${esc(f.value).replace(/\n/g, '<br>')}</div></div>`)
    .join('');
  return `<div class="embed" style="border-color:${esc(color)}">
    ${e.author?.name ? `<div class="eauthor">${esc(e.author.name)}</div>` : ''}
    ${e.title ? `<div class="etitle">${esc(e.title)}</div>` : ''}
    ${e.description ? `<div class="edesc">${esc(e.description).replace(/\n/g, '<br>')}</div>` : ''}
    ${fields ? `<div class="fields">${fields}</div>` : ''}
    ${e.image?.url ? `<img class="eimg" src="${esc(e.image.url)}">` : ''}
    ${e.footer?.text ? `<div class="efooter">${esc(e.footer.text)}</div>` : ''}
  </div>`;
}

function renderAttachment(a) {
  if (a.contentType?.startsWith('image/')) {
    return `<a href="${esc(a.url)}" target="_blank"><img class="att-img" src="${esc(a.url)}" alt="${esc(a.name)}"></a>`;
  }
  return `<a class="att-file" href="${esc(a.url)}" target="_blank">📎 ${esc(a.name)} <span>(${(a.size / 1024).toFixed(1)} KB)</span></a>`;
}

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

async function createTranscript(channel, ticket, type) {
  const messages = await fetchAllMessages(channel);
  const guild = channel.guild;
  const participants = new Map();

  const body = messages
    .map((m) => {
      participants.set(m.author.id, (participants.get(m.author.id) ?? 0) + 1);
      const member = guild.members.cache.get(m.author.id);
      const color = member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : '#f2f3f5';
      const name = member?.displayName ?? m.author.globalName ?? m.author.username;
      const date = m.createdAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
      return `<div class="msg">
        <img class="avatar" src="${esc(m.author.displayAvatarURL({ size: 64, extension: 'png' }))}">
        <div class="content">
          <div class="head"><span class="author" style="color:${esc(color)}">${esc(name)}</span>
          ${m.author.bot ? '<span class="bot">BOT</span>' : ''}<span class="time">${esc(date)}</span></div>
          ${m.content ? `<div class="text">${formatContent(m.content, m)}</div>` : ''}
          ${m.embeds.map(renderEmbed).join('')}
          ${[...m.attachments.values()].map(renderAttachment).join('')}
        </div>
      </div>`;
    })
    .join('\n');

  const owner = await channel.client.users.fetch(ticket.ownerId).catch(() => null);
  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transkrypt #${esc(channel.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#313338;color:#dbdee1;font:15px/1.4 "gg sans","Segoe UI",Roboto,Arial,sans-serif}
header{background:#2b2d31;padding:20px 24px;border-bottom:1px solid #1f2023}
header h1{margin:0 0 8px;font-size:20px;color:#f2f3f5}header .meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px;color:#b5bac1}
header b{color:#f2f3f5}main{padding:16px 0}.msg{display:flex;gap:16px;padding:6px 24px}.msg:hover{background:#2e3035}
.avatar{width:40px;height:40px;border-radius:50%;flex:none}.content{min-width:0;flex:1}.head{display:flex;align-items:center;gap:8px}
.author{font-weight:600}.bot{background:#5865f2;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600}
.time{color:#949ba4;font-size:12px}.text{white-space:normal;word-wrap:break-word}a{color:#00a8fc}
code{background:#2b2d31;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:13px}
pre{background:#2b2d31;border:1px solid #1e1f22;padding:8px;border-radius:4px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px}
.mention{background:rgba(88,101,242,.3);color:#c9cdfb;padding:0 2px;border-radius:3px}
.embed{background:#2b2d31;border-left:4px solid;border-radius:4px;padding:10px 14px;margin-top:6px;max-width:520px}
.etitle{font-weight:600;color:#f2f3f5;margin-bottom:4px}.eauthor{font-size:13px;font-weight:600;margin-bottom:4px}.edesc{font-size:14px}
.fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.field{flex:1 1 100%;font-size:14px}.field.inline{flex:1 1 30%}
.fname{font-weight:600;color:#f2f3f5}.efooter{font-size:12px;color:#949ba4;margin-top:8px}.eimg,.att-img{max-width:400px;max-height:300px;border-radius:4px;margin-top:6px;display:block}
.att-file{display:inline-block;margin-top:6px;background:#2b2d31;border:1px solid #1e1f22;padding:8px 12px;border-radius:4px}.att-file span{color:#949ba4;font-size:12px}
footer{text-align:center;color:#949ba4;font-size:12px;padding:16px}
</style></head><body>
<header>
  <h1>🎫 ${esc(guild.name)} · #${esc(channel.name)}</h1>
  <div class="meta">
    <span>Typ: <b>${esc(type?.label ?? ticket.typeId)}</b></span>
    <span>Autor: <b>${esc(owner?.tag ?? ticket.ownerId)}</b></span>
    <span>Otwarty: <b>${esc(new Date(ticket.createdAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }))}</b></span>
    <span>Wiadomości: <b>${messages.length}</b></span>
    <span>Uczestnicy: <b>${participants.size}</b></span>
  </div>
</header>
<main>${body}</main>
<footer>Wygenerowano ${esc(new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }))}</footer>
</body></html>`;

  const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
    name: `transkrypt-${channel.name}.html`,
  });
  return { attachment, messageCount: messages.length, participants };
}

module.exports = { createTranscript };
