import type { CreateChecklistQuestionRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// create-inspectable-element-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(createChecklistQuestionSchema) on the controller
// method; Swagger documents the shape separately via @ApiBody.
export type CreateChecklistQuestionRequestDto = CreateChecklistQuestionRequest;
