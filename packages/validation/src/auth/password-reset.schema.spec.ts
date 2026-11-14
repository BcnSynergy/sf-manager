import { describe, expect, it } from 'vitest';
import { passwordResetConfirmSchema, passwordResetRequestSchema } from './password-reset.schema';

describe('passwordResetRequestSchema', () => {
  it('normalizes the email like the login schema and defaults the locale to en', () => {
    expect(passwordResetRequestSchema.parse({ email: '  User@Example.COM ' })).toEqual({
      email: 'user@example.com',
      locale: 'en',
    });
  });

  it.each(['en', 'es', 'ca'])('accepts the locale %s', (locale) => {
    expect(passwordResetRequestSchema.parse({ email: 'a@example.com', locale }).locale).toBe(
      locale,
    );
  });

  it.each([
    ['an unsupported locale', { email: 'a@example.com', locale: 'fr' }],
    ['a missing email', { locale: 'en' }],
    ['an invalid email', { email: 'nope' }],
  ])('rejects %s', (_label, body) => {
    expect(passwordResetRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('passwordResetConfirmSchema', () => {
  it('accepts a token and a password that meets the policy', () => {
    expect(passwordResetConfirmSchema.parse({ token: 'abc', password: 'abcdefghi1' })).toEqual({
      token: 'abc',
      password: 'abcdefghi1',
    });
  });

  it.each([
    ['an empty token', { token: '', password: 'abcdefghi1' }],
    ['a missing token', { password: 'abcdefghi1' }],
    ['a weak password', { token: 'abc', password: 'short1' }],
    ['a token over 256 characters', { token: 'a'.repeat(257), password: 'abcdefghi1' }],
  ])('rejects %s', (_label, body) => {
    expect(passwordResetConfirmSchema.safeParse(body).success).toBe(false);
  });
});
