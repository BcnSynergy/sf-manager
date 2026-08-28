import { apiFetch } from './client';

// Mirrors apps/api/src/modules/maintenance-company/presentation/
// maintenance-company-error-code.ts verbatim (design.md Decision 1, "Coded-
// error convention"). Kept as honest duplication, same rationale as
// api/community.ts's CommunityErrorCode — an e2e assertion on `body.code` in
// apps/api/test/maintenance-company.e2e-spec.ts (Phase 12) is the anti-drift
// guard on the API side.
export type MaintenanceCompanyErrorCode =
  | 'TAX_ID_ALREADY_IN_USE'
  | 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS';

// Mirrors apps/api's MaintenanceCompanyResponseDto — deletedAt is never
// returned (design.md "Data Flow — POST /maintenance-companies").
export type MaintenanceCompany = {
  id: string;
  name: string;
  taxId: string;
  contactInfo: string;
};

export type CreateMaintenanceCompanyPayload = {
  name: string;
  taxId: string;
  contactInfo: string;
};

export type UpdateMaintenanceCompanyPayload = {
  name?: string;
  taxId?: string;
  contactInfo?: string;
};

export function listMaintenanceCompanies(): Promise<MaintenanceCompany[]> {
  return apiFetch<MaintenanceCompany[]>('/maintenance-companies');
}

export function createMaintenanceCompany(
  payload: CreateMaintenanceCompanyPayload,
): Promise<MaintenanceCompany> {
  return apiFetch<MaintenanceCompany>('/maintenance-companies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMaintenanceCompany(
  id: string,
  payload: UpdateMaintenanceCompanyPayload,
): Promise<MaintenanceCompany> {
  return apiFetch<MaintenanceCompany>(`/maintenance-companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// 204 No Content on success (mirrors api/community.ts's softDeleteCommunity).
export function softDeleteMaintenanceCompany(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/maintenance-companies/${id}`, { method: 'DELETE' });
}
