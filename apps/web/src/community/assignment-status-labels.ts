// Maps an assignment row's `deactivatedAt` to its i18n status key — same
// "value in, i18n key out" shape as users/role-labels.ts's
// mapRoleToLabelKey, kept as a pure function so it stays independently
// testable without any i18n runtime/provider. Callers pass the returned key
// to their own t() (spec "Enum Value Label Mapping": the assignment row's
// status MUST be displayed through an i18n label map, never the raw
// `deactivatedAt` value).
const ACTIVE_LABEL_KEY = 'community.assignment.status.active';
const DEACTIVATED_LABEL_KEY = 'community.assignment.status.deactivated';

export function mapAssignmentStatusToLabelKey(deactivatedAt: string | null): string {
  return deactivatedAt === null ? ACTIVE_LABEL_KEY : DEACTIVATED_LABEL_KEY;
}
