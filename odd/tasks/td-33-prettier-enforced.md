# TD-33: Enforce Prettier

Locator: `odd/tasks/td-33-prettier-enforced.md` (Engram mirror: `odd/td-33-prettier-enforced/tasks`).
Route: ODD (the user confirmed 2026-10-14; tooling only, no behavior in `openspec/specs/`).
Branches: `td-33-prettier-enforced/01-format-check` (PR 1, code), `td-33-prettier-enforced/02-format-docs` (PR 2, docs).
Delivery: two PRs, stacked to main (the user chose 2026-10-14): code first, everything else second.

## Objective

Make `prettier --check` part of CI so formatting drift cannot land on `main`.

## Problem

Prettier is a dependency but nothing enforces it (TD-33). `main` fails `prettier --check`: about 86 code files (mostly `apps/web/src`, `packages/validation/src`, ESLint configs) and about 300 Markdown/YAML files (`openspec/`, `docs/`, root docs). `openspec/config.yaml` does not parse. On Windows, `core.autocrlf=true` gives CRLF working trees, so the default `endOfLine: lf` fails every file locally.

## Scope

PR 1 (code):

- `endOfLine: "auto"` in `.prettierrc.json` and `apps/api/.prettierrc` (matches the API ESLint `prettier/prettier` option).
- `.prettierignore`: build output, generated files, and, for now, `*.md`, `*.yaml`, `*.yml`.
- Root scripts `format` and `format:check`; CI step `Format` after Lint.
- One formatting-only commit for the code files, listed in `.git-blame-ignore-revs`.
- README: document the scripts and the CI order.

PR 2 (docs):

- Remove the Markdown/YAML exclusions, fix or ignore `openspec/config.yaml`, format the rest in one formatting-only commit (also in `.git-blame-ignore-revs`).
- Confirm the formatted OpenSpec files still work with the SDD tooling (archive compose).
- TD-33 to Resolved.

Out: changing Prettier options other than `endOfLine`; unifying the API's own `.prettierrc` with the root one.

## Constraints

- Formatting-only commits change no behavior: build, lint, typecheck and unit tests stay green.
- Planning heuristic: about 400 authored lines per task; the formatting commits are mechanical and generated, so they are excluded from that count.

## TDD

Mode: strict TDD is enabled for the project (ADR-016), but this is tooling with no unit under test. The check itself is the test: RED = `npm run format:check` fails on `main`; GREEN = it passes after formatting. Runner: Prettier CLI.

## Tasks

- [x] T1 Config: `endOfLine: auto`, `.prettierignore`, root `format` / `format:check` scripts. Route: inline (mechanical). RED: `format:check` fails.
- [x] T2 Format the code files (formatting-only commit). Route: inline (tool). GREEN: `format:check` passes; build, lint, typecheck, unit green.
- [x] T3 CI `Format` step, `.git-blame-ignore-revs`, README. Route: inline.
- [ ] T4 PR 1: fresh review, push, PR, CI, merge (ask the user at each step).
- [ ] T5 PR 2: drop the doc exclusions, handle `openspec/config.yaml`, format docs, verify SDD tooling, TD-33 to Resolved.
- [ ] T6 PR 2: fresh review, push, PR, CI, merge.

## Acceptance

- `npm run format:check` passes on `main` and runs in CI.
- After PR 2, only build output and generated files are ignored.

## Progress

- 2026-10-14: measured the drift (`--end-of-line auto`): 86 code files, ~300 docs files. Document created.
- T1 `836573f`: RED observed, `npm run format:check` exit 1, "Code style issues found in 86 files".
- T2 `1bcbd81` (formatting only, 86 files, +622/-655): GREEN, `format:check` passes; build, lint (0 errors, 6 pre-existing API warnings), API typecheck and unit (api 1487, all 5 turbo tasks) green.
- T3: CI `Format` step after Lint, `.git-blame-ignore-revs` with `1bcbd81`, README scripts and CI order.

## Next step

T4 (PR 1 fresh review, then push/PR/merge with the user's OK).
