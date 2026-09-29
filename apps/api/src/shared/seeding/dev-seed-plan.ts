import type { User } from '../../modules/users/domain/user.entity';
import type { ReviewTemplate } from '../../modules/review-template/domain/review-template.entity';
import { DEV_SEED_MARKER, type DevUser } from './dev-dataset';

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

export type TemplatePlan =
  | { kind: 'use-active'; id: string }
  | { kind: 'finish-draft'; id: string }
  | { kind: 'create' }
  | { kind: 'skip-foreign-draft'; id: string }
  | { kind: 'skip-unusable-active'; id: string };

// design.md Decision 5. `activeQuestionCount` is the frozen snapshot size of
// the lineage's active template (null when there is none): an empty one
// cannot be answered, so it is unusable rather than reused.
export function planTemplate(
  lineage: readonly Pick<ReviewTemplate, 'id' | 'status' | 'name'>[],
  activeQuestionCount: number | null,
): TemplatePlan {
  const active = lineage.find((t) => t.status === 'active');
  if (active) {
    return activeQuestionCount === 0
      ? { kind: 'skip-unusable-active', id: active.id }
      : { kind: 'use-active', id: active.id };
  }

  const draft = lineage.find((t) => t.status === 'draft');
  if (!draft) {
    return { kind: 'create' };
  }
  return draft.name.includes(DEV_SEED_MARKER)
    ? { kind: 'finish-draft', id: draft.id }
    : { kind: 'skip-foreign-draft', id: draft.id };
}
