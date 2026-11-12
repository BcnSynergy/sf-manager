// EN-180: strength rules shared by every signing or keying secret
// (JWT_SECRET, THROTTLE_KEY_SECRET). A short secret can be brute-forced
// offline from one known token or one stored key, and surrounding whitespace
// is almost always a copy-paste or quoting mistake that silently changes the
// secret, so both stop startup. Messages never include the value.
export const MIN_SECRET_LENGTH = 32;

export function readSecret(variable: string): string {
  const value = process.env[variable];
  if (!value) {
    throw new Error(`${variable} environment variable is required`);
  }
  if (value !== value.trim()) {
    throw new Error(`${variable} must not start or end with whitespace`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${variable} must be at least ${MIN_SECRET_LENGTH} characters long, got ${value.length}`,
    );
  }
  return value;
}
