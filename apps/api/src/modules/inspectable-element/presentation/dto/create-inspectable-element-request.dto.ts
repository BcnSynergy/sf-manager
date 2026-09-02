import type { CreateInspectableElementRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// create-maintenance-company-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(createInspectableElementSchema) on the controller
// method; Swagger documents the shape separately via @ApiBody.
export type CreateInspectableElementRequestDto =
  CreateInspectableElementRequest;
