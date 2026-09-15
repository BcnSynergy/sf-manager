import type { ManagerCapability, Role } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/users/presentation/user-error-code.ts
// verbatim (design.md Decision 3). Kept as honest duplication rather than
// hoisted into @sf-manager/validation until a second consumer needs its own
// codes (design.md "Deferred trigger"). An e2e assertion on `body.code` in
// apps/api/test/users.e2e-spec.ts is the anti-drift guard on the API side.
//
// maintenance-company user-management spec.md "Last-Admin Lockout"
// (MODIFIED): the three MAINTENANCE_COMPANY_* values are 400s, not 409s —
// see design.md Decision 5 (Phase 11 web mirror of Phase 6's API codes).
//
// review-history-manager-capability design.md Decision 6: the new
// MANAGER_CAPABILITIES_NOT_ALLOWED code is a 400, raised by both the
// payload-decidable schema refinement and the resulting-state use-case
// check — the client needs only one mapping either way.
export type UserErrorCode =
  | 'EMAIL_ALREADY_IN_USE'
  | 'LAST_SYSTEM_ADMIN'
  | 'TRANSACTION_CONFLICT'
  | 'MAINTENANCE_COMPANY_REQUIRED'
  | 'MAINTENANCE_COMPANY_NOT_ALLOWED'
  | 'MAINTENANCE_COMPANY_NOT_FOUND'
  | 'MANAGER_CAPABILITIES_NOT_ALLOWED';

// Response shape shared by list/create/update (never the password hash) —
// mirrors apps/api's UserResponseDto. `maintenanceCompanyId` is the only
// company-related field (design.md Decision 7 — the NAME is resolved
// client-side from GET /maintenance-companies, never returned by this API).
// `managerCapabilities` (review-history-manager-capability design.md OQ1 /
// Decision 7) is always an array, `[]` for every non-manager and every
// ungranted manager — there is no `GET /users/:id`, so UserEditPage prefills
// its toggle from this field on the row returned by listUsers().
export type User = {
  id: string;
  email: string;
  role: Role;
  maintenanceCompanyId: string | null;
  managerCapabilities: ManagerCapability[];
};

export type CreateUserPayload = {
  email: string;
  password: string;
  role: Role;
  maintenanceCompanyId?: string;
};

export type UpdateUserPayload = {
  email?: string;
  role?: Role;
  maintenanceCompanyId?: string;
  managerCapabilities?: ManagerCapability[];
};

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function createUser(payload: CreateUserPayload): Promise<User> {
  return apiFetch<User>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  return apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// 204 No Content on success (design.md Data Flow — deactivate).
export function deactivateUser(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/users/${id}`, { method: 'DELETE' });
}
