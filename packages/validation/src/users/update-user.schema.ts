import { z } from 'zod';
import {
  applyMaintenanceCompanyNotAllowedRefinement,
  roleSchema,
} from './create-user.schema';

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
export const updateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    role: roleSchema.optional(),
    maintenanceCompanyId: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === undefined) {
      return;
    }
    applyMaintenanceCompanyNotAllowedRefinement(
      data.role,
      data.maintenanceCompanyId,
      ctx,
    );
  });

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
