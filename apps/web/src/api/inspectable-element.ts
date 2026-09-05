import type { ElementType } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/inspectable-element/presentation/
// inspectable-element-error-code.ts verbatim (design.md Decision 7,
// "Coded-error convention"). Kept as honest duplication, same rationale as
// api/community.ts's CommunityErrorCode — an e2e assertion on `body.code` in
// apps/api/test/inspectable-element.e2e-spec.ts (Phase 10) is the anti-drift
// guard on the API side.
export type InspectableElementErrorCode =
  | 'COMMUNITY_NOT_FOUND'
  | 'INSPECTABLE_ELEMENT_NOT_FOUND';

// Mirrors apps/api's InspectableElementResponseDto — deletedAt is never
// returned (design.md "Data Flow — POST /communities/:communityId/
// inspectable-elements"). `installedAt` is the formatted 'YYYY-MM-DD' string
// (design.md Decision 3), not a raw Date.
export type InspectableElement = {
  id: string;
  communityId: string;
  elementType: ElementType;
  name: string;
  description: string | null;
  location: string;
  serialNumber: string | null;
  installedAt: string;
  // Server-generated, immutable, 10-char alphanumeric (design.md Decisions
  // 1-3, 8). Never present in create/update payloads — see those types
  // below.
  code: string;
};

export type CreateInspectableElementPayload = {
  elementType: ElementType;
  name: string;
  description?: string;
  location: string;
  serialNumber?: string;
  installedAt: string;
};

// communityId and elementType are NOT updatable (design.md Interfaces,
// InspectableElementRepository.updateById comment) — mirrored here so a
// caller cannot even type them into the payload.
export type UpdateInspectableElementPayload = {
  name?: string;
  description?: string | null;
  location?: string;
  serialNumber?: string | null;
  installedAt?: string;
};

export function listInspectableElements(
  communityId: string,
): Promise<InspectableElement[]> {
  return apiFetch<InspectableElement[]>(
    `/communities/${communityId}/inspectable-elements`,
  );
}

export function createInspectableElement(
  communityId: string,
  payload: CreateInspectableElementPayload,
): Promise<InspectableElement> {
  return apiFetch<InspectableElement>(
    `/communities/${communityId}/inspectable-elements`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateInspectableElement(
  communityId: string,
  elementId: string,
  payload: UpdateInspectableElementPayload,
): Promise<InspectableElement> {
  return apiFetch<InspectableElement>(
    `/communities/${communityId}/inspectable-elements/${elementId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

// 204 No Content on success (mirrors api/community.ts's softDeleteCommunity).
export function softDeleteInspectableElement(
  communityId: string,
  elementId: string,
): Promise<undefined> {
  return apiFetch<undefined>(
    `/communities/${communityId}/inspectable-elements/${elementId}`,
    { method: 'DELETE' },
  );
}
