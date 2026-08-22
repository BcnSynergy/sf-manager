-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SYSTEM_ADMIN', 'MANAGER', 'MAINTENANCE_COMPANY_MANAGER', 'MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE');

-- Hand-edited migration (design.md Decision 9): a required column cannot be
-- added to a non-empty table without a value, and a schema-level `@default`
-- would silently decide the role of every future insert too. Step 1: add
-- the column nullable.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "Role";

-- Step 2: fail-closed backfill. MANAGER carries zero permissions in this
-- slice (design.md Decision 5) — no existing row gains privilege from this
-- migration; only the seeded admin is later promoted to SYSTEM_ADMIN by
-- prisma/seed.ts.
UPDATE "User" SET "role" = 'MANAGER' WHERE "role" IS NULL;

-- Step 3: every row now has a value — enforce NOT NULL.
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
