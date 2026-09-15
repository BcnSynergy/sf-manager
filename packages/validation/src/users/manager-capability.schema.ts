import { z } from 'zod';

// review-history-manager-capability/design.md Decision 1/6: the single
// declared ADR-011 Decision 2 capability member. Mirrors roleSchema's shape
// (create-user.schema.ts) — one source of truth for apps/api and apps/web
// alike (ADR-015).
export const managerCapabilitySchema = z.enum(['VIEW_ALL_REVIEWS']);

export type ManagerCapability = z.infer<typeof managerCapabilitySchema>;

// design.md Decision 6: mirrors
// applyMaintenanceCompanyNotAllowedRefinement's shape exactly, with one
// deliberate difference — this refinement fires only when the supplied
// array is NON-EMPTY (`managerCapabilities !== undefined &&
// managerCapabilities.length > 0`), never merely on `!== undefined`. A bare
// `!== undefined` check would incorrectly reject
// `{role: 'SYSTEM_ADMIN', managerCapabilities: []}` — but `[]` always means
// "explicit revoke, always allowed", regardless of the resulting role.
export function applyManagerCapabilitiesNotAllowedRefinement(
  role: string,
  managerCapabilities: readonly ManagerCapability[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (
    role !== 'MANAGER' &&
    managerCapabilities !== undefined &&
    managerCapabilities.length > 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['managerCapabilities'],
      message: `Role "${role}" does not accept managerCapabilities`,
      // apps/api's UserCodedZodValidationPipe reads this tag to attach the
      // machine-readable `code` before Nest's parameter-binding pipe stage
      // rejects the request — mirrors
      // applyMaintenanceCompanyNotAllowedRefinement's `userErrorCode` tag
      // (create-user.schema.ts) exactly, now sharing the same tag key
      // (design.md Decision 6 — "one small generalization").
      params: { userErrorCode: 'MANAGER_CAPABILITIES_NOT_ALLOWED' },
    });
  }
}
