import { z } from 'zod';
import { roleSchema } from './create-user.schema';

// design.md Interfaces/Contracts (PATCH /users/:id) — "accepts email and
// role only, password reset stays out of scope" (proposal). Both fields are
// optional; UpdateUserUseCase applies only the fields actually present.
export const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  role: roleSchema.optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
