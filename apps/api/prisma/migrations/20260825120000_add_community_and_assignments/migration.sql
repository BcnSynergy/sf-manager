-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'es', 'ca');

-- CreateTable
CREATE TABLE "Community" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityRepresentative" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityTechnician" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityTechnician_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRepresentative_communityId_userId_key" ON "CommunityRepresentative"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTechnician_communityId_userId_key" ON "CommunityTechnician"("communityId", "userId");

-- Hand-edited migration (design.md Decision 2, Gotcha): Prisma's schema DSL
-- has no `WHERE` clause on `@@unique`, so this partial unique index cannot
-- be expressed in schema.prisma and is therefore INVISIBLE to Prisma's
-- migration diffing. Precedent for hand-editing a generated migration this
-- way: `20260822100000_add_user_role/migration.sql`.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- migration file or diff schema.prisma against the database in a way that
-- could DROP this index — Prisma has no knowledge of it. Guarded by an
-- integration test asserting the index's continued presence in
-- `pg_indexes` (design.md Testing Strategy, PR 8).
--
-- Backstop for the one-active-representative-per-community invariant
-- (design.md Decision 2). The application-layer seam
-- (CommunityRepresentativeRepository.transactional() at Postgres
-- SERIALIZABLE, mirroring PrismaUserRepository.transactional) is the
-- primary enforcement; this index protects paths that bypass it entirely
-- (seeds, raw SQL, a future use case that forgets to wrap). Under normal
-- operation this index never fires; a `P2002` on its name maps to the same
-- `TransactionConflictError`/409 as a `P2034` serialization failure.
CREATE UNIQUE INDEX "CommunityRepresentative_one_active_per_community" ON "CommunityRepresentative"("communityId") WHERE "deactivatedAt" IS NULL;

-- Hand-edited migration (fresh-context review of PR 1, applied before merge):
-- referential integrity for the assignment tables. `schema.prisma` has no
-- `@relation` fields here (mirroring the `users` module's zero-Prisma-relation
-- convention), so — same as the partial unique index above — these FK
-- constraints are INVISIBLE to Prisma's migration diffing.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- migration file or diff schema.prisma against the database in a way that
-- could DROP these constraints — Prisma has no knowledge of them.
--
-- `ON DELETE RESTRICT` (the default) is correct: `User` and `Community` rows
-- are never hard-deleted (ADR-010 soft delete), so the referenced row always
-- still physically exists — RESTRICT simply matches that invariant rather
-- than needing to fire.
ALTER TABLE "CommunityRepresentative" ADD CONSTRAINT "CommunityRepresentative_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityRepresentative" ADD CONSTRAINT "CommunityRepresentative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityTechnician" ADD CONSTRAINT "CommunityTechnician_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityTechnician" ADD CONSTRAINT "CommunityTechnician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
