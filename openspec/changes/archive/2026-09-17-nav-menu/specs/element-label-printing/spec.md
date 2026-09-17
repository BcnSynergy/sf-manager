# Delta for Element Label Printing

> **Purpose note (for archive):** no Purpose rewording is required. The
> Purpose already describes browser-print behaviour as *"`window.print()`
> against a `@media print` stylesheet that suppresses application
> chrome"*. What changes is that the application now **has** chrome to
> suppress: until this change the label page rendered as a bare `<main>`
> with no navigation anywhere in the app, so the suppression requirement
> was vacuously satisfied. Once the global navigation wraps every
> authenticated route — the label route included — the guard becomes
> load-bearing for the first time.

## MODIFIED Requirements

### Requirement: Print Output Suppresses Application Chrome

When a label is printed, the printed output MUST contain only the label
content. Application chrome — navigation, buttons, action controls and
surrounding page layout — MUST NOT appear in the printed output. The QR
and the plain-text `code` MUST both be fully rendered in the printed
output, not clipped by the page margins.

"Navigation" MUST now be read to include the **global navigation**
introduced by `app-navigation`, which wraps the label route along with
every other authenticated route. That navigation is the first real chrome
this requirement has ever had to suppress, so conformance MUST be
established by **inspecting actual print output** — a print preview
against a running application — and not only by a unit test asserting a
CSS rule exists. Suppression MUST hold for the label view regardless of
which role or route the user arrived from, and MUST NOT be achieved by
omitting the navigation from the label page on screen: the label page is
an authenticated page and MUST render the navigation normally when not
printing.
(Previously: the requirement named navigation, buttons and surrounding
page layout generically, at a time when the application had no navigation
component at all, so the scenario below could pass vacuously. This change
introduces global navigation on the label route, so the requirement names
it explicitly, requires verification against real print output, and pins
that on-screen rendering is unaffected.)

#### Scenario: Printed output excludes app chrome
- GIVEN a `SYSTEM_ADMIN` prints a label
- WHEN the print output is produced
- THEN navigation, buttons and surrounding page layout MUST NOT appear in it

#### Scenario: The global navigation specifically is absent from printed output
- GIVEN a `SYSTEM_ADMIN` on the label page with the global navigation rendered on screen
- WHEN the print output is produced
- THEN no navigation item and no logout control MUST appear in it

#### Scenario: Suppression is verified against a real print preview
- GIVEN the label page rendered inside the global navigation on a running application
- WHEN its print preview is inspected
- THEN the navigation MUST be absent from the preview — conformance MUST NOT rest on a unit test asserting only that a print rule exists

#### Scenario: The label page still shows the navigation on screen
- GIVEN a `SYSTEM_ADMIN` viewing the label page without printing
- WHEN the page renders
- THEN the global navigation MUST be present, exactly as on every other authenticated page

#### Scenario: QR and code survive the print layout
- GIVEN a `SYSTEM_ADMIN` previews the print output for a label
- WHEN the preview is inspected
- THEN the QR and the plain-text `code` MUST both be fully visible and uncropped
