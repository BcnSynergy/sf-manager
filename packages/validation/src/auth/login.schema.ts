import { z } from 'zod';

// ADR-015: single source of truth for validation, shared by the API's
// ZodValidationPipe and the web login form. Trim/lowercase run BEFORE the
// email-format check via `.pipe`, so leading/trailing whitespace never fails
// validation before normalization has a chance to run (design.md
// Interfaces/Contracts).
//
// `loginEmailSchema` is meant to also be parsed by the API's login throttler
// guard (planned for login-account-lockout PR 3) and to feed the per-email
// failure limiter (design.md Decision 2), so request validation and
// rate-limit bucketing can never drift apart on how an email is normalized.
export const loginEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginRequestSchema = z.object({
  email: loginEmailSchema,
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
