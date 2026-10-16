# Exploration: UI Redesign Foundation

## Problem

Every slice so far shipped the minimal UI its spec needed (ADR-006), so the web
app still wears the Vite starter look: purple accent `#aa3bff`, a centered
1126px column, system fonts, a placeholder `logo.svg` and the Vite bolt as
favicon. The product owner wants a modern visual redesign with flows unchanged.

A design system and screen mockups were made first, outside the repo:

- Design system "SF-Manager" (claude.ai artifact): tokens for light and dark,
  type scale (Montserrat display, Public Sans text, IBM Plex Mono data),
  components (AppNav sidebar, PageHeader, Button, TextField, Select, Choice,
  DataTable, StatusBadge, DetailList, Alert, ConfirmDialog, Brand) and the
  logos as SVG.
- Canvas "SF-Manager Screens": sign in, review schedule (light and dark),
  community details, answer element on a phone (light and dark).

This change brings the foundation into the repo and proves it on one page.
Later slices restyle the remaining pages one at a time.

## Current state

- Styling: one stylesheet, `apps/web/src/index.css`, imported in `main.tsx:3`.
  It holds the Vite template tokens (`:1-30`), a `prefers-color-scheme: dark`
  block (`:32-49`), the centered `#root` column (`:51-61`), `.app-nav` flex
  (`:132-135`), `.visually-hidden` (`:141-152`) and one `@media print` block
  (`:163-239`). No inline styles, no CSS modules, no UI or font dependency.
- Shell: `layout/AppLayout.tsx:52` renders `<nav className="app-nav"
data-testid="nav-root">` with role links (`NavLink`, `nav-link-<slug>`),
  then logout (`nav-logout-button`), then `LanguageSelector`. Items come from
  `NAV_ITEMS_BY_ROLE` in `layout/nav-items.ts:76-92`. Only `/login` renders
  outside the layout (`App.tsx:27-37`); the label and review-document pages
  render inside it and hide the nav in print.
- Print guard: `styles/check-app-nav-print-suppression.ts` requires a visible
  `.app-nav` rule before the first `@media print` block of `index.css`,
  `display: none` inside it, and none after. It runs in `vitest run` in CI.
- Tests pinned to the nav: `AppLayout.test.tsx` asserts the exact ordered
  link testids per role (`:58-80`, `:96-98`), 9 admin links (`:139`) and one
  combobox in the nav (`:339`). `App.test.tsx:244,265,319` checks `nav-root`.
- Login: `pages/LoginPage.tsx` renders the selector, `<img src="/logo.svg"
data-testid="login-logo">`, the heading and the form. `index.html:5` links
  `/favicon.svg`.
- Review schedule: `pages/ReviewSchedulePage.tsx:60-106`, a captioned table;
  the status cell holds the label text and, for drafts, a
  `review-schedule-in-progress-<rowKey>` span (`:79-89`).

## Spec constraints

- `app-navigation` "The Navigation Stays a Link Bar and Nothing More"
  (`spec.md:464-472`): MUST NOT introduce "a sidebar, … a design system, CSS
  framework, theming or app branding". The Purpose (`:25-28`) repeats it.
  This change must modify that requirement.
- `app-navigation` "The Role → Navigation Items Map Is Exhaustive and Fixed"
  (`:96`): the table lists each role's items "in the order shown". Grouping
  the sidebar reorders them, so the table changes.
- `app-navigation` "Absent From Printed Output" (`:381`), `element-label-printing`
  `:94-112` and `review-document-ui` `:144-153`: no chrome in print, verified
  with a real print preview. The new sidebar and footer fall under this.
- `web-locale-selection:45,51`: exactly one selector on `LoginPage` and one in
  the layout.
- `review-schedule-ui:162-169`: the in-progress marker stays text, in the status
  cell, after the status label. `:142-148`: no controls.
- `web-table-accessibility:11,68,85`: caption first, hidden via
  `visually-hidden`, `scope="col"`.

No ADR covers UI styling (ADR-015 covers Vite, Router, Zod, Vitest).

## Options

### Fonts

1. **Commit the woff2 files (chosen).** Latin and Latin Extended subsets for
   the weights in use, under `apps/web/src/assets/fonts/`, declared with
   `@font-face`. All three families are SIL OFL 1.1, which allows bundling.
   No runtime dependency, no request to Google.
2. `@fontsource/*` packages. Rejected: three new dependencies for static files.
3. Google Fonts `<link>`. Rejected: a third-party request on every load and a
   privacy cost for a back office.

### Theme

1. **Follow the OS through `prefers-color-scheme` (chosen).** The current CSS
   already does this; the change replaces the palette. No toggle, no stored
   preference.
2. A theme toggle. Rejected for this slice: new state and UI that no screen
   needs.

### Sidebar structure

1. **Static groups in `nav-items.ts` (chosen).** Each item gets a group
   (`operations`, `setup`, `administration`); Home stays first, outside any
   group. The role table stays exhaustive; a group with no items for a role is
   not rendered.
2. Group in the component by route prefix. Rejected: implicit and untyped.

### Styles

1. **Plain CSS: tokens and component classes in `index.css` (chosen),** moved
   from the design system's `tokens.json` and `bundle.css` (`sf-` prefix).
   Keeps the print guard and the existing single-stylesheet setup.
2. CSS modules or a CSS-in-JS library. Rejected: a new pattern or dependency
   for no gain at this size.

## Decisions to confirm

- Home keeps its own item at the top of the sidebar, outside the groups.
- The sidebar foot shows the signed-in user's email as plain text, next to the
  language selector and logout. It is not a menu.
- Only the review schedule page is restyled here; other pages get the new
  shell, tokens and base element styles, and their own restyle later.
