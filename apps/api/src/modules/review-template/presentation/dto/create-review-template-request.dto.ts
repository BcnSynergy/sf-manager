import type { CreateDraftReviewTemplateRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// create-checklist-question-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(createDraftReviewTemplateSchema) on the controller
// method; Swagger documents the shape separately via @ApiBody.
export type CreateReviewTemplateRequestDto = CreateDraftReviewTemplateRequest;
