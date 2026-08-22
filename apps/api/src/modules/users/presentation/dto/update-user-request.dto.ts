import type { UpdateUserRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — see create-user-request.dto.ts for the same
// rationale. Runtime validation via ZodValidationPipe(updateUserSchema).
export type UpdateUserRequestDto = UpdateUserRequest;
