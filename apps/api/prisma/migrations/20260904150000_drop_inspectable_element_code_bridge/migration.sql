-- label-printing/design.md Decision 4a + tasks.md 3.10: mandatory cleanup
-- of the PR1 transitional bridge (20260904090000_add_inspectable_element_code
-- migration.sql) now that PR3 wires the real application-level generator
-- (RandomElementCodeGenerator, node:crypto randomInt, bounded 3-attempt
-- retry loop in CreateInspectableElementUseCase). Every real create path now
-- always supplies an explicit, application-generated code, so the DB-level
-- default is dead weight, not a safety net.
--
-- Order matters: drop the DEFAULT before dropping the function it invokes —
-- a live default referencing a dropped function would leave every future
-- INSERT that omits `code` broken with an undefined-function error instead
-- of the intended NOT NULL violation.

-- AlterTable: drop the default first.
ALTER TABLE "InspectableElement" ALTER COLUMN "code" DROP DEFAULT;

-- Drop the now-unreferenced bridge function. Any rows already created with a
-- bridge-generated code during the PR1->PR3 window are NOT touched — those
-- codes are permanent (design.md Decision 4a, "Consequence, stated
-- plainly"); only the default/function themselves become dead code from
-- here on.
DROP FUNCTION "temp_bridge_random_inspectable_element_code"();
