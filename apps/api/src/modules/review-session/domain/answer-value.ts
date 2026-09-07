// design.md Decision 9 — the AnswerValue three-way-declaration seam. This
// is the authoritative TypeScript union; the Postgres enum
// (`enum AnswerValue` in schema.prisma) and the Zod schema
// (`packages/validation`, Phase 5) are each a separate projection of the
// same set of values. Mirrors `review-session-status.ts`'s shape and, like
// it, is domain-only for now — the `satisfies` gate against
// `@sf-manager/validation` is wired once that package exports this type
// (tasks.md 5.3).
export const ANSWER_VALUES = ['YES', 'NO', 'NOT_APPLICABLE'] as const;
export type AnswerValue = (typeof ANSWER_VALUES)[number];
