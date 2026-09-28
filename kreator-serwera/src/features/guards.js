'use strict';

const { PermissionsBitField } = require('discord.js');
const { DANGEROUS } = require('../builder/permissions');

const DANGEROUS_BITS = new PermissionsBitField(DANGEROUS);

/**
 * Czy bot może bezpiecznie nadać tę rolę automatycznie (weryfikacja / panel ról)?
 * Blokujemy role zarządzane przez integracje, role nad botem i role z uprawnieniami
 * moderacyjnymi – nawet gdyby ktoś podmienił wiadomość z panelem.
 */
function isSafeSelfRole(role) {
  if (!role) return false;
  if (role.id === role.guild.id) return false;
  if (role.managed) return false;
  if (!role.editable) return false;
  if (role.permissions.any(DANGEROUS_BITS)) return false;
  return true;
}

module.exports = { isSafeSelfRole };
