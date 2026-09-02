import type { UpdateInspectableElementRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — see
// create-inspectable-element-request.dto.ts for the same rationale. Runtime
// validation via ZodValidationPipe(updateInspectableElementSchema).
export type UpdateInspectableElementRequestDto =
  UpdateInspectableElementRequest;
