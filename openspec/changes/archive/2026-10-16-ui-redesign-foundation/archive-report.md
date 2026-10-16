# Archive Report: ui-redesign-foundation

**Archived**: 2026-10-16
**Archive path**: `openspec/changes/archive/2026-10-16-ui-redesign-foundation/`
**Artifact store**: openspec files canonical; Engram notes under `sdd/ui-redesign-foundation/*`
**Branch**: `ui-redesign-foundation/04-archive` (from main at 2eedce2)

## Outcome

The web app now wears the "SF-Manager" design system instead of the Vite
starter look, with flows, routes, roles and data unchanged.

- **Foundation**: design-system tokens for light and dark (follows the OS),
  self-hosted Montserrat, Public Sans and IBM Plex Mono (woff2, OFL), and
  conservative base element styles so pages not yet restyled read cleanly.
- **Brand**: SF-Manager logo, dark-ground logo and shield favicon as SVG; the
  BCNSynergy maker credit on the login page and in the page footer.
- **Shell**: the top link bar became a grouped left sidebar (Home, then
  Operations, Setup, Administration) with the user's email, the language
  selector and logout; it stacks above the content under 840px. Every role
  keeps exactly its previous item set.
- **Review schedule**: the first page rebuilt from the design system's
  components (page header, table wrapper, status badges, outlined in-progress
  marker).
- **Print**: no chrome, credit or footer in print; labels and review documents
  keep their content, layout and black on white, and take the design system's
  typography (user decision after the PR 1 native review).

The design system itself lives outside the repo in the "SF-Manager" Design
System artifact; `apps/web/src/index.css` is the app's source of truth.

## Delivery (final state)

| PR            | Content                                                       | Merge   |
| ------------- | ------------------------------------------------------------- | ------- |
| #237 (PR 1/4) | Artifacts, tokens, fonts, base styles, logos, favicon, login  | 3a1ef31 |
| #238 (PR 2/4) | Grouped sidebar shell, user email, footer credit, print guard | 376486e |
| #239 (PR 3/4) | Review schedule badges, verify report                         | 2eedce2 |
| PR 4/4        | Archive: living specs, change folder, EN-59 extended          | pending |

## Specs Synced

| Capability              | Action   | Details                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-navigation`        | Modified | Purpose rewritten (grouped sidebar instead of "link bar and nothing more"). MODIFIED: role table with groups and order, print absence covering the footer. REMOVED: "The Navigation Stays a Link Bar and Nothing More". ADDED: grouped sidebar without toggle state (its no-dependency claim scoped to this change in a post-review edit, b373676), user email, group labels localized. |
| `review-schedule-ui`    | Modified | ADDED: "The Status Is Shown as a Badge".                                                                                                                                                                                                                                                                                                                                                |
| `web-visual-foundation` | Created  | Theme follows the OS, fonts from the app's origin, product marks, maker credit on screen only, real-browser verification.                                                                                                                                                                                                                                                               |

## Verification

`verify-report.md`: PASS. Every scenario of the three specs is covered by a
test or by the browser pass, including real print previews of the element
label and the review document confirmed by the product owner. Final web
suite: 70 files, 1171 tests.

## Reviews

- Each implementation PR had native RDD reviews (all approved) and a
  fresh-context review (APPROVE WITH NITS each); every finding was fixed in its
  PR or registered.
- User decisions recorded along the way: printed typography follows the design
  system; Edit/View actions stay links and get a button look in each page's
  later restyle slice; PR descriptions are signed "Authored by Jordi
  (@BcnSynergy), in collaboration with Claude Code".

## Registers

- Added during the change: EN-57 (community assignments show raw user ids),
  EN-58 (label print scope for table and code), EN-59 (print-rule tests,
  extended in this PR with the print badge rules), EN-60 (print guard
  ancestor case), TD-38 (intermittent TD-8 test failure under load).
- Resolved: none.

## Follow-ups

- Restyle the remaining pages one per slice (list pages first: their Edit/View
  links get the design system's button look).
- The design system artifact carries the `brand-mark` token added in PR 2;
  keep it in step with `index.css` when tokens change.
