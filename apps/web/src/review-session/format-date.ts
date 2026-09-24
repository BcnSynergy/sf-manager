const TIME_ZONE = 'Europe/Madrid';

// spec: review-document-ui "Dates render in a fixed time zone regardless of
// the viewer's own" — the review document has no persisted per-user locale
// preference (ADR-007 deviation, design.md), so it renders in the viewer's
// UI locale but always pins the time zone to Europe/Madrid, independent of
// the browser/OS time zone the viewer's device happens to be set to.

export function formatDocumentDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// spec: "The signing date shows both date and time" — HH:mm, fixed to
// Europe/Madrid. `hourCycle: 'h23'` (rather than `hour12: false`) avoids the
// midnight "24:mm" rendering some ICU builds produce with `hour12: false`.
export function formatDocumentDateTime(date: Date, locale: string): string {
  const datePart = formatDocumentDate(date, locale);
  const timePart = new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${datePart} ${timePart}`;
}
