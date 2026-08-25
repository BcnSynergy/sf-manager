import type { AddTechnicianRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// add-representative-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(addTechnicianSchema) on the controller method; Swagger
// documents the shape separately via @ApiBody.
export type AddTechnicianRequestDto = AddTechnicianRequest;
