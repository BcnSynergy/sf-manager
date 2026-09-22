import type { UpdateOrganizationProfileRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// update-maintenance-company-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(updateOrganizationProfileSchema) on the controller
// method; Swagger documents the shape separately via @ApiBody.
export type UpdateOrganizationProfileRequestDto =
  UpdateOrganizationProfileRequest;
