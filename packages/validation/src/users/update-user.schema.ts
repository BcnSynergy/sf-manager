import { z } from 'zod';
import {
  applyMaintenanceCompanyNotAllowedRefinement,
  roleSchema,
} from './create-user.schema';
import {
  applyManagerCapabilitiesNotAllowedRefinement,
  managerCapabilitySchema,
} from './manager-capability.schema';

// design.md Interfaces/Contracts (PATCH /users/:id) — "accepts email, role,
// and (maintenance-company design.md Decision 5) maintenanceCompanyId".
// All fields are optional; UpdateUserUseCase applies only the fields
// actually present in the request.
//
// maintenance-company design.md Decision 5, shape 2: because a PATCH is
// partial, this `.superRefine` can only judge the PAYLOAD'S OWN internal
// consistency — it has no knowledge of the user's existing role or
// maintenanceCompanyId. It only fires when `role` is itself present in this
// request, and only enforces the NOT_ALLOWED direction:
//   - role present, non-maintenance, maintenanceCompanyId set  -> reject
// The REQUIRED direction (role present, maintenance-side, no
// maintenanceCompanyId in THIS payload) is deliberately NOT enforced here —
// it is resulting-state-dependent, not payload-decidable. A maintenance-side
// role transition that inherits an existing, live maintenanceCompanyId from
// the current user (e.g. MAINTENANCE_TECHNICIAN -> MAINTENANCE_COMPANY_MANAGER
// without re-supplying maintenanceCompanyId) is valid, and this schema has
// no visibility into that existing state to tell it apart from a genuine
// violation. UpdateUserUseCase re-checks the REQUIRED direction against the
// RESULTING state (spec.md "Grandfathered Maintenance-Role Users", OQ2) —
// it is the sole authority for that direction, not this schema.
// review-history-manager-capability/design.md Decision 6:
// `managerCapabilities` is optional, mirroring `maintenanceCompanyId`'s
// partial-PATCH shape. `.superRefine`'s NOT_ALLOWED direction fires only
// when `role` is present in the payload (same payload-decidability
// constraint documented above) AND the supplied array is non-empty — `[]`
// always means "explicit revoke", legal for any resulting role
// (applyManagerCapabilitiesNotAllowedRefinement's own guard).
export const updateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    role: roleSchema.optional(),
    maintenanceCompanyId: z.string().trim().min(1).optional(),
    managerCapabilities: z.array(managerCapabilitySchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === undefined) {
      return;
    }
    // design.md Decision 6, "Precedence when a payload violates both
    // tagged refinements at once": the maintenance-company refinement MUST
    // run FIRST so it wins whenever a single payload is simultaneously
    // rejectable by both — UserCodedZodValidationPipe (formerly
    // MaintenanceCompanyZodValidationPipe) returns the FIRST tagged issue
    // found in `.superRefine`'s issue array. Fixed order, not incidental.
    applyMaintenanceCompanyNotAllowedRefinement(
      data.role,
      data.maintenanceCompanyId,
      ctx,
    );
    applyManagerCapabilitiesNotAllowedRefinement(
      data.role,
      data.managerCapabilities,
      ctx,
    );
  });

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
