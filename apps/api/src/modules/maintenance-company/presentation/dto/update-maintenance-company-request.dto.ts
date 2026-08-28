import type { UpdateMaintenanceCompanyRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — see create-maintenance-company-request.dto.ts
// for the same rationale. Runtime validation via
// ZodValidationPipe(updateMaintenanceCompanySchema).
export type UpdateMaintenanceCompanyRequestDto =
  UpdateMaintenanceCompanyRequest;
