import type { SetReviewTemplateQuestionsRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — mirrors create-review-template-request.dto.ts.
// Runtime validation happens via
// ZodValidationPipe(setReviewTemplateQuestionsSchema) on the controller
// method.
export type SetReviewTemplateQuestionsRequestDto =
  SetReviewTemplateQuestionsRequest;
