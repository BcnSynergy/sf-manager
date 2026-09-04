-- label-printing/design.md Decision 4: backfill inside the migration, index
-- first, `SET NOT NULL` last. Order is load-bearing:
--   1. add nullable "code" (a nullable unique column still permits many
--      NULLs, so the unique index below is legal pre-backfill);
--   2. create the unique index BEFORE the backfill, so uniqueness is
--      DB-enforced during the backfill loop itself (same mechanism as the
--      runtime insert path's P2002 retry, not a parallel one);
--   3. per-row backfill with up to 10 retries on unique_violation;
--   4. SET NOT NULL last, so the migration fails closed if any row was
--      somehow missed by the loop above.
-- VARCHAR(10), not CHAR(10): blank-padded comparison semantics would make
-- 'ABC       ' compare equal to 'ABC'.
-- Index name "InspectableElement_code_key" matches Prisma's canonical name
-- for `code String @unique` in schema.prisma exactly, so this hand-written
-- SQL stays Prisma-visible and the schema does not drift.
-- Re-runnable from empty: zero rows means the DO block below is a no-op.

-- AlterTable
ALTER TABLE "InspectableElement" ADD COLUMN "code" VARCHAR(10);

-- CreateIndex
CREATE UNIQUE INDEX "InspectableElement_code_key" ON "InspectableElement"("code");

-- Backfill: SQL random(), not a CSPRNG — deliberate (design.md Decision 4):
-- the domain model requires non-sequential, not unguessable, codes here;
-- every code-bearing surface stays authenticated regardless.
DO $$
DECLARE r RECORD; candidate TEXT; attempt INT;
BEGIN
  FOR r IN SELECT id FROM "InspectableElement" WHERE "code" IS NULL LOOP
    attempt := 0;
    LOOP
      attempt := attempt + 1;
      SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
             (floor(random() * 31)::int) + 1, 1), '')
        INTO candidate FROM generate_series(1, 10);
      BEGIN
        UPDATE "InspectableElement" SET "code" = candidate WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempt >= 10 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- AlterTable: closes the door — fails the whole migration if any row was
-- somehow left without a code.
ALTER TABLE "InspectableElement" ALTER COLUMN "code" SET NOT NULL;

-- Temporary bridge default (label-printing PR1 only, not in design.md):
-- application-level generation (node:crypto randomInt over the code
-- alphabet, design.md Decision 3) is not wired until Phase 3 (PR3). Without
-- a default, this NOT NULL/UNIQUE column would break every pre-existing
-- integration test and manual insert that creates an InspectableElement row
-- without knowing about `code` yet. This DEFAULT is inert once Phase 3
-- lands — the create use case will always supply an explicit,
-- application-generated code on every INSERT, which overrides any column
-- default. Draws from the same alphabet as the backfill above (so the
-- "every code is well-formed" invariant holds for the whole table, not just
-- backfilled rows) via SQL random(), same non-CSPRNG rationale as the
-- backfill (Decision 4) — deliberately NOT a retrying insert path, so this
-- bridge (unlike the app's runtime generator) has no collision retry.
-- Revisit removing this function + default once Phase 3 (PR3) merges.
CREATE OR REPLACE FUNCTION "temp_bridge_random_inspectable_element_code"()
RETURNS VARCHAR(10)
LANGUAGE sql
AS $$
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
         (floor(random() * 31)::int) + 1, 1), '')
  FROM generate_series(1, 10);
$$;

ALTER TABLE "InspectableElement" ALTER COLUMN "code"
  SET DEFAULT "temp_bridge_random_inspectable_element_code"();
