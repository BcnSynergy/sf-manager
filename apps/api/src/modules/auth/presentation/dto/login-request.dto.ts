import type { LoginRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class. The request
// body is validated at runtime by ZodValidationPipe(loginRequestSchema) on
// the controller method; Swagger documents the shape separately via
// @ApiBody({ schema }) since a Zod-inferred type carries no decorator
// metadata for Nest's Swagger reflection.
export type LoginRequestDto = LoginRequest;
