# Proposal: UI Redesign Foundation

## Intent

The web app still wears the Vite starter look, because every slice kept its UI
minimal (ADR-006). The product owner wants a modern visual redesign with the
same flows. The design was settled outside the repo first: the "SF-Manager"
design system (tokens, components, logos) and the "SF-Manager Screens" canvas.

This change brings the design system's foundation into `apps/web` and proves it
on the review schedule page. Later slices restyle the other pages one by one.

Success: every authenticated page renders inside the new shell (grouped left
sidebar, footer credit) with the new tokens, fonts and theme; the login page
shows the SF-Manager logo; the favicon is the shield; the review schedule page
matches the canvas; no flow, permission, route or data changes.

## Scope

### In Scope

- **Tokens and base styles.** The design system's color, type, spacing and
  radius tokens for light and dark, and its component classes (`sf-` prefix),
  in `apps/web/src/index.css`. Base element styles (body, headings, links,
  form controls, tables, buttons) so unrestyled pages already read cleanly.
  The Vite template tokens and the centered `#root` column go.
- **Theme.** Light or dark follows the OS (`prefers-color-scheme`), as today.
- **Fonts.** Montserrat (600, 700), Public Sans (400, 500, 600) and IBM Plex
  Mono (400) as committed woff2 files, Latin and Latin Extended subsets, under
  `apps/web/src/assets/fonts/` with their OFL license. No runtime dependency
  and no third-party request.
- **Brand.** `public/logo.svg` and `public/favicon.svg` replaced by the
  SF-Manager logo and shield, plus a dark-ground logo. The login page shows
  the logo in a card and the maker credit "A BCNSynergy product".
- **Shell.** The top link bar becomes a left sidebar: wordmark, Home, then the
  role's items in three groups (Operations, Setup, Administration), and a foot
  with the user's email as plain text, the language selector and logout. A
  footer under the content carries the credit. Group labels and the credit
  text in en/es/ca. Below about 800px the sidebar stacks above the content. No
  toggle or collapse state. Hidden in print, like today's nav.
- **Review schedule page.** Page header, table and status badges from the
  design system; the in-progress marker stays text after the status label.
- **Specs.** Deltas for `app-navigation` and `review-schedule-ui`, and a new
  `web-visual-foundation` capability.
- **Register.** New EN for community assignments that show raw user ids and
  assign by typing an id (seen while drawing the canvas).

### Out of Scope

- Restyling any page other than login and the review schedule.
- A theme toggle, a stored theme preference, or a high-contrast theme.
- An icon set, a profile menu, a hamburger menu, search or breadcrumbs.
- Any change to routes, roles, permissions, API or data, or to what prints:
  printed labels and review documents keep their content, layout and black on
  white. Their typography follows the design system (user decision
  2026-10-16, after the PR 1 native review).
- Changing which items each role sees.

## Capabilities

### New Capabilities

- `web-visual-foundation`: the app follows the OS light or dark preference;
  fonts load from the app's own origin; the login page shows the product logo
  and the maker credit; the favicon is the product mark.

### Modified Capabilities

- `app-navigation`:
  - "The Navigation Stays a Link Bar and Nothing More" becomes a requirement for
    a grouped sidebar with no toggle state, and it no longer forbids the design
    system, theming or branding.
  - The role table keeps every role's item set and gains each item's group and
    order: Home first, then Operations, Setup and Administration.
  - The user's email shows in the navigation as plain text.
  - The print rule also covers the footer.
- `review-schedule-ui`: new requirement "The Status Is Shown as a Badge" (word
  plus tone); the in-progress marker keeps its rule (text after the status
  label, no control).

## Approach

- Copy the design system's `tokens.json` values into CSS custom properties on
  `:root` with a `prefers-color-scheme: dark` override, and port `bundle.css`
  into `index.css`, keeping the print block and the print guard's layout rules.
- `nav-items.ts`: each item gains a `group`; a small helper groups a role's
  items in fixed order. `AppLayout` renders the sidebar and footer.
- Tests first per behavior: grouped order and labels per role, email shown,
  no group header for an empty group, the credit, the logo on login, the
  favicon link, the badge class on schedule statuses. The print guard keeps
  passing.
- Browser pass in light and dark at desktop and phone width for login, the
  shell and the review schedule, plus a print-preview check of the label and
  review document pages.

## Affected Areas

| Area                                                      | Impact   | Description                              |
| --------------------------------------------------------- | -------- | ---------------------------------------- |
| `apps/web/src/index.css`                                  | Modified | Tokens, fonts, base and component styles |
| `apps/web/src/assets/fonts/`                              | New      | woff2 files and OFL license              |
| `apps/web/public/logo.svg`, `favicon.svg`                 | Modified | Real logo and shield                     |
| `apps/web/public/logo-on-dark.svg`, `bcnsynergy-mark.svg` | New      | Dark-ground logo and maker mark          |
| `apps/web/src/pages/LoginPage.tsx`                        | Modified | Card layout, logo per theme, credit      |
| `apps/web/src/layout/AppLayout.tsx`, `nav-items.ts`       | Modified | Sidebar, groups, user email, footer      |
| `apps/web/src/pages/ReviewSchedulePage.tsx`               | Modified | Page header, table and badge classes     |
| `apps/web/src/i18n/locales/{en,es,ca}.json`               | Modified | Group labels, credit                     |
| `apps/web/src/**/*.test.tsx`                              | Modified | Nav order, login, schedule               |
| `openspec/changes/ui-redesign-foundation/specs/...`       | New      | Delta specs                              |
| `docs/enhancements.md`                                    | Modified | EN-57 (assignment ids)                   |

## Risks

| Risk                                                       | Likelihood | Mitigation                                                                |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| The sidebar or footer prints on labels or review documents | Medium     | Same `.app-nav` print rule and guard; real print preview of both pages    |
| Global base styles break an unrestyled page                | Medium     | Base styles stay conservative; browser pass over every list and form page |
| A role's nav items change by accident while regrouping     | Low        | Per-role tests on the exact item set and order                            |
| Text fails contrast in one theme                           | Low        | Token pairs checked at 4.5:1 in both themes in the design system          |
| Font files bloat the bundle                                | Low        | Six faces × two subsets, woff2, loaded on use by `@font-face`             |

## Rollback Plan

Revert the PRs in reverse order. No migration, no API or data change. If
reverted after archive, the spec deltas are reverted in the same PRs.

## Dependencies

None. No new package.

## Delivery

- Strategy: `ask-on-risk`; chain strategy `stacked-to-main`.
- Estimated size: about 950 authored changed lines, mostly CSS and tests.
  Font and SVG files are binary or generated and are not counted.
- PR 1/4 `ui-redesign-foundation/01-tokens-and-brand`: change artifacts,
  tokens, fonts, base styles, logos, favicon, login page. About 450 lines,
  most of them CSS.
- PR 2/4 `ui-redesign-foundation/02-sidebar-shell`: grouped sidebar, user
  email, footer credit, i18n, nav tests. About 350 lines.
- PR 3/4 `ui-redesign-foundation/03-review-schedule`: the page restyle, and
  EN-57. About 200 lines.
- PR 4/4 `ui-redesign-foundation/04-archive`: archive.

## Success Criteria

- [ ] Every authenticated page renders in the sidebar shell; each role sees
      exactly its current items, grouped and ordered as specified.
- [ ] Light and dark follow the OS; text meets 4.5:1 in both.
- [ ] Fonts load from the app's origin; no request leaves it.
- [ ] Login shows the logo for the active theme and the credit; the favicon
      is the shield.
- [ ] The review schedule matches the canvas; the in-progress marker rule holds.
- [ ] The label and review document pages print with no sidebar or footer.
- [ ] Browser-verified in light and dark at desktop and phone width.
