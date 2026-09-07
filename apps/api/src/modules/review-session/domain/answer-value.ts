import type { AnswerValue as ValidatedAnswerValue } from '@sf-manager/validation';

// design.md Decision 9 — the AnswerValue three-way-declaration seam. This
// is the authoritative TypeScript union; the Postgres enum
// (`enum AnswerValue` in schema.prisma) and the Zod schema
// (`packages/validation`, task 4.13) are each a separate projection of the
// same set of values. Mirrors `review-session-status.ts`'s shape — the
// `satisfies` gate against `@sf-manager/validation` is wired here (Phase 4,
// task 4.13) now that package exports this type.
export const ANSWER_VALUES = [
  'YES',
  'NO',
  'NOT_APPLICABLE',
] as const satisfies readonly ValidatedAnswerValue[];
export type AnswerValue = (typeof ANSWER_VALUES)[number];
