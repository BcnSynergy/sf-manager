# ADR-007: Internationalization — Multi-language UI from Day One (EN/ES/CA), English-only Codebase

## Status
Accepted

## Context
End users are primarily Spanish- and Catalan-speaking people complying with
Spanish fire-safety regulation (RIPCI), but the product should not be locked
to a single language. Separately, the project follows an English-by-default
convention for everything code-related (see ADR project convention):
domain entity names, database columns, API contracts, code comments.

## Decision
- The UI is internationalized from the **first walking-skeleton slice**, not
  retrofitted later — every user-facing string goes through an i18n layer
  from day one.
- Initial locales: **English (default/fallback), Spanish, Catalan**.
- Users can select/change their language (implies a per-user language
  preference, not a build-time or deployment-time locale pin).
- **All domain and code artifacts stay in English** regardless of UI locale:
  entity names, field names, API contracts, code comments. Translation only
  happens at the presentation layer — UI copy, user-facing validation
  messages, and generated documents.

## Consequences
- Needs an i18n mechanism per platform (web/mobile/desktop from ADR-004) —
  the specific libraries are a design-phase decision, not fixed here.
- The backend (NestJS) also needs to localize any user-facing message it
  produces directly (validation errors, notification content), not just the
  frontends.
- Locale-sensitive formatting (dates, numbers) must be handled consistently
  across all three clients.
- The final compliance PDF report (sent to the property management
  company, see original workflow) must also render in the reviewer's
  chosen locale — it's a
  legal-effect document, not just UI chrome.
- User entity needs a persisted language preference (see future FR on user
  management).
- Translation keys are organized per domain module as that module is built,
  not dumped into one global file — exact key structure is a design-phase
  detail.

## Alternatives Considered
- **English-only UI, i18n as future work** — rejected explicitly: real end
  users (community representatives) need Spanish/Catalan for the tool to be
  usable in practice, not just as a translation nice-to-have added later.
