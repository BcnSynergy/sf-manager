import { describe, expect, it } from 'vitest';
import { formatDocumentDate, formatDocumentDateTime } from './format-date';

// spec: review-document-ui "Dates render in a fixed time zone regardless of
// the viewer's own" + "The signing date shows both date and time" —
// every date/date-time on the review document is pinned to Europe/Madrid,
// independent of the viewer's own device time zone, and the signing date
// shows date + HH:mm.

describe('formatDocumentDateTime', () => {
  it('renders the correct Europe/Madrid time across the spring DST boundary', () => {
    // 2026-03-29T01:00:00Z is the EU spring-forward instant: CET (+1) -> CEST (+2)
    expect(formatDocumentDateTime(new Date('2026-03-29T00:30:00Z'), 'en')).toContain('01:30');
    expect(formatDocumentDateTime(new Date('2026-03-29T01:30:00Z'), 'en')).toContain('03:30');
  });

  it('renders the correct Europe/Madrid time across the autumn DST boundary', () => {
    // 2026-10-25T01:00:00Z is the EU fall-back instant: CEST (+2) -> CET (+1)
    expect(formatDocumentDateTime(new Date('2026-10-25T00:30:00Z'), 'en')).toContain('02:30');
    expect(formatDocumentDateTime(new Date('2026-10-25T02:30:00Z'), 'en')).toContain('03:30');
  });

  it('shows both the date and the time as HH:mm', () => {
    const result = formatDocumentDateTime(new Date('2026-01-15T10:30:00Z'), 'en');
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('fixed time zone regardless of the runtime time zone', () => {
  it('produces identical output no matter the process TZ env var', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const laDate = formatDocumentDate(date, 'en');
      const laDateTime = formatDocumentDateTime(date, 'en');

      process.env.TZ = 'Asia/Tokyo';
      const tokyoDate = formatDocumentDate(date, 'en');
      const tokyoDateTime = formatDocumentDateTime(date, 'en');

      expect(laDate).toBe(tokyoDate);
      expect(laDateTime).toBe(tokyoDateTime);
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});

describe('locale support', () => {
  it('formats in en, es and ca without throwing, each producing a non-empty string', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    for (const locale of ['en', 'es', 'ca']) {
      expect(formatDocumentDate(date, locale).length).toBeGreaterThan(0);
      expect(formatDocumentDateTime(date, locale).length).toBeGreaterThan(0);
    }
  });
});
