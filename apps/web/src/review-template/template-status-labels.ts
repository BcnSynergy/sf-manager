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
