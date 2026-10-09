# Web Table Accessibility Specification

## Purpose

Gives every data table in the web app an accessible name and explicit column scope, so assistive-technology users can identify each table and associate cells with their column headers. No visual change.

## Requirements

### Requirement: Table Accessible Name

Every data table rendered by the web app MUST have an accessible name provided by a `<caption>` element that is the table's first child. The caption text MUST equal the text of the table's nearest heading, produced by the same translation call as that heading, in the active language. The system MUST NOT introduce new translatable strings for captions.

The nearest heading is:
- the page `h1`, for pages that render a single table;
- the group `h2`, for pages that render one table per group, so each grouped table is distinguishable from its siblings.

The tables covered are:

| # | Page | Table(s) | Caption equals |
|---|------|----------|----------------|
| 1 | ChecklistQuestionsList | one per element type | that group's `h2` (element type) |
| 2 | CommunitiesList | one | page `h1` |
| 3 | CommunityElementsList | one | page `h1` |
| 4 | MaintenanceCompaniesList | one | page `h1` |
| 5 | ReviewHistory | one | page `h1` |
| 6 | ReviewSchedule | one | page `h1` |
| 7 | ReviewTemplatesList | one per element type + frequency | that group's `h2` (element type + frequency) |
| 8 | ReviewSessions | one | page `h1` |
| 9 | UsersList | one | page `h1` |

#### Scenario: Single-table page is named by its h1
- GIVEN any of CommunitiesList, CommunityElementsList, MaintenanceCompaniesList, ReviewHistory, ReviewSchedule, ReviewSessions or UsersList with data to list
- WHEN the page renders
- THEN exactly one table MUST be present and its accessible name MUST equal the page `h1` text

#### Scenario: Review templates tables are named per group
- GIVEN ReviewTemplatesList with templates in more than one element type + frequency group
- WHEN the page renders
- THEN there MUST be one table per group and each table's accessible name MUST equal its group's `h2` text
- AND no two tables MUST share the same accessible name

#### Scenario: Checklist questions tables are named per group
- GIVEN ChecklistQuestionsList with questions for an element type
- WHEN the page renders
- THEN there MUST be one table per element type and each table's accessible name MUST equal its group's `h2` text
- AND no two tables MUST share the same accessible name
(Today the element type enum has a single value, `EXTINGUISHER`, so this renders exactly one table; the rule applies unchanged when more element types exist.)

#### Scenario: Caption follows the active language
- GIVEN any covered page rendered with the active language `es` (or `ca`)
- WHEN the page renders
- THEN each caption MUST equal its nearest heading text in that language
- AND no caption string MUST be absent from the existing translation catalogs

#### Scenario: Pages with no table are unchanged
- GIVEN a covered page in its empty, loading or error state, where no table is rendered
- WHEN the page renders
- THEN the output MUST be identical to its output before this change, and no caption MUST appear

### Requirement: Caption Visually Hidden but Exposed

Each table caption MUST NOT be visible on screen or in print, and MUST remain exposed to assistive technology (present in the accessibility tree). The hiding MUST be achieved with a reusable `visually-hidden` clipping utility, not `display: none` or `visibility: hidden`, and it MUST NOT alter table layout.

#### Scenario: Caption invisible but accessible
- GIVEN any covered page rendering a table in a browser
- WHEN the page is displayed
- THEN the caption MUST NOT be visibly rendered and the table's row and column layout MUST be unchanged
- AND the caption MUST appear in the accessibility tree as the table's name

#### Scenario: Caption does not show in print
- GIVEN a covered page rendering a table
- WHEN it is printed
- THEN the caption text MUST NOT appear in the printed output

### Requirement: Column Header Scope

Every `<th>` inside a table's `<thead>` MUST declare `scope="col"`, including header cells with no visible text (such as action columns). The system MUST NOT add `scope="row"` anywhere, because no covered table has a header cell in `<tbody>`.

#### Scenario: All header cells declare column scope
- GIVEN each of the 9 covered pages rendering a table
- WHEN the page renders
- THEN every `<th>` in every `<thead>` MUST have `scope="col"`

#### Scenario: Empty action-column header is scoped
- GIVEN a covered table with a header cell that has no visible text (an action column)
- WHEN the page renders
- THEN that `<th>` MUST still have `scope="col"`

#### Scenario: No row headers introduced
- GIVEN any covered table
- WHEN the page renders
- THEN no `<th>` MUST exist in `<tbody>` and no element MUST have `scope="row"`

### Requirement: Scope Limits

This capability MUST apply to the web app only. It MUST NOT change any API, backend behaviour, translation catalog, column layout or styling beyond the `visually-hidden` utility.

#### Scenario: No new strings
- GIVEN the translation catalogs before and after the change
- WHEN they are compared
- THEN no key MUST have been added or changed
