# Web Visual Foundation

## Purpose

The look shared by every page of the web app: the SF-Manager design system's
tokens, fonts, light and dark themes, and brand. It sets how the app looks,
never what it does: no flow, route, permission or data depends on it. Pages
adopt the design system's components one slice at a time; this capability
fixes only what every page shares.

The design system itself lives outside the repo (the "SF-Manager" Design
System artifact). Its values are copied into `apps/web/src/index.css`, which
is the source of truth for the app.

## ADDED Requirements

### Requirement: The Theme Follows the Operating System

The app MUST render its light palette when the OS prefers light and its dark
palette when the OS prefers dark, through `prefers-color-scheme`. It MUST NOT
offer a theme toggle or store a theme preference. In both themes, body text
and its muted variant MUST meet 4.5:1 contrast on every surface they sit on,
and control borders and the focus ring MUST meet 3:1.

#### Scenario: Light OS, light app

- GIVEN a browser whose OS prefers light
- WHEN any page renders
- THEN the light palette applies

#### Scenario: Dark OS, dark app

- GIVEN a browser whose OS prefers dark
- WHEN any page renders
- THEN the dark palette applies, including form controls and scrollbars

#### Scenario: No theme control

- GIVEN any page
- WHEN its controls are enumerated
- THEN none sets the theme

### Requirement: Fonts Load From the App's Own Origin

The app's typefaces (Montserrat for headings, Public Sans for text, IBM Plex
Mono for codes and dates) MUST be served from the app's own build, with their
licenses alongside. Loading any page MUST NOT request fonts or stylesheets
from another origin, and MUST NOT add a runtime dependency. Text MUST stay
readable with a system fallback while a font loads.

#### Scenario: No third-party request

- GIVEN the built app served on its own origin
- WHEN any page loads
- THEN no request for a font or stylesheet goes to another origin

#### Scenario: Characters of every locale are covered

- GIVEN the active locale is `es` or `ca`
- WHEN text with accented letters such as "Català", "ñ" or "l·l" renders
- THEN it renders in the app's typefaces, not a fallback

### Requirement: The Product Is Branded With Its Own Marks

The login page MUST show the SF-Manager logo, choosing the dark-ground variant
when the dark palette applies, with the alternative text from the existing
`auth.logoAlt` key. The browser tab icon MUST be the SF-Manager shield. The
document title stays "SF-Manager".

#### Scenario: Logo on login in each theme

- GIVEN an unauthenticated visitor on `/login`, once in light and once in dark
- WHEN the page renders
- THEN exactly one SF-Manager logo is visible, the variant for that theme, with its localized alternative text

#### Scenario: Favicon

- GIVEN any page
- WHEN the document head is inspected
- THEN the icon link points at the SF-Manager shield

### Requirement: The Maker Credit Appears on Screen Only

The login page and every authenticated page MUST show the credit "A
BCNSynergy product" with the BCNSynergy mark, smaller than the SF-Manager
brand: under the login form, and in a footer under the content of
authenticated pages. The credit text MUST come from a translation key with
real values in `en`, `es` and `ca`. It MUST NOT be a link and MUST NOT appear
in printed output.

#### Scenario: Credit on login and on an authenticated page

- GIVEN `/login`, and then any authenticated page
- WHEN each renders
- THEN the credit is shown once, in the active locale

#### Scenario: Credit absent in print

- GIVEN the review document page
- WHEN its print output is produced
- THEN the credit is absent

### Requirement: The Foundation Is Verified in a Real Browser

Before this capability is reported done, the login page, the shell and the
review schedule MUST be exercised in a browser in light and dark, at desktop
width and at about 400px, and the element label and review document pages
MUST be checked in a real print preview.

#### Scenario: Browser pass

- GIVEN the dev server with seeded data
- WHEN login, the shell and the review schedule are opened in both themes and both widths
- THEN nothing overflows the page horizontally, every text is readable, and the print previews show no chrome
