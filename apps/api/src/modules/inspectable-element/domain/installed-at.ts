// design.md Decision 3: `installedAt` is the first calendar date a human
// types in this schema — every existing temporal column (createdAt,
// updatedAt, deletedAt, deactivatedAt, expiresAt) is an instant the server
// writes. Postgres stores it as `DATE` (no time component), so both
// conversions are pinned to UTC midnight in exactly one place: an admin who
// types '2026-03-15' sees '2026-03-15' back, regardless of the server's or
// the browser's local timezone. Pure functions, no VO (design.md Decision
// 2) — mirrors the pure-function shape of `last-admin.policy.ts` /
// `maintenance-company-deletion.policy.ts`.
export function parseInstalledAt(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatInstalledAt(value: Date): string {
  return value.toISOString().slice(0, 10);
}
