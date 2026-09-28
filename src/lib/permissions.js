// Uprawnienia bota konfigurowane w pliku .env (ID ról i użytkowników).
//
// Poziomy (od najwyższego):
//   właściciel  – OWNER_IDS: pełny dostęp do wszystkiego
//   admin       – ADMIN_ROLE_IDS lub uprawnienie „Administrator"/„Zarządzanie serwerem":
//                 /setup, /panel, /blacklist, usuwanie ticketów, nadpisywanie przejęć
//   support     – SUPPORT_ROLE_IDS (+ role z /setup i config.json): obsługa ticketów
//   użytkownik  – może otwierać tickety, jeśli spełnia OPEN_ROLE_IDS / BLOCKED_ROLE_IDS
const { PermissionFlagsBits } = require('discord.js');

/**
 * Czyta listę ID z .env. Akceptuje dowolny format i dowolną liczbę ról, np.:
 *   SUPPORT_ROLE_IDS=111,222,333
 *   SUPPORT_ROLE_IDS=111, 222, 333
 *   SUPPORT_ROLE_IDS="111 222 333"
 *   SUPPORT_ROLE_IDS=<@&111>,<@&222>        (skopiowane wzmianki ról)
 * Działa też nazwa w liczbie pojedynczej (SUPPORT_ROLE_ID) – obie się sumują.
 */
function ids(name) {
  const names = [name, name.replace(/_IDS(?=$|_)/, '_ID')];
  const found = [];
  for (const key of new Set(names)) {
    const raw = process.env[key];
    if (!raw) continue;
    const list = raw.match(/\d{17,20}/g) ?? [];
    if (!list.length && raw.trim()) console.warn(`[.env] ${key}: nie znaleziono żadnego poprawnego ID (17–20 cyfr).`);
    found.push(...list);
  }
  return [...new Set(found)];
}

function bool(name, fallback) {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'tak', 'yes', 'on'].includes(v);
}

const env = {
  ownerIds: ids('OWNER_IDS'),
  adminRoleIds: ids('ADMIN_ROLE_IDS'),
  supportRoleIds: ids('SUPPORT_ROLE_IDS'),
  openRoleIds: ids('OPEN_ROLE_IDS'),
  blockedRoleIds: ids('BLOCKED_ROLE_IDS'),
  // czy uprawnienia Discorda (Administrator / Zarządzanie serwerem) dają dostęp admina bota
  discordAdminsAreAdmins: bool('DISCORD_ADMINS_ARE_ADMINS', true),
  staffCanDelete: bool('STAFF_CAN_DELETE', true),
  ownerCanClose: bool('OWNER_CAN_CLOSE', true),
  // domyślne kanały (używane, gdy nie ustawiono ich przez /setup)
  categoryId: ids('TICKET_CATEGORY_ID')[0] ?? null,
  closedCategoryId: ids('CLOSED_CATEGORY_ID')[0] ?? null,
  logChannelId: ids('LOG_CHANNEL_ID')[0] ?? null,
  transcriptChannelId: ids('TRANSCRIPT_CHANNEL_ID')[0] ?? null,
};

/** Dodatkowe role supportu dla konkretnego typu, np. SUPPORT_ROLE_IDS_REPORT=... */
const typeRoleCache = new Map();
function typeSupportRoleIds(type) {
  if (!type) return [];
  if (!typeRoleCache.has(type.id)) typeRoleCache.set(type.id, ids(`SUPPORT_ROLE_IDS_${type.id.toUpperCase().replace(/-/g, '_')}`));
  return typeRoleCache.get(type.id);
}

const hasRole = (member, roleIds) => roleIds.length > 0 && member.roles.cache.hasAny(...roleIds);

function isOwner(userOrMember) {
  return env.ownerIds.includes(userOrMember?.id);
}

function isAdmin(member) {
  if (!member) return false;
  if (isOwner(member)) return true;
  if (hasRole(member, env.adminRoleIds)) return true;
  if (env.discordAdminsAreAdmins) {
    return (
      member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  }
  return false;
}

/** Role, które dostają dostęp do kanału ticketu. */
function ticketRoleIds(dbStaffRoleIds, type) {
  return [
    ...new Set([
      ...env.adminRoleIds,
      ...env.supportRoleIds,
      ...(dbStaffRoleIds ?? []),
      ...(type?.staffRoleIds ?? []),
      ...typeSupportRoleIds(type),
    ]),
  ];
}

function isStaff(member, dbStaffRoleIds, type) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  return hasRole(member, ticketRoleIds(dbStaffRoleIds, type));
}

/** Zwraca komunikat błędu albo null, jeśli użytkownik może otworzyć ticket. */
function openDeniedReason(member) {
  if (isAdmin(member)) return null;
  if (hasRole(member, env.blockedRoleIds)) return 'Twoja rola nie pozwala na otwieranie ticketów.';
  if (env.openRoleIds.length && !hasRole(member, env.openRoleIds)) {
    return `Aby otworzyć ticket, potrzebujesz jednej z ról: ${env.openRoleIds.map((id) => `<@&${id}>`).join(', ')}`;
  }
  return null;
}

/** Wypisuje w konsoli wczytane role i ostrzega o rolach, których nie ma na serwerze. */
function reportRoles(guilds, ticketTypes) {
  const groups = [
    ['OWNER_IDS', env.ownerIds, 'user'],
    ['ADMIN_ROLE_IDS', env.adminRoleIds],
    ['SUPPORT_ROLE_IDS', env.supportRoleIds],
    ...ticketTypes.map((t) => [`SUPPORT_ROLE_IDS_${t.id.toUpperCase().replace(/-/g, '_')}`, typeSupportRoleIds(t)]),
    ['OPEN_ROLE_IDS', env.openRoleIds],
    ['BLOCKED_ROLE_IDS', env.blockedRoleIds],
  ];
  for (const [name, list, kind] of groups) {
    if (!list.length) continue;
    if (kind === 'user') {
      console.log(`🔐 ${name}: ${list.length} os.`);
      continue;
    }
    const names = list.map((id) => {
      const role = guilds.map((g) => g.roles.cache.get(id)).find(Boolean);
      return role ? `@${role.name}` : `⚠️ ${id} (nie ma takiej roli na serwerze!)`;
    });
    console.log(`🔐 ${name}: ${list.length} ${list.length === 1 ? 'rola' : 'role'} → ${names.join(', ')}`);
  }
}

module.exports = { env, reportRoles, isOwner, isAdmin, isStaff, ticketRoleIds, openDeniedReason };
