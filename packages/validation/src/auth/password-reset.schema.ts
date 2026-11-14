import { z } from 'zod';
import { passwordSchema } from '../users/password.schema';
import { loginEmailSchema } from './login.schema';

// password-reset S1, S3, S5: the two public bodies. The email is normalized
// exactly like login's (loginEmailSchema), so the API's per-email limit and
// the account lookup agree on one spelling. The locale is the language the
// user had selected in the web app; the emailed text follows it.
export const PASSWORD_RESET_LOCALES = ['en', 'es', 'ca'] as const;

export type PasswordResetLocale = (typeof PASSWORD_RESET_LOCALES)[number];

export const passwordResetRequestSchema = z.object({
  email: loginEmailSchema,
  locale: z.enum(PASSWORD_RESET_LOCALES).default('en'),
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

// The token is 256 bits in base64url (43 characters); the bound only stops
// oversized input before it is hashed. The password follows the one policy.
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordSchema,
});

export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
