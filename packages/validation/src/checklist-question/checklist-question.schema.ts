import { z } from 'zod';
import { elementTypeSchema } from '../inspectable-element/inspectable-element.schema';

// design.md Decision 1: the Zod projection of the ReviewFrequency
// three-way seam. Authoritative order is domain (apps/api) -> this schema;
// the domain union (`REVIEW_FREQUENCIES`,
// apps/api/src/modules/checklist-question/domain/review-frequency.ts)
// gates against this type via `satisfies`, mirroring `elementTypeSchema` /
// `ELEMENT_TYPES`.
export const reviewFrequencySchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
]);

export type ReviewFrequency = z.infer<typeof reviewFrequencySchema>;

// design.md Interfaces (POST /checklist-questions) + checklist-question-
// management spec.md "Create Checklist Question": elementType, frequencies
// (non-empty) and text are required. `id`/`deletedAt` are server-generated,
// never accepted from the request body. All plain fields — no Value
// Objects (design.md Decision 7).
export const createChecklistQuestionSchema = z.object({
  elementType: elementTypeSchema,
  // spec.md "Empty frequencies set rejected" — `.min(1)` is the sole
  // enforcement of non-emptiness (design.md Decision 7).
  frequencies: z.array(reviewFrequencySchema).min(1),
  text: z.string().trim().min(1),
});

export type CreateChecklistQuestionRequest = z.infer<
  typeof createChecklistQuestionSchema
>;

// design.md Interfaces (PATCH /checklist-questions/:id) + checklist-
// question-management spec.md "Update Checklist Question": elementType is
// NOT part of this schema — a question never changes type in this slice
// (design.md Interfaces, ChecklistQuestionRepository.updateById comment).
export const updateChecklistQuestionSchema = z.object({
  text: z.string().trim().min(1).optional(),
  frequencies: z.array(reviewFrequencySchema).min(1).optional(),
});

export type UpdateChecklistQuestionRequest = z.infer<
  typeof updateChecklistQuestionSchema
>;
