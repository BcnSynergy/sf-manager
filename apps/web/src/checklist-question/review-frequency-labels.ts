import type { ReviewFrequency } from '@sf-manager/validation';

// Maps a ReviewFrequency enum value to its i18n key — same "value in, i18n
// key out" shape as inspectable-element/element-type-labels.ts's
// mapElementTypeToLabelKey, kept as a pure function rather than calling
// useTranslation()'s t() itself so it stays independently testable without
// any i18n runtime/provider.
//
// design.md Decision 1 (the ReviewFrequency three-way-declaration seam) /
// admin-ui spec "Element Type and Frequency Label Mapping": `Record<
// ReviewFrequency, string>` means adding a new ReviewFrequency member
// without adding it here is a compile error, not a runtime raw-string
// leak. Callers pass the returned key to their own t() — the raw enum
// value MAY only back `<option value>` attributes and API payloads.
const REVIEW_FREQUENCY_LABEL_KEYS: Record<ReviewFrequency, string> = {
  MONTHLY: 'checklistQuestion.frequency.monthly',
  QUARTERLY: 'checklistQuestion.frequency.quarterly',
  SEMIANNUAL: 'checklistQuestion.frequency.semiannual',
  ANNUAL: 'checklistQuestion.frequency.annual',
};

export function mapReviewFrequencyToLabelKey(frequency: ReviewFrequency): string {
  return REVIEW_FREQUENCY_LABEL_KEYS[frequency];
}
