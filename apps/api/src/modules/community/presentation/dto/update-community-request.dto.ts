import type { UpdateCommunityRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — see create-community-request.dto.ts for the
// same rationale. Runtime validation via
// ZodValidationPipe(updateCommunitySchema).
export type UpdateCommunityRequestDto = UpdateCommunityRequest;
