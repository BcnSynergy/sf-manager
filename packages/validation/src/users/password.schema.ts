import { z } from 'zod';

// design.md Decision 6: the strength predicate lives here (ADR-015 — single
// source of truth for validation, shared by the API's ZodValidationPipe and
// the web admin form) and is imported by the users/domain PlainPassword VO
// instead of being re-implemented there. Rule per spec.md "Password Strength
// Policy": minimum length 10, at least one letter, at least one digit.
export const passwordSchema = z
  .string()
  .min(10, { message: 'Password must be at least 10 characters long' })
  .refine((value) => /[A-Za-z]/.test(value), {
    message: 'Password must contain at least one letter',
  })
  .refine((value) => /[0-9]/.test(value), {
    message: 'Password must contain at least one digit',
  });

export type Password = z.infer<typeof passwordSchema>;
