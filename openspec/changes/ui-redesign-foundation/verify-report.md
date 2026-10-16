# Verify Report: UI Redesign Foundation

Date: 2026-10-16. Branches `ui-redesign-foundation/01-tokens-and-brand` (#237),
`02-sidebar-shell` (#238) and `03-review-schedule`.

## Verdict

PASS. Every spec scenario is covered by a test or by the browser pass; no
blocker.

## Spec coverage

### web-visual-foundation

| Scenario                                     | Evidence                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light OS, light app / Dark OS, dark app      | Browser: OS in dark mode; light checked by injecting the light tokens (the extension cannot switch the OS theme)                                     |
| No theme control                             | No theme control exists; the shell's controls are enumerated in `AppLayout.test.tsx` ("one combobox", links, logout)                                 |
| No third-party request                       | `styles/index-css-fonts.test.ts` (no cross-origin `url()` or `@import`); browser: only the app's origin and its API were requested                   |
| Characters of every locale are covered       | `index-css-fonts.test.ts` (Latin and Latin Extended faces per family); browser: Catalan copy renders in Montserrat and Public Sans                   |
| Logo on login in each theme                  | `LoginPage.test.tsx` (`<picture>` with dark `<source>`, one `<img>`, localized alt); browser: dark variant chosen (`currentSrc`)                     |
| Favicon                                      | `index-html.test.ts` (icon link; square shield, one brand ink, no text)                                                                              |
| Credit on login and on an authenticated page | `LoginPage.test.tsx`, `AppLayout.test.tsx` (text, not a link, en/ca)                                                                                 |
| Credit absent in print                       | `styles/index-css-print-credit.test.ts`; footer hidden by the print guard; element label real print preview (product owner)                          |
| Browser pass                                 | Login, shell and review schedule in both themes, at desktop width and 400px; real print preview of the label and the review document (product owner) |

### app-navigation (delta)

| Scenario                                                                                                                                     | Evidence                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Each of the five roles sees exactly its own item set                                                                                         | `AppLayout.test.tsx` role matrix; item sets compared with the pre-change `nav-items.ts` by the fresh review                 |
| Items render in the specified order and groups                                                                                               | `nav-items.test.ts` (`groupNavItems` per role); `AppLayout.test.tsx` interleaved labels and links                           |
| An empty group renders nothing                                                                                                               | `AppLayout.test.tsx` "renders no Setup or Administration group for a manager"                                               |
| Admin reaches nine sections; organization profile; schedule for four roles; profile-independent; new role fails the build; no CRUD sub-route | Existing tests, unchanged and passing (`AppLayout.test.tsx`, `nav-items.reachability.test.ts`, `satisfies Record<Role, …>`) |
| The navigation and the footer do not print                                                                                                   | Print guard over `.app-nav` and `.app-footer`; real print previews of the label and the review document                     |
| Print suppression is verified in a browser                                                                                                   | Real print preview of the element label and the review document, confirmed by the product owner                             |
| The sidebar holds wordmark, items and foot in order                                                                                          | `AppLayout.test.tsx` (wordmark, groups, email, selector, logout); browser                                                   |
| The sidebar stacks on a narrow screen                                                                                                        | Browser: 400px and 820px stack, 850px and wider beside, no horizontal page scroll on four pages                             |
| The controls are only links, one selector and logout; no collapse state                                                                      | `AppLayout.test.tsx`; the component holds no state                                                                          |
| No dependency and no backend change                                                                                                          | `package.json` and `apps/api` untouched by the three PRs                                                                    |
| The email is shown; the email triggers no request                                                                                            | `AppLayout.test.tsx`                                                                                                        |
| Group labels in each locale                                                                                                                  | `AppLayout.test.tsx` (ca); locale parity test                                                                               |

### review-schedule-ui (delta)

| Scenario                                 | Evidence                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each status gets its tone                | `schedule-labels.test.ts` (`mapStatusToBadgeTone`); `ReviewSchedulePage.test.tsx` (badge word and tone class)                                                                                 |
| The marker follows the badge             | `ReviewSchedulePage.test.tsx` "shows the warning badge followed by the marker for a never-reviewed row in progress" (warning badge, draft badge after it, read as two phrases, not a control) |
| The badge in the browser, in both themes | Browser: all five badge styles measured in both themes; lowest text contrast 5.44:1 (notice, light)                                                                                           |

## Checks

- `npm run test --workspace=apps/web`: 70 files, 1171 tests pass. One
  intermittent TD-8 test failure under load was seen during PR 2 and is
  registered as TD-38.
- `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/web`
  and `npm run format:check` pass.
- The API e2e web-tree scans (`review-session`, `review-template`) forbid
  some identifiers in non-schedule web files; none appear in the changed
  files.

## Reviews

- PR 1 and PR 2: native RDD reviews approved (findings fixed or registered as
  EN-58, EN-59, EN-60) and fresh-context reviews APPROVE WITH NITS (all nits
  fixed in the same PR).
- User decision after the PR 1 native review: printed output keeps content,
  layout and black on white; its typography follows the design system.

## Registers

- Added: EN-57, EN-58, EN-59, EN-60, TD-38.
- Resolved: none.
