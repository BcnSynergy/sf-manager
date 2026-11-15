# ADR-018: Outgoing email over SMTP (Brevo in production)

## Status

Accepted

## Context

Password reset (`odd/tasks/password-reset.md`) is the first feature that
sends email, and FR-009 reminders will be the second. The system had no
email capability. The organization's domain, `bcnsynergy.com`, already has
its own mailbox provider (MX at supercleanmail, DNS at Servatica), a strict
DMARC policy (`p=reject; adkim=s; aspf=s`) and an SPF record ending in
`-all`. Sending must stay affordable for a small organization, keep data in
the EU where possible, and not tie the code to one vendor.

Options compared on 2026-11-14:

- **Brevo** (French company, EU data): free plan of 300 emails a day with
  SMTP relay, no card required.
- **Resend**: free plan of 3,000 emails a month (100 a day), sends from
  us-east-1; no EU region found.
- **The organization's own mailbox over SMTP**: no new account, but personal
  mailboxes are not meant for automated sending, have low daily limits, and
  some providers are retiring password-based SMTP.

## Decision

- The API sends email through an `EmailSender` port (application layer) with
  one adapter, `SmtpEmailSender`, built on `nodemailer` and speaking plain
  SMTP. It is configured by `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASSWORD` and `SMTP_FROM`; production refuses to start without them
  and requires TLS; credentials never cross an unencrypted connection.
- Production uses Brevo's SMTP relay (`smtp-relay.brevo.com:587`) with the
  sender `no-reply@bcnsynergy.com`. The domain is authenticated with Brevo's
  verification TXT and two DKIM CNAMEs; SPF is unchanged. Under the strict
  DMARC only DKIM aligns (Brevo's bounce domain is its own), so DKIM is what
  makes the mail deliverable.
- Message content (subjects and bodies, in each supported language) lives in
  the code. No provider REST API, stored template, webhook or tracking
  feature is used, and click and open tracking stay off: reset links carry
  single-use tokens (but see the 2026-11-15 addendum: Brevo tracks clicks).
- Development sends to a local Mailpit container (`docker-compose.yml`,
  `localhost:1025`, web UI on port 8025); tests that exercise sending will
  replace the port with an in-memory fake (added with the reset flow). Nothing leaves a developer's machine.

## Consequences

- Switching provider (another relay, or the organization's mailbox if it
  allows SMTP) means changing the five variables and the domain's DNS
  records; no code change.
- The free plan caps sending at 300 emails a day, ample for password resets;
  reminders may need a paid tier or another relay later.
- Brevo's SMTP key expires (created with a one-year lifetime); an expired key
  makes every send fail while the API keeps serving. The API does not check
  the relay at start, and the production check (EN-92) does not cover email,
  so a broken relay shows only as failed sends in the API log.
- A new runtime dependency, `nodemailer` (pinned), enters the API image.

## Addendum (2026-11-15): click tracking cannot be turned off on Brevo

The first production reset email showed Brevo rewriting the link through its
click-tracking redirector (`…sendibt3.com/tr/cl/…`), although the decision
above assumed tracking could stay off. Brevo offers no per-message SMTP
header for it, and account-wide disabling is reportedly granted on request,
possibly only on Enterprise plans. The maintainer accepted the exposure for
now (TD-53): the token is single use, expires in 30 minutes and is spent only
by submitting the reset form. Asking Brevo support, or moving to a relay
without forced tracking through the `SMTP_*` values and DNS alone, closes it.
