import type { Role } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/users/presentation/user-error-code.ts
// verbatim (design.md Decision 3). Kept as honest duplication rather than
// hoisted into @sf-manager/validation until a second consumer needs its own
// codes (design.md "Deferred trigger"). An e2e assertion on `body.code` in
// apps/api/test/users.e2e-spec.ts is the anti-drift guard on the API side.
export type UserErrorCode =
  | 'EMAIL_ALREADY_IN_USE'
  | 'LAST_SYSTEM_ADMIN'
  | 'TRANSACTION_CONFLICT';

// Response shape shared by list/create/update (never the password hash) —
// mirrors apps/api's UserResponseDto.
export type User = {
  id: string;
  email: string;
  role: Role;
};

export type CreateUserPayload = {
  email: string;
  password: string;
  role: Role;
};

export type UpdateUserPayload = {
  email?: string;
  role?: Role;
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
