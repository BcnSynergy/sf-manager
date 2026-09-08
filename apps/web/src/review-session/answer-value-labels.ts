import type { AnswerValue } from '@sf-manager/validation';

// Maps an AnswerValue enum value to its i18n key — same "value in, i18n key
// out" shape as inspectable-element/element-type-labels.ts's
// mapElementTypeToLabelKey (review-session-ui spec "Enum values are never
// rendered raw"). `Record<AnswerValue, string>` means adding a new
// AnswerValue member without adding it here is a compile error, not a
// runtime raw-string leak.
const ANSWER_VALUE_LABEL_KEYS: Record<AnswerValue, string> = {
  YES: 'reviewSession.answer.yes',
  NO: 'reviewSession.answer.no',
  NOT_APPLICABLE: 'reviewSession.answer.notApplicable',
};

export function mapAnswerValueToLabelKey(value: AnswerValue): string {
  return ANSWER_VALUE_LABEL_KEYS[value];
}
