import { z } from 'zod';

// review-session/design.md Decision 9: the ReviewSessionStatus/AnswerValue
// three-way-declaration seam (Postgres enum, domain union, Zod schema).
// These Zod projections are authoritative for the `satisfies` gates wired
// on review-session/domain/{review-session-status,answer-value}.ts, closing
// the deviation noted at Phase 3 (tasks.md 3.4) now that this package
// exports the types (tasks.md 4.13's enum-parity integration spec depends
// on this). Deliberately minimal here — full write-side schemas
// (discriminated-union entry write, open-request body validation beyond
// this file's shape) are Phase 5's task 5.3.
export const reviewSessionStatusSchema = z.enum(['draft', 'completed']);

export type ReviewSessionStatus = z.infer<typeof reviewSessionStatusSchema>;

export const answerValueSchema = z.enum(['YES', 'NO', 'NOT_APPLICABLE']);

export type AnswerValue = z.infer<typeof answerValueSchema>;

// review-session/design.md Interfaces (POST /review-sessions) + spec.md
// "Open a Review Session Against a Community and a Specific Template":
// communityId and templateId are required; status/id/startedAt are
// server-generated, never accepted from the request body.
export const openReviewSessionSchema = z.object({
  communityId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
});

export type OpenReviewSessionRequest = z.infer<typeof openReviewSessionSchema>;
