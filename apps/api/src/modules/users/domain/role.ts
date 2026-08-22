// Hand-written string-literal union (design.md Decision 4) — deliberately
// NOT the Prisma-generated `$Enums.Role` (ADR-013: the domain layer has zero
// Prisma/framework dependency). The values mirror the Postgres `Role` enum
// exactly (authorization spec, "Role Enum Declaration"). No `user.isAdmin()`
// or role-comparison helper lives here — ADR-011 §3 keeps that logic in the
// permission rule table (added in a later PR), not scattered across callers.
export type Role =
  | 'SYSTEM_ADMIN'
  | 'MANAGER'
  | 'MAINTENANCE_COMPANY_MANAGER'
  | 'MAINTENANCE_TECHNICIAN'
  | 'COMMUNITY_REPRESENTATIVE';
