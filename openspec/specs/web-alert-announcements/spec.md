# Web Alert Announcements Specification

## Purpose

Makes screen readers announce the save confirmations and the action errors of the web app's design-system pages, including an error shown again with the same text.

## Requirements

### Requirement: Save Confirmations Appear Inside a Persistent Status Region

A save confirmation MUST appear inside a `role="status"` live region that is on the page before the confirmation appears. Each covered form has its own region, next to it, so a confirmation shows where the user acted: a page has exactly one region per covered form. The region MUST stay on the page, empty, while no confirmation is shown, and MUST NOT change the page layout while empty, on screen or in print. The confirmation itself MUST NOT carry its own `role`.

The confirmations covered are:

| #   | Page                 | Form             | Confirmation                                    |
| --- | -------------------- | ---------------- | ----------------------------------------------- |
| 1   | OrganizationProfile  | the profile form | the save confirmation                           |
| 2   | OrganizationLogo     | the logo section | the upload or removal confirmation              |
| 3   | ReviewSessionElement | the entry form   | the save confirmation, with its Continue action |

(Previously: row 2 covered the upload confirmation only, before the logo
could be removed, and the logo section sat on the OrganizationProfile page
until it moved to a page of its own, EN-127.)

#### Scenario: The region is there before the save

- GIVEN a covered page showing its covered forms, with nothing saved yet
- WHEN the page renders
- THEN exactly one `role="status"` region per covered form MUST be present, and each MUST be empty

#### Scenario: The confirmation appears inside that region

- GIVEN a covered page with its empty status regions
- WHEN the user saves a covered form successfully
- THEN the confirmation MUST appear inside that form's region
- AND the confirmation MUST NOT have a `role` of its own
- AND the page MUST still have exactly one `role="status"` region per covered form

#### Scenario: The empty region takes no space

- GIVEN a covered page with its empty status region
- WHEN the page is shown on screen or printed
- THEN the spacing between the content before and after the region MUST be the same as if the region were absent

### Requirement: Action Errors Are Announced Each Time They Are Shown

On every page that shows its errors as design-system alerts (`sf-alert`), every error that reports the outcome of a user action (a submit, save, delete, activate, discard, complete or similar) MUST render as a `role="alert"` element that is a new element each time its message is shown, including when the same text is shown again because the user repeated the same invalid action.

Load failures, including the page chunk-load error, are out of scope: they are not action errors.

#### Scenario: A repeated validation error is announced again

- GIVEN a form whose validation error is shown after an invalid submit
- WHEN the user submits the same invalid form again
- THEN the error MUST be shown with the same text
- AND it MUST be a different `role="alert"` element from the one shown before

#### Scenario: A repeated request failure is announced again

- GIVEN an action error is shown after a failed request
- WHEN the user repeats the action and the request fails with the same error
- THEN the error MUST be a different `role="alert"` element from the one shown before
