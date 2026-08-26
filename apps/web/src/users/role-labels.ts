import type { Role } from '@sf-manager/validation';

// Maps a Role enum value to its i18n key — same "value in, i18n key out"
// shape as error-messages.ts's mapApiErrorToMessageKey, kept as a pure
// function rather than calling useTranslation()'s t() itself so it stays
// independently testable without any i18n runtime/provider. Callers pass
// the returned key to their own t() (spec "Internationalization Coverage":
// no hardcoded UI strings, including the role enum's display value).
const ROLE_LABEL_KEYS: Record<Role, string> = {
  SYSTEM_ADMIN: 'users.role.systemAdmin',
  MANAGER: 'users.role.manager',
  MAINTENANCE_COMPANY_MANAGER: 'users.role.maintenanceCompanyManager',
  MAINTENANCE_TECHNICIAN: 'users.role.maintenanceTechnician',
  COMMUNITY_REPRESENTATIVE: 'users.role.communityRepresentative',
};

export function mapRoleToLabelKey(role: Role): string {
  return ROLE_LABEL_KEYS[role];
}
