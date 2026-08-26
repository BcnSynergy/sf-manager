import type { Locale } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/community/presentation/community-error-code.ts
// verbatim (design.md Decision 1, "Coded-conflict convention"). Kept as
// honest duplication, same rationale as api/users.ts's UserErrorCode — an
// e2e assertion on `body.code` in apps/api/test/community.e2e-spec.ts is
// the anti-drift guard on the API side.
export type CommunityErrorCode =
  | 'ASSIGNMENT_ALREADY_EXISTS'
  | 'INELIGIBLE_ROLE'
  | 'TRANSACTION_CONFLICT';

// Mirrors apps/api's CommunityResponseDto.
export type Community = {
  id: string;
  name: string;
  address: string;
  locale: Locale;
};

export type CreateCommunityPayload = {
  name: string;
  address: string;
  locale: Locale;
};

export type UpdateCommunityPayload = {
  name?: string;
  address?: string;
  locale?: Locale;
};

// Mirrors apps/api's RepresentativeListItemDto / TechnicianListItemDto and
// the add/reactivate response shape (minus `warning`): `deactivatedAt` is
// `null` on a freshly-activated row and a real ISO timestamp on a
// deactivated one.
export type Assignment = {
  communityId: string;
  userId: string;
  deactivatedAt: string | null;
};

// design.md "Where the settled policies live in code" — the only warning
// this slice's API emits. Typed here so the shape is honest, but
// deliberately never read anywhere in the UI (community-admin-ui spec,
// "Multi-community warning is deliberately not surfaced").
export type RepresentativeWarning = {
  code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES';
  communityCount: number;
};

// Mirrors apps/api's RepresentativeResponseDto — the only assignment
// response shape that can carry `warning`.
export type RepresentativeAssignment = Assignment & {
  warning?: RepresentativeWarning;
};

export function listCommunities(): Promise<Community[]> {
  return apiFetch<Community[]>('/communities');
}

export function createCommunity(payload: CreateCommunityPayload): Promise<Community> {
  return apiFetch<Community>('/communities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCommunity(
  id: string,
  payload: UpdateCommunityPayload,
): Promise<Community> {
  return apiFetch<Community>(`/communities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// 204 No Content on success (mirrors api/users.ts's deactivateUser).
export function softDeleteCommunity(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/communities/${id}`, { method: 'DELETE' });
}

// design.md Decision 4 — active AND deactivated records.
export function listRepresentatives(communityId: string): Promise<Assignment[]> {
  return apiFetch<Assignment[]>(`/communities/${communityId}/representatives`);
}

export function addRepresentative(
  communityId: string,
  userId: string,
): Promise<RepresentativeAssignment> {
  return apiFetch<RepresentativeAssignment>(
    `/communities/${communityId}/representatives`,
    { method: 'POST', body: JSON.stringify({ userId }) },
  );
}

// 204 No Content on success.
export function deactivateRepresentative(
  communityId: string,
  userId: string,
): Promise<undefined> {
  return apiFetch<undefined>(
    `/communities/${communityId}/representatives/${userId}`,
    { method: 'DELETE' },
  );
}

export function reactivateRepresentative(
  communityId: string,
  userId: string,
): Promise<RepresentativeAssignment> {
  return apiFetch<RepresentativeAssignment>(
    `/communities/${communityId}/representatives/${userId}/reactivate`,
    { method: 'POST' },
  );
}

// design.md Decision 4 — active AND deactivated records.
export function listTechnicians(communityId: string): Promise<Assignment[]> {
  return apiFetch<Assignment[]>(`/communities/${communityId}/technicians`);
}

export function addTechnician(communityId: string, userId: string): Promise<Assignment> {
  return apiFetch<Assignment>(`/communities/${communityId}/technicians`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

// 204 No Content on success.
export function deactivateTechnician(
  communityId: string,
  userId: string,
): Promise<undefined> {
  return apiFetch<undefined>(
    `/communities/${communityId}/technicians/${userId}`,
    { method: 'DELETE' },
  );
}

export function reactivateTechnician(
  communityId: string,
  userId: string,
): Promise<Assignment> {
  return apiFetch<Assignment>(
    `/communities/${communityId}/technicians/${userId}/reactivate`,
    { method: 'POST' },
  );
}
