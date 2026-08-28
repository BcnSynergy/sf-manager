import type { CreateMaintenanceCompanyRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// create-community-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(createMaintenanceCompanySchema) on the controller
// method; Swagger documents the shape separately via @ApiBody.
export type CreateMaintenanceCompanyRequestDto =
  CreateMaintenanceCompanyRequest;
