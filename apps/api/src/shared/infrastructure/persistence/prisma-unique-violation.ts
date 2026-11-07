import { Prisma } from '@prisma/client';

// Prisma's unique-constraint violation code.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface UniqueConstraint {
  // Postgres name of the unique constraint or unique index, as created by
  // the migrations (e.g. `InspectableElement_code_key`).
  name: string;
  // Exactly the columns it covers, unquoted.
  columns: readonly string[];
}

// True when `error` is a P2002 raised by `constraint`.
//
// Under Prisma 7 with the @prisma/adapter-pg driver adapter (this project's
// PrismaService), `error.meta.target` is never populated for P2002s; the
// violated constraint comes through under
// `error.meta.driverAdapterError.cause.constraint`, in one of two shapes
// (TD-49):
//
// - `{ index: <constraint name> }`: adapter-pg 7.10+ whenever Postgres names
//   the constraint, which it does in practice for every unique violation.
// - `{ fields: <quoted column names> }`: adapter-pg 7.9, and 7.10+ as a
//   fallback when Postgres reports no constraint name.
//
// The name is authoritative when present, so a partial index over a subset
// of another constraint's columns is never mistaken for it. Otherwise the
// columns must match exactly. An unreadable shape returns false, so callers
// fall back to their own safe default instead of mislabeling the error.
export function isUniqueViolationOf(
  error: unknown,
  constraint: UniqueConstraint,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return false;
  }
  const reported = readReportedConstraint(error.meta);
  if (!reported) {
    return false;
  }
  if (typeof reported.index === 'string') {
    return reported.index === constraint.name;
  }
  if (!Array.isArray(reported.fields)) {
    return false;
  }
  const fields = reported.fields
    .filter((field): field is string => typeof field === 'string')
    .map((field) => field.replace(/"/g, ''));
  return (
    fields.length === constraint.columns.length &&
    constraint.columns.every((column) => fields.includes(column))
  );
}

// Narrowed step-by-step (no `any`) to satisfy `no-unsafe-member-access`.
function readReportedConstraint(
  meta: unknown,
): Record<string, unknown> | undefined {
  if (typeof meta !== 'object' || meta === null) {
    return undefined;
  }
  const driverAdapterError = (meta as Record<string, unknown>)
    .driverAdapterError;
  if (typeof driverAdapterError !== 'object' || driverAdapterError === null) {
    return undefined;
  }
  const cause = (driverAdapterError as Record<string, unknown>).cause;
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }
  const constraint = (cause as Record<string, unknown>).constraint;
  if (typeof constraint !== 'object' || constraint === null) {
    return undefined;
  }
  return constraint as Record<string, unknown>;
}
