import { z } from 'zod';

// ADR-015: single source of truth for validation, shared by the API's
// ZodValidationPipe and the web login form. Trim/lowercase run BEFORE the
// email-format check via `.pipe`, so leading/trailing whitespace never fails
// validation before normalization has a chance to run (design.md
// Interfaces/Contracts).
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
