import { describe, expect, it } from 'vitest';
import { loginEmailSchema, loginRequestSchema } from './login.schema';

describe('loginEmailSchema', () => {
  it('trims and lowercases a valid email', () => {
    expect(loginEmailSchema.parse('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('leaves an already normalized email unchanged', () => {
    expect(loginEmailSchema.parse('user@example.com')).toBe('user@example.com');
  });

  it.each([
    ['a number', 42],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a string that is not an email', 'not-an-email'],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, value) => {
    expect(loginEmailSchema.safeParse(value).success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('normalizes the email exactly as loginEmailSchema does', () => {
    const raw = ' User@Example.com ';

    const parsed = loginRequestSchema.parse({ email: raw, password: 'x' });

    expect(parsed.email).toBe(loginEmailSchema.parse(raw));
    expect(parsed.email).toBe('user@example.com');
  });

  it('still rejects an empty password', () => {
    expect(loginRequestSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(
      false,
    );
  });
});
