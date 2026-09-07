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

// design.md Decision 10/11: "One write endpoint for both outcomes" —
// PUT .../entries/:elementId's body is exactly ONE of `{ answers: [...] }`
// (the element was reviewed) or `{ observations: string }` (it was not),
// never both, never neither (design.md Decision 1's `answers XOR
// observations` invariant, enforced here as the second of the three
// layers — the domain factories are the primary layer, the hand-written
// Postgres CHECK is the backstop).
export const recordAnswersRequestSchema = z
  .object({
    answers: z
      .array(
        z.object({
          questionId: z.string().trim().min(1),
          value: answerValueSchema,
        }),
      )
      .min(1),
  })
  .strict();

export type RecordAnswersRequest = z.infer<typeof recordAnswersRequestSchema>;

export const markUnreviewedRequestSchema = z
  .object({
    observations: z.string().trim().min(1),
  })
  .strict();

export type MarkUnreviewedRequest = z.infer<typeof markUnreviewedRequestSchema>;

// There is no literal field in either branch to key a real
// `z.discriminatedUnion` on — design.md Decision 1 deliberately rejected
// adding a `kind`/`type` tag to the wire body, so the exclusivity is
// enforced by `z.union` of two `.strict()` object schemas instead: a body
// carrying both keys fails BOTH branches (each branch's `.strict()` rejects
// the other branch's key as unrecognized), and a body carrying neither key
// also fails both (each branch requires its own key) — the XOR holds
// without a discriminator property.
export const recordEntryRequestSchema = z.union([
  recordAnswersRequestSchema,
  markUnreviewedRequestSchema,
]);

export type RecordEntryRequest = z.infer<typeof recordEntryRequestSchema>;
