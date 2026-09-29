import type { User } from '../../modules/users/domain/user.entity';
import type { DevUser } from './dev-dataset';

// dev-seed-data design.md Decision 4: every seeded entity is looked up by a
// natural key a person recognizes (tax id, email, name), never by a fixed
// UUID. Pure so the skip-if-exists decision is unit-testable without ports.
export function findByNaturalKey<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  wanted: string,
): T | undefined {
  return rows.find((row) => keyOf(row) === wanted);
}

// design.md Decision 11: a user that already exists with a different role or
// company has drifted from the dataset. Returns a human-readable difference,
// or null when there is none. Drift detection deliberately covers role and
// company only (Accepted Limitations).
export function describeUserDrift(
  existing: User,
  desired: DevUser,
  desiredCompanyId: string | null,
): string | null {
  const differences: string[] = [];

  if (existing.role !== desired.role) {
    differences.push(`role is ${existing.role}, expected ${desired.role}`);
  }
  if (existing.maintenanceCompanyId !== desiredCompanyId) {
    differences.push(
      `company is ${existing.maintenanceCompanyId ?? 'none'}, expected ${desiredCompanyId ?? 'none'}`,
    );
  }

  return differences.length === 0 ? null : differences.join('; ');
}
