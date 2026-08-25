import type { CreateCommunityRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class — mirrors
// create-user-request.dto.ts. Runtime validation happens via
// ZodValidationPipe(createCommunitySchema) on the controller method; Swagger
// documents the shape separately via @ApiBody.
export type CreateCommunityRequestDto = CreateCommunityRequest;
