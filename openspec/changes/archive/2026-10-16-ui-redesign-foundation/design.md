# Design: UI Redesign Foundation

## Technical Approach

Port the "SF-Manager" design system into the web app as plain CSS, regroup the
navigation into a sidebar, brand the login page, and restyle the review
schedule as the first page built from the design system's components. Nothing
in routing, auth, API calls or data changes.

Three PRs carry the work (proposal, Delivery), each green on its own:

1. Tokens, fonts, base element styles, logos, favicon, login.
2. Sidebar shell, user email, footer credit.
3. Review schedule restyle, EN-57.

## Architecture Decisions

### Decision 1: One stylesheet, tokens as custom properties

`apps/web/src/index.css` stays the only stylesheet. It gets, in order:

1. `@font-face` rules (Decision 3).
2. Tokens on `:root` with the light values from the design system's
   `tokens.json`, `color-scheme: light dark`, and a
   `@media (prefers-color-scheme: dark)` block redefining only the color and
   shadow tokens. Names keep the design system's (`--ground`, `--ink`,
   `--brand`, `--space-4`, `--radius-md`, `--font-display`…). PR 2 adds
   `--brand-mark` (`#c5052a` in both themes) for the typeset wordmark beside
   the shield, so it matches the logo; `--brand` stays the UI accent and
   lightens in dark mode (user feedback in the PR 2 browser pass).
3. Base element styles (Decision 4).
4. Component classes from the design system's `bundle.css` that this change
   uses, `sf-` prefix: shell (`sf-shell`, `sf-side*`, `sf-main`,
   `sf-footer`, `sf-credit`, `sf-wordmark*`), `sf-page-header`,
   `sf-page-title`, `sf-table-wrap`, `sf-badge*`, `sf-empty`, `sf-login*`.
   The rest of `bundle.css` arrives with the pages that need it.
5. The existing `.app-nav` screen rule, `.visually-hidden`, the label and
   review-document rules, and the `@media print` block, in the order the
   print guard requires.

Rejected: CSS modules or a CSS-in-JS library (a new pattern or dependency
for one shell and one page); splitting into several files (the print guard
reads `index.css` alone, and EN-50 already notes its path limitation).

### Decision 2: Theme by media query only

No `data-theme` attribute and no toggle: only `prefers-color-scheme`. The
dark block sets `color-scheme: dark` so native controls follow. Print keeps
its forced black-on-white rules; they already override the tokens.

### Decision 3: Committed variable fonts

From the fontsource npm packages (OFL 1.1), downloaded once and committed:

| Family        | Package                            | Files                                                 |
| ------------- | ---------------------------------- | ----------------------------------------------------- |
| Montserrat    | `@fontsource-variable/montserrat`  | `montserrat-latin-wght-normal.woff2`, `-latin-ext-`   |
| Public Sans   | `@fontsource-variable/public-sans` | `public-sans-latin-wght-normal.woff2`, `-latin-ext-`  |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` (400)  | `ibm-plex-mono-latin-400-normal.woff2`, `-latin-ext-` |

Six files under `apps/web/src/assets/fonts/`, with `OFL.txt` per family and a
`README.md` naming package and version. Each `@font-face` uses the
package's own `unicode-range` for its subset, `font-display: swap`, and a
`url('./assets/fonts/…')` that Vite fingerprints. Variable faces cover every
weight in use (Montserrat 600–700, Public Sans 400–600) in one file per
subset.

Rejected: the npm packages as dependencies (three runtime deps for static
files); Google Fonts (third-party request, which the new spec forbids).

### Decision 4: Unrestyled pages inherit a conservative base

About thirty pages keep their markup in this change. So that they do not look
broken next to the new shell, base styles target bare elements:

- `body`: `--ground`, `--ink`, Public Sans 15/22. `#root` loses its 1126px
  centered column and `text-align: center`.
- `.sf-main > main` (PR 1 ships it as `:where(#root) > main`, because the
  shell wrapper arrives in PR 2; PR 2 MUST move both that screen rule and its
  print reset to `.sf-main > main`): max width `--content-max`, padding `--space-12`
  `--space-8` (`--space-4` on phones), vertical gap. Every page's existing
  `<main>` gets the page layout without edits.
- `h1` page-title style, `h2` section-title style, both `--ink`.
- `a` in `--notice`; `button` as the secondary button; `input`, `select`,
  `textarea` as the design system's fields; `label` semibold.
- `table`: full width, collapsed borders, `label`-style headers on
  `--surface-sunken`, row hairlines. `dl`: two-column grid.

Base rules use element selectors only (specificity 0,0,1) so any `sf-` class
wins. The print block's forced colors (`.label-print`, `.review-document-print`)
keep their higher specificity.

### Decision 5: Groups live in `nav-items.ts`

```ts
export type NavGroup = 'operations' | 'setup' | 'administration';
export type NavItem = { …; readonly group?: NavGroup };
export const NAV_GROUP_ORDER = ['operations', 'setup', 'administration'] as const;
export function groupNavItems(items: readonly NavItem[]): NavSection[];
// NavSection = { group: NavGroup | null; items: NavItem[] }
```

Each item constant gets its group once (HOME none; REVIEW_SCHEDULE,
REVIEW_SESSIONS, REVIEW_HISTORY `operations`; COMMUNITIES,
MAINTENANCE_COMPANIES, REVIEW_TEMPLATES, CHECKLIST_QUESTIONS `setup`; USERS,
ORGANIZATION_PROFILE `administration`). `NAV_ITEMS_BY_ROLE` rows are reordered
to the spec table; the `satisfies Record<Role, …>` guard stays.
`groupNavItems` returns the ungrouped section first, then one section per
non-empty group in `NAV_GROUP_ORDER`, items in row order. Labels:
`nav.group.operations|setup|administration`.

### Decision 6: Shell markup

```tsx
<div className="sf-shell">
  {showNav && (
    <nav className="app-nav sf-side" data-testid="nav-root" aria-label={t('nav.label')}>
      <div className="sf-wordmark" data-testid="nav-wordmark">
        <img src="/favicon.svg" alt="" /> <span><span className="sf-wordmark-sf">SF</span>-Manager</span>
      </div>
      {sections.map((s) => (
        <div className="sf-side-group" key={s.group ?? 'home'} data-testid={`nav-group-${s.group ?? 'home'}`}>
          {s.group && <p className="sf-side-label">{t(`nav.group.${s.group}`)}</p>}
          {s.items.map((item) => <NavLink className="sf-side-link" … />)}
        </div>
      ))}
      <div className="sf-side-foot">
        <span className="sf-user" data-testid="nav-user-email">{user.email}</span>
        <LanguageSelector />
        <button type="button" className="sf-btn-ghost" data-testid="nav-logout-button">…</button>
      </div>
    </nav>
  )}
  <div className="sf-main">
    <PageSuspense resetKey={location.pathname}><Outlet /></PageSuspense>
    {showNav && <footer className="app-footer sf-footer" data-testid="app-footer">…credit…</footer>}
  </div>
</div>
```

- The wordmark is not a link: the role's links stay exactly the spec's items,
  so the existing ordered-testid tests keep their meaning.
- The wordmark is "SF-Manager" text, so the shield `<img>` is decorative
  (`alt=""`).
- `NavLink` already sets `aria-current="page"`; the CSS draws the brand marker
  from it.
- The footer renders only with the nav: on the loading render nothing flashes
  (spec, no empty chrome).
- `.app-nav` stays on the `<nav>` so the print rule and its guard keep
  working.

### Decision 7: Print suppression covers the footer

The `@media print` block gains `.app-footer { display: none }` and resets
the shell to a single block column (`.sf-shell { display: block }`,
`.sf-main > main` without max width or padding) so the label and document
print at full width as today.

The guard `checkAppNavPrintSuppression` is generalized to a list of chrome
selectors, `['.app-nav', '.app-footer']`. Each one needs a visible rule
before the first print block, `display: none` inside it, and no rule after
it. The test covers both selectors, plus a fixture where only the footer
breaks the rule.

### Decision 8: Login logo by `<picture>`

```tsx
<picture>
  <source srcSet="/logo-on-dark.svg" media="(prefers-color-scheme: dark)" />
  <img src="/logo.svg" alt={t('auth.logoAlt')} data-testid="login-logo" />
</picture>
```

One `<img>`, one alt text, and the browser picks the variant, so no CSS
show/hide and no duplicate in the accessibility tree. The page becomes the
design system's login card (`sf-login`, `sf-login-card`). The form, its
testids and its behavior stay as they are. Under the form go the credit and
the language selector, which stays the page's only selector.

### Decision 9: Assets

`public/logo.svg`, `public/logo-on-dark.svg`, `public/favicon.svg` and
`public/bcnsynergy-mark.svg` (plus `bcnsynergy-mark-on-dark.svg`, added after the browser pass showed the navy mark unreadable on the dark ground; the login credit swaps it with `<picture>` like the logo) are the design system's SVGs. The shield marks
are traced and the SF-Manager lettering is Montserrat outlines, so the SVGs
need no font. `index.html` keeps `<link rel="icon" type="image/svg+xml"
href="/favicon.svg">`, with the same path and a new file.

### Decision 10: Review schedule markup

`ReviewSchedulePage` keeps its states, testids and data. It changes only:

- `<header className="sf-page-header">` around the `h1`.
- `<div className="sf-table-wrap">` around the table.
- The status label becomes `<span className={`sf-badge sf-badge-${tone}`}
data-testid="review-schedule-status-<rowKey>">`, with `tone` from a typed
  `STATUS_TONE: Record<ReviewScheduleStatus, BadgeTone>` (`danger`,
  `warning`, `notice`, `success`).
- The in-progress marker keeps its testid and translation and gets
  `sf-badge sf-badge-draft`. The parentheses the JSX adds today go, because
  the outlined badge already sets it apart.
- The empty, loading and error paragraphs get `sf-empty`.

## Data Flow

Unchanged. `AppLayout` reads `user.email` and `user.role` from `useAuth()`,
which it already reads; no request is added.

## File Changes

| File                                                              | Action        | PR      |
| ----------------------------------------------------------------- | ------------- | ------- |
| `apps/web/src/index.css`                                          | Modify        | 1, 2, 3 |
| `apps/web/src/assets/fonts/*` (6 woff2, 3 OFL, README)            | Create        | 1       |
| `apps/web/public/{logo,logo-on-dark,favicon,bcnsynergy-mark}.svg` | Create/Modify | 1       |
| `apps/web/src/pages/LoginPage.tsx` + test                         | Modify        | 1       |
| `apps/web/src/i18n/locales/{en,es,ca}.json`                       | Modify        | 1, 2    |
| `apps/web/src/styles/check-app-nav-print-suppression.ts` + test   | Modify        | 2       |
| `apps/web/src/layout/nav-items.ts` + test                         | Modify        | 2       |
| `apps/web/src/layout/AppLayout.tsx` + tests                       | Modify        | 2       |
| `apps/web/src/pages/ReviewSchedulePage.tsx` + test                | Modify        | 3       |
| `docs/enhancements.md`                                            | Modify        | 3       |
| `openspec/changes/ui-redesign-foundation/**`                      | Create        | 1       |

## Interfaces / Contracts

- New i18n keys: `brand.credit`, `nav.group.operations`, `nav.group.setup`,
  `nav.group.administration`.
- New test ids: `nav-wordmark`, `nav-group-<home|operations|setup|administration>`,
  `nav-user-email`, `app-footer`, `login-credit`, `review-schedule-status-<rowKey>`.
  Check the names against the API e2e web-tree scans (`review-template` and
  `review-session` e2e specs).
- No API, route or type change outside `apps/web`.

## Testing Strategy

| Spec                              | Test                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Role map, order and groups        | `nav-items.test.ts`: `groupNavItems` per role; `AppLayout.test.tsx` ordered testids and group labels per role |
| Empty group renders nothing       | `AppLayout.test.tsx`: MANAGER has no setup or administration group                                            |
| Sidebar controls                  | Existing one-combobox and logout tests; wordmark has no link                                                  |
| Email shown, no request           | `AppLayout.test.tsx`: email text; fetch mock not called by the layout                                         |
| Print absent (nav and footer)     | Print guard test over both selectors; real print preview in the browser                                       |
| Group labels and credit localized | Locale parity test (existing) plus a render check in `es`                                                     |
| Logo per theme, favicon           | `LoginPage.test.tsx`: `<source media>` and `<img>` alt; `index.html` icon link test                           |
| Credit on login and shell         | `LoginPage.test.tsx`, `AppLayout.test.tsx`                                                                    |
| Fonts from own origin             | Browser network panel; a test that `index.css` has no `http` URL                                              |
| Status badge tones                | `ReviewSchedulePage.test.tsx`: class per status; marker after badge                                           |
| Browser pass                      | Manual: both themes, desktop and 400px, print previews                                                        |

## Threat Matrix

| Threat                               | Mitigation                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| Third-party font request leaks usage | Fonts committed; no external URL in CSS                            |
| Email shown on a shared screen       | Same data the user typed to sign in; on screen only, never printed |

## Migration / Rollout

None. A static asset and style change, shipped with the web build.

## Open Questions

None.
