import type { CreateUserRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type, no class-validator DTO class. Runtime
// validation happens via ZodValidationPipe(createUserSchema) on the
// controller method; Swagger documents the shape separately via
// @ApiBody({ schema }) since a Zod-inferred type carries no decorator
// metadata for Nest's reflection.
export type CreateUserRequestDto = CreateUserRequest;
