# Tasks: UI Redesign Foundation

## Review Workload Forecast

| Area                                  | Estimate                          |
| ------------------------------------- | --------------------------------- |
| CSS (`index.css`)                     | ~420 lines                        |
| Web source (layout, nav, login, page) | ~150                              |
| Web tests                             | ~330                              |
| i18n, registers                       | ~40                               |
| SVG, fonts                            | not counted (generated or binary) |
| **Total (excl. SDD artifacts)**       | **~940**                          |

Over the 400-line budget: chained PRs, `stacked-to-main`.

### Suggested Work Units

- PR 1/4 `ui-redesign-foundation/01-tokens-and-brand`: phases A-C (~400).
- PR 2/4 `ui-redesign-foundation/02-sidebar-shell`: phases D-E (~350).
- PR 3/4 `ui-redesign-foundation/03-review-schedule`: phase F (~190).
- PR 4/4 `ui-redesign-foundation/04-archive`: phase H.

## Phase A: Branch and baseline (PR 1)

- [x] A.1 Branch `ui-redesign-foundation/01-tokens-and-brand` from `main`;
      baseline web Vitest, `npm run build`, `npm run format:check` green.

## Phase B: Tokens, fonts, base styles (spec: web-visual-foundation)

- [x] B.1 RED: test that `index.css` has no `http(s)://` URL (fonts from own
      origin).
- [x] B.2 Fonts: download the six woff2 files from the fontsource packages
      (design Decision 3), add `OFL.txt` per family and `README.md` (package,
      version, subsets).
- [x] B.3 GREEN: `index.css` per design Decisions 1, 2 and 4. Remove the Vite
      tokens, `#root` column and `text-align: center`. Keep `.app-nav`,
      `.visually-hidden`, the label and review-document rules and the print
      block in guard order.
- [x] B.4 Print guard and print-rule tests still green.

## Phase C: Brand and login (spec: The Product Is Branded…, The Maker Credit…)

- [x] C.1 RED: `LoginPage.test.tsx`: `<picture>` with a dark `<source>` and the
      `login-logo` `<img>` with the localized alt; `login-credit` with the
      localized credit; still exactly one language selector; form testids
      unchanged.
- [x] C.2 RED: test that `index.html` links `/favicon.svg` as the icon.
- [x] C.3 GREEN: SVGs into `public/` (design Decision 9); `LoginPage` card
      layout (Decision 8); `brand.credit` in en/es/ca; login CSS.
- [x] C.4 Full web suite, build, lint, format; browser pass of `/login` in
      both themes and at 400px.

## Gate PR 1 (orchestrator)

- [ ] Native review (if due), fresh-context review, push, PR, CI, merge, each
      confirmed with the user.

## Phase D: Navigation groups (spec: Role map; Group Labels Are Localized)

- [ ] D.1 Branch `ui-redesign-foundation/02-sidebar-shell` from `main`.
- [ ] D.2 RED: `nav-items.test.ts`: `groupNavItems` for each role returns the
      spec table's sections in order; empty groups omitted.
- [ ] D.3 RED: `AppLayout.test.tsx`: ordered link testids per role updated to
      the new order; group labels per role; MANAGER has no setup or
      administration group; wordmark present and not a link; existing
      one-combobox and logout tests unchanged.
- [ ] D.4 GREEN: `NavGroup`, `group` on items, reordered rows,
      `groupNavItems`, `nav.group.*` keys in en/es/ca.

## Phase E: Sidebar shell (spec: Grouped Sidebar; Email; Print)

- [ ] E.1 RED: `AppLayout.test.tsx`: `nav-user-email` shows the user's email
      and the layout issues no request; `app-footer` with the credit renders
      with the nav and not while loading.
- [ ] E.2 RED: print guard generalized to `['.app-nav', '.app-footer']`, with
      a fixture where only the footer breaks the rule (design Decision 7).
- [ ] E.3 GREEN: `AppLayout` markup (Decision 6), shell CSS, print rules.
      Move the PR 1 interim `:where(#root) > main` screen rule AND its print
      reset to `.sf-main > main` (fresh review of PR 1).
- [ ] E.4 Check new test ids against the API e2e web-tree scans.
- [ ] E.5 Full web suite, build, lint, format; browser pass: each seeded role
      in both themes and at 400px; print preview of the label and review
      document pages (user opens the preview).

## Gate PR 2 (orchestrator)

- [ ] Native review (if due), fresh-context review, push, PR, CI, merge, each
      confirmed with the user.

## Phase F: Review schedule (spec: The Status Is Shown as a Badge) — PR 3

- [ ] F.1 Branch `ui-redesign-foundation/03-review-schedule` from `main`.
- [ ] F.2 RED: `ReviewSchedulePage.test.tsx`: `review-schedule-status-<rowKey>`
      carries the tone class per status; the in-progress marker follows it,
      has the draft badge class and is not a control; existing state tests
      unchanged.
- [ ] F.3 GREEN: page markup (design Decision 10), `STATUS_TONE`, badge and
      table CSS.
- [ ] F.4 EN-57 in `docs/enhancements.md`: community assignments list raw user
      ids and assign by typing an id.
- [ ] F.5 Full web suite, build, lint, format; browser pass of the schedule in
      both themes and at 400px with the seeded draft.
- [ ] F.6 verify-report.md for the change.

## Gate PR 3 (orchestrator)

- [ ] Native review (if due), fresh-context review, push, PR, CI, merge, each
      confirmed with the user.

## Phase H: PR 4 — archive (branch `ui-redesign-foundation/04-archive`)

- [ ] H.1 Merge the deltas into `openspec/specs/app-navigation` (including
      the Purpose rewrite noted at the top of its delta) and
      `review-schedule-ui`; create `openspec/specs/web-visual-foundation`.
- [ ] H.2 Move the change to `openspec/changes/archive/<date>-ui-redesign-foundation/`
      with archive-report.md; register any non-blocking findings.
