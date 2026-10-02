# 🎫 Ticket Bot – a ticket system for Discord

A support ticket bot built with **discord.js v14**. Fully in English. Data is stored in a file, so you don't need a database – Node.js is all it takes.

---

## 📑 Table of contents

1. [What the bot can do](#-what-the-bot-can-do)
2. [Step 1 – create the bot on Discord](#-step-1--create-the-bot-on-discord)
3. [Step 2 – invite the bot to your server](#-step-2--invite-the-bot-to-your-server)
4. [Step 3 – upload the files and fill in `.env`](#-step-3--upload-the-files-and-fill-in-env)
5. [Step 4 – start the bot](#-step-4--start-the-bot)
6. [Step 5 – set up your server](#-step-5--set-up-your-server)
7. [The `.env` file – all options](#-the-env-file--all-options)
8. [The `config.json` file – look and categories](#-the-configjson-file--look-and-categories)
9. [Commands](#-commands)
10. [How a ticket works – step by step](#-how-a-ticket-works--step-by-step)
11. [Updating the bot](#-updating-the-bot)
12. [Common problems](#-common-problems)
13. [File structure](#-file-structure)

---

## ✨ What the bot can do

### 🎨 Look
- **Modern Discord cards (Components V2):** colored frames, avatars next to text and separators.
- **Ticket panel:** banner, server logo, rules and a separate card with a button for every category (or a dropdown list).
- **Live panel:** shows 🟢/🌙 support working hours, ⏱️ average response time and 📨 the number of open tickets. It refreshes a few seconds after every change and every 5 minutes.
- **Ticket card:** author's avatar, form answers, status, priority (frame color), who is handling it, added members, account age, server join date and number of previous tickets.
- **Closed card:** duration, first response time, who handled it, message count and a button to download the transcript.
- **Discord-style HTML transcript:** stats, form answers, day separators, grouped messages, replies (↪), AUTHOR / SUPPORT / BOT tags and stickers.

### 🎧 For staff
- **⚙️ Menu in the ticket card:** change priority, ask the author to close, move to another category.
- **➕ "Add someone" list:** up to 5 people at once.
- **Claiming tickets:** the author sees a "🙋 X will take care of your ticket" card.
- **Close requests:** the author clicks "✅ Yes, close it" or "✋ No, I still need help".
- **Canned replies** with `/reply` and autocomplete.
- **Statistics:** average rating, rating breakdown, response times, per-category split, weekly trend and a 🥇🥈🥉 leaderboard.

### 👤 For users
- **A form before opening** (up to 5 questions per category).
- **A DM after opening** with a "Go to ticket" button.
- **🔔 Call support** when nobody has replied for a while (with a cooldown).
- **Support rating** of 1–5 ⭐ in DMs, with a comment and the transcript attached.
- **"✋ I still need help":** cancels automatic closing.

### 🛡️ Safety
- **Smart auto-close:** only closes tickets where staff replied and the author went silent. It sends a warning first.
- **Anti-spam:** a cooldown between tickets, a limit of open tickets and a blacklist.
- **Roles in `.env`:** any number of roles for owners, admins, staff, who can open tickets and blocked roles.
- **Logs** of every action, with avatars and buttons.

---

## 🤖 Step 1 – create the bot on Discord

1. Go to <https://discord.com/developers/applications> and click **New Application**.
2. On the **General Information** tab, copy the **Application ID**. This is your `CLIENT_ID`.
3. On the **Bot** tab:
   - click **Reset Token** and copy the token. This is your `DISCORD_TOKEN`. **Never share it with anyone!**
   - enable **Message Content Intent**. Without it, transcripts will be empty.

## 📨 Step 2 – invite the bot to your server

1. On the **OAuth2 → URL Generator** tab, tick `bot` and `applications.commands`.
2. Under permissions, tick **Administrator** (easiest) or at least:
   `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Manage Messages`.
3. Open the generated link and add the bot to your server.
4. In **Server Settings → Roles**, drag the bot's role **above** the staff roles.

## 📁 Step 3 – upload the files and fill in `.env`

1. Unzip the ZIP (on your computer or in your host's file manager).
2. Copy the **`.env.example`** file and name the copy **`.env`**.
3. Fill in at least:
   ```env
   DISCORD_TOKEN=your_token
   CLIENT_ID=application_id
   GUILD_ID=your_server_id
   SUPPORT_ROLE_IDS=support_role_id
   ```
   All options are described in [The `.env` file](#-the-env-file--all-options).

> 💡 **How do I copy an ID?** In Discord: *Settings → Advanced → Developer Mode* (turn it on). Then right-click a server, role or person and choose **Copy ID**.

## ▶️ Step 4 – start the bot

### On a host (Wispbyte, Pterodactyl, etc.)
1. Set **`index.js`** as the **startup file** (main file).
2. Click **Start**. The panel installs the libraries from `package.json` on its own. If the console shows `Cannot find module 'discord.js'`, type `npm install` in the console.
3. The bot **registers its commands automatically** on startup. With `GUILD_ID` set they appear instantly, without it after about an hour.

### On your computer
You need Node.js **18.17 or newer** (<https://nodejs.org>).
```bash
npm install
npm start
```

After startup, the console will show something like:
```
✅ Logged in as TicketBot#1234 · servers: 1 · commands: 7
🔐 SUPPORT_ROLE_IDS: 3 roles → @Helper, @Moderator, @Support
✅ Registered commands on server 123456789012345678.
```
If any role shows **⚠️ no such role on the server**, that ID in `.env` is wrong.

## ⚙️ Step 5 – set up your server

On your Discord server, run:
```
/setup auto support_role:@Support
```
The bot will create:
- a **🎫 Tickets** category for open tickets,
- a **📁 Closed tickets** category,
- a **#ticket-logs** channel,
- a **#ticket-transcripts** channel.

Then, in the channel where the panel should appear, run:
```
/panel
```
Done! 🎉 Users can now open tickets.

> You can also set the channels manually with `/setup set` or in `.env`. Check the current configuration with `/setup show`.

---

## 🔐 The `.env` file – all options

### Bot

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | The bot token (Step 1). **Required.** |
| `CLIENT_ID` | The bot's Application ID (Step 1). **Required.** |
| `GUILD_ID` | Your server ID. With it, commands appear instantly. Empty = global commands (appear after about an hour). |
| `AUTO_DEPLOY_COMMANDS` | `true` = the bot registers commands on startup. `false` = register them manually with `npm run deploy`. |

### Permissions and roles

In **every** field you can enter **as many roles as you like**. Separate them with commas:
```env
SUPPORT_ROLE_IDS=111111111111111111,222222222222222222,333333333333333333
```
Spaces, semicolons, quotes and copied role mentions `<@&111…>` work too. You can also use the singular name, e.g. `SUPPORT_ROLE_ID`. Roles from both fields are combined.

| Variable | Who it is | What they can do |
|---|---|---|
| `OWNER_IDS` | 👑 **Bot owners** (**user** IDs, not roles) | Everything |
| `ADMIN_ROLE_IDS` | 🛡️ **Administrators** | `/setup`, `/panel`, `/blacklist`, deleting tickets, taking over other people's tickets. They see all tickets. |
| `SUPPORT_ROLE_IDS` | 🎧 **Staff** | See and handle all tickets: claim, close, add people, change priority, send canned replies, view stats. |
| `SUPPORT_ROLE_IDS_SUPPORT` | 🎧 Staff for the **General Support** category only | Same, but only in that category |
| `SUPPORT_ROLE_IDS_REPORT` | 🎧 Staff for the **Report a Player** category only | Same as above |
| `SUPPORT_ROLE_IDS_PARTNERSHIP` | 🎧 Staff for the **Partnership** category only | Same as above |
| `SUPPORT_ROLE_IDS_APPEAL` | 🎧 Staff for the **Punishment Appeal** category only | Same as above |
| `OPEN_ROLE_IDS` | ✅ **Who can open tickets** | Empty = everyone. E.g. a "Verified" role. Admins and owners can always open tickets. |
| `BLOCKED_ROLE_IDS` | ⛔ **Who can NOT open tickets** | E.g. a "Muted" role |

> If you add your own category in `config.json`, e.g. with `"id": "purchases"`, set its staff roles with `SUPPORT_ROLE_IDS_PURCHASES=...`. The name is `SUPPORT_ROLE_IDS_` + the category id in **UPPERCASE** (replace `-` with `_`).

You can also add staff roles with `/setup role-add`. Roles from `.env` and from the command are combined.

### Behavior options

| Variable | Default | Description |
|---|---|---|
| `DISCORD_ADMINS_ARE_ADMINS` | `true` | People with the Discord *Administrator* / *Manage Server* permission are bot admins. `false` = access comes **only** from `.env`. |
| `STAFF_CAN_DELETE` | `true` | `false` = only admins can delete tickets. |
| `OWNER_CAN_CLOSE` | `true` | Whether the author can close their own ticket. |

### Channels (optional)

Instead of `/setup`, you can enter channel IDs here. If both are set, `/setup` wins.

| Variable | Description |
|---|---|
| `TICKET_CATEGORY_ID` | Category for open tickets |
| `CLOSED_CATEGORY_ID` | Category for closed tickets |
| `LOG_CHANNEL_ID` | Log channel |
| `TRANSCRIPT_CHANNEL_ID` | Transcript channel |

### Example of a filled-in `.env`

```env
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GAbCdE.xxxxxxxxxxxxxxxxxxxxxxxx
CLIENT_ID=123456789012345678
GUILD_ID=234567890123456789

OWNER_IDS=345678901234567890
ADMIN_ROLE_IDS=456789012345678901,567890123456789012
SUPPORT_ROLE_IDS=678901234567890123,789012345678901234,890123456789012345
SUPPORT_ROLE_IDS_REPORT=901234567890123456,112233445566778899
OPEN_ROLE_IDS=998877665544332211
BLOCKED_ROLE_IDS=887766554433221100

DISCORD_ADMINS_ARE_ADMINS=true
STAFF_CAN_DELETE=false
OWNER_CAN_CLOSE=true

AUTO_DEPLOY_COMMANDS=true
```

> ⚠️ **Restart the bot** after every change to `.env`.

---

## 🎨 The `config.json` file – look and categories

### `brand`
| Field | Description |
|---|---|
| `name` | Name shown in the panel and the bot's status |
| `color` | Main color, e.g. `"#5865F2"` |
| `footer` | Embed footer (logs, DMs) |
| `logo` | Link to a logo for the panel. `null` = server icon |

### `panel` – the ticket panel
| Field | Description |
|---|---|
| `title` | Panel title |
| `description` | Text under the title |
| `rules` | List of rules in the "📌 Before you open a ticket" section |
| `image` | Link to a banner (image above the panel). `null` = no banner |
| `buttonLabel` | Text on the category buttons, e.g. `"Open"` |
| `showStats` | `true` = show average response time and number of open tickets |

### `workingHours` – support working hours
| Field | Description |
|---|---|
| `enabled` | `true` / `false` |
| `timezone` | Time zone, e.g. `"UTC"`, `"Europe/London"`, `"America/New_York"`. Also used for dates in transcripts. |
| `days` | Working days: `0` = Sunday, `1` = Monday … `6` = Saturday |
| `from` / `to` | Hours, e.g. `"10:00"` and `"22:00"` |

Outside working hours, the panel and new tickets show "🌙 We're outside working hours…".

### `channelNameFormat` – channel names
Default: `"{prio}{prefix}-{number}"`, which gives e.g. `support-0001`, or `🔴support-0001` for urgent priority.
Available variables: `{prio}`, `{prefix}`, `{number}`, `{user}` (the author's name).

### `ticketTypes` – ticket categories
```json
{
  "id": "support",
  "label": "General Support",
  "emoji": "🛠️",
  "description": "Questions and technical issues",
  "channelPrefix": "support",
  "staffRoleIds": [],
  "questions": [
    { "id": "subject", "label": "Subject", "style": "short", "placeholder": "E.g. my role is not working", "required": true, "maxLength": 100 },
    { "id": "details", "label": "Describe the issue in detail", "style": "paragraph", "required": true, "maxLength": 1000 }
  ]
}
```
| Field | Description |
|---|---|
| `id` | Unique identifier: lowercase letters, digits, `_`, `-` |
| `label` / `emoji` / `description` | How it looks in the panel |
| `channelPrefix` | Start of the channel name |
| `staffRoleIds` | Extra staff roles for this category only (can also be set in `.env`) |
| `questions` | Form questions, **max 5**. An empty list `[]` = a ticket without a form |
| `style` | `"short"` (one line) or `"paragraph"` (longer text) |

> The card-with-buttons layout fits up to **8 categories**. With more, the panel switches to a dropdown list automatically (max 25).

### `snippets` – canned replies (`/reply`)
```json
{ "id": "greeting", "name": "👋 Greeting", "content": "Hi {user}! My name is {staff} and I'll be handling your ticket." }
```
Variables: `{user}` (ticket author), `{staff}` (the staff member), `{server}` (server name).

### `defaults` – behavior
| Field | Default | Description |
|---|---|---|
| `maxOpenTicketsPerUser` | `2` | Open ticket limit per user (`0` = no limit) |
| `autoCloseHours` | `48` | Close a ticket after this many hours without a reply from the author (`0` = off) |
| `autoCloseWarningHours` | `24` | Send a warning after this many hours |
| `deleteDelaySeconds` | `5` | Delay before the channel is deleted |
| `dmTranscript` | `true` | Send the transcript to the author by DM |
| `askForRating` | `true` | Ask for a rating after closing |
| `dmOnOpen` | `true` | DM with a link after a ticket is opened |
| `openCooldownSeconds` | `60` | Anti-spam: time between one user's tickets |
| `pingStaffAfterMinutes` | `10` | After how many minutes the author can use "🔔 Call support" |
| `pingStaffCooldownMinutes` | `30` | How often support can be called |
| `panelRefreshMinutes` | `5` | How often to refresh the panel (in addition to refreshing after changes) |

You can also change the limit, auto-close and staff ping without a restart using `/setup set`.

> After changing `config.json`, restart the bot and send the panel again (`/panel`). You can validate the file with `npm run check`.

---

## 📋 Commands

| Command | Description | Who |
|---|---|---|
| `/setup auto support_role` | Creates the categories plus log and transcript channels | Admin |
| `/setup set …` | Manual setup: categories, channels, limit, auto-close, ping | Admin |
| `/setup role-add` / `role-remove` | Staff roles | Admin |
| `/setup show` | Full configuration, including roles from `.env` | Admin |
| `/panel [channel] [style]` | Sends the ticket panel | Admin |
| `/ticket info` | Ticket details | Everyone in the ticket |
| `/ticket close [reason]` | Closes the ticket | Staff + author |
| `/ticket add` / `remove` | Adds / removes a person | Staff |
| `/ticket claim` / `unclaim` | Claims / releases the ticket | Staff |
| `/ticket priority` | Changes the priority | Staff |
| `/ticket move` | Moves the ticket to another category | Staff |
| `/ticket request-close` | Asks the author to confirm the issue is resolved | Staff |
| `/ticket rename` | Renames the channel | Staff |
| `/reply` | Sends a canned reply (with autocomplete) | Staff |
| `/blacklist add` / `remove` / `list` | Blacklist | Staff |
| `/stats [staff] [days]` | Statistics and leaderboard | Staff |
| `/help` | List of commands based on your permissions | Everyone |

> Everyone can see the admin commands, but the bot checks permissions itself and refuses people without access. To hide them, use *Server Settings → Integrations*.

---

## 🔄 How a ticket works – step by step

1. **The user** clicks a category on the panel and fills in the form.
2. The bot creates a **private channel** that only the author, staff and admins can see. It posts a pinned **ticket card** in the channel and mentions the staff role. The author gets a **DM** with a link.
3. **Staff** click **🙋 Claim**. The card shows who is handling the ticket.
4. In the card, staff have the **⚙️ menu** (priority, close request, move) and the **➕ Add someone** list.
5. If staff take a long time to reply, the author can click **🔔 Call support**.
6. If the author stops replying, the bot sends a **warning** and later **closes the ticket automatically**. The author can cancel this with the **✋ I still need help** button.
7. The ticket is closed with **🔒 Close** or through a close request accepted by the author. Then:
   - the author loses access and the channel moves to the closed category,
   - the bot saves an **HTML transcript** in the transcript channel,
   - the author gets the **transcript** and a **rating request** ⭐ by DM,
   - a card with **🔓 Reopen**, **📄 Transcript** and **🗑️ Delete ticket** buttons appears in the channel.
8. Every action is posted to the **log channel**.

---

## ⬆️ Updating the bot

1. Stop the bot.
2. Replace the files with the new ones. **Keep** your `.env` file and the `data/` folder – that's where your tickets are.
3. If you don't overwrite your own `config.json`, compare it with the new one and add any missing options.
4. Start the bot.
5. If the panel's look has changed, send it again with `/panel` and delete the old one.

> 💾 Backup = copy the `data/db.json` file.

---

## 🛠️ Common problems

| Problem | Solution |
|---|---|
| Console: `Missing DISCORD_TOKEN in the .env file` | The file must be named exactly `.env` (with a leading dot) and sit next to `index.js`. |
| Console: `Cannot find module 'discord.js'` | Type `npm install` in the console. |
| Commands don't appear | Set `GUILD_ID` and restart the bot. Without it, global commands take about an hour. Also check that `applications.commands` was ticked when inviting the bot. |
| "The ticket system is not configured yet" | Run `/setup auto` or set `TICKET_CATEGORY_ID`. |
| "Failed to create the ticket" | The bot needs *Manage Channels* and *Manage Roles*, and its role must be above the staff roles. |
| The transcript is empty | Enable **Message Content Intent** in the Developer Portal (Step 1). |
| Staff can't see tickets | Check the `🔐 SUPPORT_ROLE_IDS` line in the console. If a role has ⚠️ next to it, the ID is wrong. |
| "Average response time: no data yet" | It's only counted once a staff member (not the ticket author) replies in a ticket. |
| A user doesn't get DMs | They have DMs from server members turned off. The bot skips it and keeps working. |

---

## 🗂️ File structure

```
index.js                      startup file (select it on your host)
.env                          token, roles, channels (create it from .env.example)
config.json                   look, categories, questions, canned replies
data/db.json                  tickets and settings (created automatically)
scripts/check.js              validates config.json (npm run check)
src/
├── index.js                  bot startup and events
├── deploy-commands.js        manual command registration (npm run deploy)
├── commands/                 slash commands
├── handlers/interactions.js  buttons, menus and forms
└── lib/
    ├── tickets.js            ticket logic
    ├── ui.js                 card layouts
    ├── transcript.js         HTML transcripts
    ├── permissions.js        roles and permissions from .env
    ├── db.js                 data storage
    ├── config.js             config.json loader
    └── utils.js              helper functions
```
