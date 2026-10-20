import type { ReviewTemplateStatus } from '../api/review-template';

// Maps a ReviewTemplateStatus value to its i18n key — same "value in, i18n
// key out" shape as checklist-question/review-frequency-labels.ts's
// mapReviewFrequencyToLabelKey, kept as a pure function so it stays
// independently testable without any i18n runtime/provider.
//
// admin-ui spec "Frequency and Status Label Mapping": `Record<
// ReviewTemplateStatus, string>` means adding a new status without adding
// it here is a compile error, not a runtime raw-string leak. Callers pass
// the returned key to their own t() — the raw status value MAY only back
// `<option value>` attributes and API payloads.
const TEMPLATE_STATUS_LABEL_KEYS: Record<ReviewTemplateStatus, string> = {
  draft: 'reviewTemplate.status.draft',
  active: 'reviewTemplate.status.active',
  retired: 'reviewTemplate.status.retired',
};

export function mapTemplateStatusToLabelKey(status: ReviewTemplateStatus): string {
  return TEMPLATE_STATUS_LABEL_KEYS[status];
}

// StatusBadge tone per status (user decision, 2026-10-17): the version in
// use stands out, a draft gets the outlined in-progress marker, a retired
// version stays neutral. The label still carries the meaning. Shared by the
// templates list and the template detail page.
const TEMPLATE_STATUS_BADGE_CLASSES: Record<ReviewTemplateStatus, string> = {
  active: 'sf-badge sf-badge-success',
  draft: 'sf-badge sf-badge-draft',
  retired: 'sf-badge',
};

export function mapTemplateStatusToBadgeClass(status: ReviewTemplateStatus): string {
  return TEMPLATE_STATUS_BADGE_CLASSES[status];
}
