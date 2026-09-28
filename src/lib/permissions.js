// Uprawnienia bota konfigurowane w pliku .env (ID ról i użytkowników).
//
// Poziomy (od najwyższego):
//   właściciel  – OWNER_IDS: pełny dostęp do wszystkiego
//   admin       – ADMIN_ROLE_IDS lub uprawnienie „Administrator"/„Zarządzanie serwerem":
//                 /setup, /panel, /blacklist, usuwanie ticketów, nadpisywanie przejęć
//   support     – SUPPORT_ROLE_IDS (+ role z /setup i config.json): obsługa ticketów
//   użytkownik  – może otwierać tickety, jeśli spełnia OPEN_ROLE_IDS / BLOCKED_ROLE_IDS
const { PermissionFlagsBits } = require('discord.js');

const ID = /^\d{17,20}$/;

function ids(name) {
  const raw = process.env[name] ?? '';
  const list = raw.split(/[\s,;]+/).filter(Boolean);
  const bad = list.filter((v) => !ID.test(v));
  if (bad.length) console.warn(`[.env] ${name}: pominięto niepoprawne ID: ${bad.join(', ')}`);
  return list.filter((v) => ID.test(v));
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
const typeSupportRoleIds = (type) => (type ? ids(`SUPPORT_ROLE_IDS_${type.id.toUpperCase().replace(/-/g, '_')}`) : []);

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

module.exports = { env, isOwner, isAdmin, isStaff, ticketRoleIds, openDeniedReason };
