# Apply Progress: ci-pipeline

**Mode**: Strict TDD project, but every task is config/docs (N/A cycles).
**Batch 1**: Phase A (A.1-A.8). Branch `ci-pipeline/01-ci-workflow`. Single PR, no size exception.

## Completed Tasks
- [x] A.1 turbo.json `passThroughEnv`
- [x] A.2 `.github/workflows/ci.yml` (checkout@v7 / setup-node@v7 confirmed current: v7.0.1 / v7.0.0)
- [x] A.3 Workflow reviewed against spec
- [x] A.4 ADR-017
- [x] A.5 INDEX row
- [x] A.6 README section
- [x] A.7 Lint and diff stat
- [x] A.8 Single conventional commit

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR | Verification run |
|------|-----|-------|----------|------------------|
| A.1 | N/A (config/docs) | N/A | N/A | `npx turbo run build --dry=json`: envMode strict; `@sf-manager/api#build` specified.passThroughEnv = ["DATABASE_URL"]. Pass |
| A.2 | N/A (config/docs) | N/A | N/A | `gh api .../releases/latest`: checkout v7.0.1, setup-node v7.0.0 (majors unchanged). Pass |
| A.3 | N/A (config/docs) | N/A | N/A | js-yaml (already in node_modules) parsed the file: keys name/on/permissions/concurrency/jobs, on = pull_request + push[main], permissions = contents:read, 8 steps. grep for `pull_request_target`, `secrets.`, `NODE_ENV`, `DOTENV`, `always()` found nothing. Pass |
| A.4 | N/A (config/docs) | N/A | N/A | Manual review against ADR-016 format and design outline; UTF-8 confirmed with `file`. Pass |
| A.5 | N/A (config/docs) | N/A | N/A | `git diff --stat` shows INDEX.md +1 line only. Pass |
| A.6 | N/A (config/docs) | N/A | N/A | `git diff --stat` shows README.md +16; section placed before `## Structure`, after "Other commands" and its reset subsection. Pass |
| A.7 | N/A (config/docs) | N/A | N/A | `npm run lint`: 0 errors, 4 pre-existing warnings (auth.controller.spec.ts). Pass |
| A.8 | N/A (config/docs) | N/A | N/A | Commit created on `ci-pipeline/01-ci-workflow`. Pass |

## Deviations from Design
- README section is placed after the "One-time dev database reset" subsection (which belongs to "Other commands"), immediately before `## Structure`, so it does not split that section.
- ci.yml expands the design's flow-style YAML maps to block style and adds a `name: Build` on the build step plus explanatory comments. Semantics are identical.

## Issues Found
None. `npm ci` on npm 11 and the setup-node cache behavior remain open questions for Phase B (B.1).
