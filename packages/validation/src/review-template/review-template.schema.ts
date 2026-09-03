import { z } from 'zod';
import { elementTypeSchema } from '../inspectable-element/inspectable-element.schema';
import { reviewFrequencySchema } from '../checklist-question/checklist-question.schema';

// design.md Decision 1 / Findings #4: ReviewTemplateStatus is the fourth
// three-way declaration (Postgres enum, domain union, Zod schema). The Zod
// projection is authoritative for the `satisfies` gate wired on
// apps/api/src/modules/review-template/domain/review-template-status.ts
// (deferred at PR 7, wired here — task 8.8), mirroring
// reviewFrequencySchema / REVIEW_FREQUENCIES.
export const reviewTemplateStatusSchema = z.enum(['draft', 'active', 'retired']);

export type ReviewTemplateStatus = z.infer<typeof reviewTemplateStatusSchema>;

// design.md Interfaces (POST /review-templates) + review-template-
// management spec.md "Create Draft Template": elementType, frequency and
// name are required. `id`/`version`/`status`/`draftQuestionIds`/`deletedAt`
// are server-generated or server-controlled, never accepted from the
// request body.
export const createDraftReviewTemplateSchema = z.object({
  elementType: elementTypeSchema,
  frequency: reviewFrequencySchema,
  name: z.string().trim().min(1),
});

export type CreateDraftReviewTemplateRequest = z.infer<
  typeof createDraftReviewTemplateSchema
>;

// design.md Interfaces (PUT /review-templates/:id/questions) + spec.md
// "Replace a Draft's Ordered Question Selection": a full, ordered list of
// pool question ids. Order in the array IS the submitted order — no
// separate `order` field per entry.
export const setReviewTemplateQuestionsSchema = z.object({
  questionIds: z.array(z.string()),
});

export type SetReviewTemplateQuestionsRequest = z.infer<
  typeof setReviewTemplateQuestionsSchema
>;
