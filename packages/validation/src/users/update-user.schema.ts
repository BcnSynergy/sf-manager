import { z } from 'zod';
import { applyMaintenanceCompanyRefinement, roleSchema } from './create-user.schema';

// design.md Interfaces/Contracts (PATCH /users/:id) — "accepts email, role,
// and (maintenance-company design.md Decision 5) maintenanceCompanyId".
// All fields are optional; UpdateUserUseCase applies only the fields
// actually present in the request.
//
// maintenance-company design.md Decision 5, shapes 1 & 2: because a PATCH is
// partial, this `.superRefine` can only judge the PAYLOAD'S OWN internal
// consistency — it has no knowledge of the user's existing role. It only
// fires when `role` is itself present in this request:
//   - role present, maintenance-side, no maintenanceCompanyId  -> reject
//   - role present, non-maintenance, maintenanceCompanyId set  -> reject
// A company-only reassignment (role absent) or a bare role demotion away
// from a maintenance role (company absent) cannot be judged here — that is
// exactly why UpdateUserUseCase re-checks the RESULTING state against the
// existing user (spec.md "Grandfathered Maintenance-Role Users", OQ2) and
// why the domain policy is the real authority, not this schema.
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
    applyMaintenanceCompanyRefinement(data.role, data.maintenanceCompanyId, ctx);
  });

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
