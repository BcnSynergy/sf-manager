# Print check cascade

Locator: `odd/tasks/print-check-cascade.md` (Engram mirror: `odd/print-check-cascade/tasks`).
Objective: rewrite `checkAppNavPrintSuppression` (`apps/web/src/styles/check-app-nav-print-suppression.ts`) as a cascade model on `postcss`, resolving EN-96, EN-97 and EN-98. Branch `print-check-cascade/01-postcss-cascade`, one PR, stacked-to-main; delivery `ask-on-risk`, forecast about 450 authored lines (most of it tests). Test runner: Vitest, run from `apps/web` (`npx vitest run src/styles`) and `npm run test --workspace=@sf-manager/web`. No spec change (test tooling; user confirmed "si"). Risk: item 5 (declares a dev dependency) and item 6 (no test catches a defect in the checker except its own).

## Specs

- S1: Option B as proposed and accepted ("si"): rewrite the check as a cascade model on a real CSS parser, `postcss` (already installed by Vite, 8.5.26), declared as a devDependency of `apps/web`. Each rule is read with its context (screen only, always print, conditional print, `@supports`), its real subject (the last compound of the selector, so `.app-nav a` does not target the nav and `.foo .app-nav` does), its specificity, and its `display` declaration with its priority, outside nested rules.
- S2: The nav counts as hidden when a rule that always applies in print hides it and no rule that may apply in print shows it with more weight (`!important`, then specificity, then order).
- S3: The existing checks stay: a visible screen rule before the deciding print block, and no rule for the nav itself after the hide (other than in a later block hiding it again). Every existing test keeps its result, except where an EN-96/97/98 item changes it.
- S4: `nav.app-nav` keeps failing on purpose: the check cannot know which element carries the class.
- S5: EN-96 shapes stop failing: a descendant rule after the hide (`.app-nav a { color: black }`); a hiding rule that nests CSS (`.app-nav { display: none; &:hover { ... } }`); an `!important` show that cannot win in print (in `@media screen`, or in a descendant rule such as `.app-nav a { display: block !important }`); an `!important` hide followed by a plain hide in the same block.
- S6: EN-97: a more specific visible rule that may apply in print (`.shell .app-nav { display: flex !important }` before a print `.app-nav { display: none !important }`) fails the check.
- S7: EN-98: an `!important` show in a conditional print block after the deciding one (`@media print and (min-width: 1px) { .app-nav { display: flex !important } .app-nav { display: none } }`) fails the check.
- S8: `print-blocks.ts` stays: `index-css-print-credit.test.ts` and `index-css-print-status-region.test.ts` still use it.
- S9: Registers: EN-96, EN-97, EN-98 move to Done in the same PR; non-blocking review findings are registered.

## Tasks

| ID  | Specs         | Scope                                                                                                    | Route  | Status | Commit    |
| --- | ------------- | -------------------------------------------------------------------------------------------------------- | ------ | ------ | --------- |
| T1  | S1, S3, S8    | Declare `postcss`; rewrite the check on postcss with subject, context and rank; all existing tests green | inline | done   | c9d1aa9   |
| T2  | S2, S4–S7, S9 | RED tests for EN-96/97/98 shapes, cascade ranking, registers                                             | inline | done   | T2 commit |

Route evidence: sequential units on one file pair, written inline by the parent; no writer trigger. Risk items 5 and 6 fire the verification trigger: an independent verifier runs at the feature's end.

## Log

- L1 (2026-10-25, user, verbatim): "seguimos con EN-96 a EN-98", then "si" to option B (cascade model on `postcss`), then "si" to no spec change.
- L2 (2026-10-25): analysis. `postcss` 8.5.26 is hoisted from Vite and parses nesting into child rules, keeps comments and strings apart, and throws `CssSyntaxError` "Unclosed block" at the opening rule's position, so the existing "The @media <query> block is not properly closed." reason can be rebuilt from that position. `print-blocks.ts` is still used by two other index.css tests, so it stays. Existing reasons and the 60 existing tests are the baseline to preserve. Next: T1.
- L3 (2026-10-25): T1 done (c9d1aa9). `postcss` declared in `apps/web/package.json` by hand at `^8.5.26` (npm's own `--save-dev` re-sorted the whole block); the lockfile gains one line. The check walks the postcss tree: per style rule (and per at-rule with declarations nested in a rule) its resolved nesting, outermost print block, whether every enclosing `@media` may apply in print, and its own `display`. Specificity is computed by a small tokenizer (`:where()` zero; `:is()`, `:not()`, `:has()` their most specific argument). All 113 existing style tests passed unchanged; tsc and eslint clean.
- L4 (2026-10-25): T2. 12 new tests in "with the cascade in print". Run against `main`'s check (copied in, then restored): 9 failed (the five EN-96 shapes, both EN-97 specificity cases, the later important show over an earlier important hide, the EN-98 conditional block), 3 passed there too and stay as regression guards (`:where()` show, the compound `nav.app-nav` hide still failing, a later conditional block that shows then hides). With the new check: 125 style tests pass. The EN-98 case reports the `!important` reason, which is accurate (the show precedes that block's own plain hide). EN-96, EN-97, EN-98 moved to Done (forecast PR #286).
