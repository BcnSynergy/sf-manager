import { WeakPasswordError } from './errors/weak-password.error';
import { PlainPassword } from './password';

// design.md Decision 6: PlainPassword VO — private constructor + static
// create(raw), throws WeakPasswordError when raw fails passwordSchema
// (packages/validation). toString() must redact so plaintext never leaks
// into a log or error dump. spec.md "Password Strength Policy": min 10
// chars, at least one letter, at least one digit.
describe('PlainPassword', () => {
  it('creates a PlainPassword for a conforming password', () => {
    const password = PlainPassword.create('correct-horse1');

    expect(password.value).toBe('correct-horse1');
  });

  it('throws WeakPasswordError for a password shorter than 10 characters', () => {
    expect(() => PlainPassword.create('short1a')).toThrow(WeakPasswordError);
  });

  it('throws WeakPasswordError for a password without a digit', () => {
    expect(() => PlainPassword.create('onlylettersnodigits')).toThrow(
      WeakPasswordError,
    );
  });

  it('throws WeakPasswordError for a password without a letter', () => {
    expect(() => PlainPassword.create('1234567890')).toThrow(WeakPasswordError);
  });

  it('redacts the password in toString() so it never leaks into a log', () => {
    const password = PlainPassword.create('correct-horse1');

    expect(password.toString()).toBe('[REDACTED]');
    expect(String(password)).toBe('[REDACTED]');
  });
});
