# Orphan signature file sweep (EN-243, EN-244)

Objective: extend the EN-222 orphan file sweep to `review-signatures/` (EN-244) and `signatures/` (EN-243). Delivery: `stacked-to-main`, branches `orphan-signature-sweep/<NN>-<slug>` (forecast about 800 authored lines in 2 PRs). Runners: Jest in `apps/api` (`npm test`, `npm run test:integration`), `npm run format:check`.
Locator: `odd/tasks/orphan-signature-sweep.md` (Engram mirror: `odd/orphan-signature-sweep/tasks`). Spec change: yes (user confirmed 2026-11-26, "si").

## Specs

- **S1** Shared sweep (proposed by Claude, accepted with "si"): "Saco la lógica actual a un helper compartido: listar, filtrar lo que tiene más de 1 h, la protección de "sin ninguna fila no borro nada", borrar lo que nadie referencia y registrar el resultado en el log. El helper recibe el directorio y dos consultas: qué claves están referenciadas y si existe alguna fila." The photo sweep keeps its behavior and log lines.
- **S2** EN-244: "`review-signatures/` se añade a la limpieza de `review-session`, porque las filas que la referencian son sesiones." A file there is kept while a `ReviewSession.signatureStorageKey` references it; same one-hour age, no-row guard, interrupted-write cleanup and logging as the photo sweep. Spec `review-session-management` (the orphan sweep requirement covers it).
- **S3** EN-243: "`signatures/` tendrá su propia limpieza en el módulo `reviewer-signature`, con las consultas en su repositorio. Así ningún módulo lee las tablas de otro. Usará la misma pauta de ejecución: 5 min después del arranque y luego cada 24 h." A file there is kept while a `ReviewerSignature.storageKey` references it. Spec `reviewer-signature` gains a requirement.
- **S4** Out of scope: "La limpieza de `logos/` queda fuera".

## Tasks

| ID  | Specs  | Route  | Status | Commit / PR                  |
| --- | ------ | ------ | ------ | ---------------------------- |
| T1  | S1, S2 | inline | done   | PR 1/2 #483, merge `5f8622b` |
| T2  | S3     | inline | done   | PR 2/2 #484, merge `c6a1f2a` |

Route evidence: no writer trigger (sequential, dependent units; T2 reuses T1's helper and scheduler). Risk: item 1 (deletes stored files) on both, so an independent verifier runs at the feature's end, besides each PR's fresh review.

## Log

- **L1** (2026-11-26) User request: "EN-243 y EN-244". Then "si" to the proposal above (spec change yes).
- **L2** Design: one scheduler in `review-session` (renamed from the photo-only one) runs every sweep, each failure logged on its own; T2 exports the `signatures/` sweep from `reviewer-signature` (review-session already imports that module). Sessions have no soft delete and `ReviewerSignature` rows are never deleted, so every row still counts as a reference.
- **L3** T1 evidence: unit suite 186/1975, `prisma-review-session.repository` integration 29/29, eslint and `format:check` clean. Mutation probes killed: no-row guard off, wrong directory, references ignored, signature sweep not run, no stop check between sweeps, sweeps in parallel, label in error, `hasAnySignedSession` without its filter, `findReferencedSignatureStorageKeys` unfiltered. The two new unscoped reads tripped the port-surface guard ("No unscoped session read exists"); added to its list (they return keys, not sessions) plus a call-site guard, following the installation-wide reads' precedent. Split: about 360 code, 490 test, 80 docs lines.
- **L4** T1 fresh review: APPROVE. W-1 fixed: `review-history` spec (_Exactly two actor-unscoped reads exist_) now names the sweep's two reads as the exception, so changed specs are `review-session-management` and `review-history`. S-1 (a thrown `complete()` after a committed UPDATE deletes the recorded copy, pre-existing on main) registered as TD-55. S-2 (assert false before signing) not applied: the rolled-back transaction test already pins the false case.
- **L5** T2 evidence (branch `orphan-signature-sweep/02-signatures`, based on PR 1): unit suite 187/1981, `prisma-reviewer-signature` integration 7/7, eslint and `format:check` clean. Mutation probes killed: no-row guard off, wrong directory, references ignored, own sweep not run, own sweep not awaited, sweep not exported (DI bootstrap), `hasAnySignature` always true, `findReferencedStorageKeys` unfiltered. No call-site guard in `reviewer-signature`: its reads return keys only and the photo repository's equivalent reads have none either. The logo upload's same leftover (mentioned in EN-243) registered as EN-246, per S4.
- **L6** Independent verification of the whole feature (9951928..7f6db37), also PR 2's fresh review: APPROVE, S1-S4 met, no referenced file can be deleted, 6 probes killed (none survived, so no regression test to add). W-1 fixed: the module comment "the only export" reworded. S-1 applied: the sweep is exported as the `ORPHAN_SIGNATURE_FILE_SWEEP` port token (`useExisting`), as every other cross-module export, instead of the use-case class; dropping the export still fails the DI bootstrap test. Prisma integration tests not run by the verifier (`.env` deny rule); run by the parent (29/29, 7/7).
- **L7** (2026-11-26) Closed. PR 1/2 #483: `952c108` (feature), `ccedf74` (review-history spec, TD-55), merged as `5f8622b`; the independent verification of the whole feature served as its pre-merge review (user: "adelante"). PR 2/2 #484, rebased on main after #483 merged: `e6ef81e` (feature), `edf8e0a` (port token), merged as `c6a1f2a`; CI green on both. Specs changed: `review-session-management`, `review-history`, `reviewer-signature`. Registers: EN-244 and EN-243 Done; TD-55 and EN-246 added. Deployed to production (deploy.yml run 45877277568, success): the new sweeps first run 5 minutes after the API starts, then every 24 hours.
