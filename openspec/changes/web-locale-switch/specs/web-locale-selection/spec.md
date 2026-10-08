# Web Locale Selection Specification

## Purpose

Lets a user of the web app choose the UI language (English, Spanish, Catalan), per browser, with a deterministic initial language.

## Requirements

### Requirement: Initial Language Resolution

At startup the system MUST resolve the active language in this order: (1) a valid stored choice; (2) the browser language reduced to its base subtag, if supported; (3) English. A valid value is one of `en`, `es`, `ca`. An invalid or corrupt stored value MUST be ignored and step 2 MUST apply. If browser storage is unavailable, the app MUST still start and resolve via steps 2-3.

#### Scenario: Valid stored choice wins
- GIVEN a stored choice `ca` and a browser language `es-ES`
- WHEN the app starts
- THEN the active language MUST be `ca`

#### Scenario: Browser base language
- GIVEN no stored choice and a browser language `es-ES` (or `ca-ES`)
- WHEN the app starts
- THEN the active language MUST be `es` (or `ca`)

#### Scenario: Unsupported browser language
- GIVEN no stored choice and a browser language `fr`
- WHEN the app starts
- THEN the active language MUST be `en`

#### Scenario: Corrupt stored value
- GIVEN a stored value that is not `en`, `es` or `ca`, and a browser language `ca-ES`
- WHEN the app starts
- THEN the stored value MUST be ignored and the active language MUST be `ca`

#### Scenario: Storage unavailable
- GIVEN reading or writing browser storage throws
- WHEN the app starts and the user selects a language
- THEN the app MUST NOT crash and the selection MUST still change the active language for the session

### Requirement: Language Selector Placement and Options

The system MUST render a language selector on `LoginPage` and in `AppLayout`. It MUST offer exactly three options labelled with the fixed endonyms "English", "Español", "Català", identical whatever the active language, and MUST indicate the active language.

#### Scenario: Present on both surfaces
- GIVEN an unauthenticated visitor on the login page, or a signed-in user in the app shell
- WHEN the page renders
- THEN exactly one language selector MUST be present

#### Scenario: Labels do not translate
- GIVEN the active language is `ca`
- WHEN the selector's options are read
- THEN they MUST be "English", "Español" and "Català"

### Requirement: Switching Applies Immediately and Persists

Selecting a language MUST re-render the UI in that language without a reload, set `<html lang>` to it, and store the choice in the browser. `<html lang>` MUST also equal the active language at startup. Date formatting MUST follow the active language.

#### Scenario: Switch updates UI and html lang
- GIVEN the active language is `en`
- WHEN the user selects "Español"
- THEN visible text MUST render in Spanish and `<html lang>` MUST be `es`

#### Scenario: Choice survives reload
- GIVEN the user selected "Català"
- WHEN the app is reloaded
- THEN the active language MUST be `ca`

#### Scenario: Dates follow language
- GIVEN a page showing a formatted date
- WHEN the user switches language
- THEN the date MUST be formatted for the new language

### Requirement: Scope Limits

The system MUST NOT store the language preference per user on the backend, translate messages originating in the API, add locales beyond `en`, `es`, `ca`, or add a runtime dependency for language detection.

#### Scenario: No backend or dependency change
- GIVEN the API, database schema and dependency manifests before and after this change
- WHEN compared
- THEN they MUST be unchanged
