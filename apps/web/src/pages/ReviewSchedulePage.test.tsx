import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as reviewScheduleApi from '../api/review-schedule';
import type { ReviewScheduleRow } from '../api/review-schedule';
import { ReviewSchedulePage } from './ReviewSchedulePage';

vi.mock('../api/review-schedule');

const mockedListReviewSchedule = vi.mocked(reviewScheduleApi.listReviewSchedule);

const baseRow: ReviewScheduleRow = {
  communityId: 'c1',
  communityName: 'Maple Court',
  elementType: 'EXTINGUISHER',
  status: 'UP_TO_DATE',
  reasonCode: 'UP_TO_DATE',
  quarterYear: null,
  quarterNumber: null,
  deadline: null,
  lastCoveringSessionDate: '2026-11-15',
};

const upcomingAnnual: ReviewScheduleRow = {
  ...baseRow,
  communityId: 'c2',
  communityName: 'Oak Court',
  status: 'UPCOMING',
  reasonCode: 'ANNUAL_NOT_ON_RECORD',
  deadline: '2026-12-31',
  lastCoveringSessionDate: '2026-06-02',
};

const overdueQuarterly: ReviewScheduleRow = {
  ...baseRow,
  communityId: 'c3',
  communityName: 'Pine Court',
  status: 'OVERDUE',
  reasonCode: 'QUARTER_MISSED',
  quarterYear: 2026,
  quarterNumber: 3,
  deadline: '2026-09-30',
  lastCoveringSessionDate: '2026-04-10',
};

const neverReviewed: ReviewScheduleRow = {
  ...baseRow,
  communityId: 'c4',
  communityName: 'Cedar Court',
  status: 'NEVER_REVIEWED',
  reasonCode: 'NEVER_REVIEWED',
  lastCoveringSessionDate: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review-schedule']}>
      <ReviewSchedulePage />
    </MemoryRouter>,
  );
}

function withServerMessage(error: ApiError, message: string): ApiError {
  error.message = message;
  return error;
}

function rowOf(communityId: string) {
  return screen.getByTestId(`review-schedule-row-${communityId}`);
}

describe('ReviewSchedulePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading state while the request is in flight, with no table or empty message', () => {
    mockedListReviewSchedule.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-schedule-loading')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-schedule-empty')).not.toBeInTheDocument();
  });

  it('shows the empty state, not an error, when the server returns no pair', async () => {
    mockedListReviewSchedule.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('review-schedule-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('review-schedule-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('not-authorized')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([
    new ApiError(0),
    withServerMessage(new ApiError(500, 'INTERNAL'), 'Server said: stack trace leaked'),
    withServerMessage(new ApiError(403, 'FORBIDDEN'), 'Server said: forbidden'),
  ])('shows one uniform localized error, never server text (%#)', async (error) => {
    mockedListReviewSchedule.mockRejectedValue(error);

    renderPage();

    const message = await screen.findByTestId('review-schedule-error');
    expect(message).toHaveTextContent(i18n.t('reviewSchedule.error'));
    expect(document.body).not.toHaveTextContent('Server said');
    expect(screen.queryByTestId('review-schedule-loading')).not.toBeInTheDocument();
  });

  it('shows the status label, one reason line naming the annual review and its deadline for an upcoming annual row', async () => {
    mockedListReviewSchedule.mockResolvedValue([upcomingAnnual]);

    renderPage();

    const row = await screen.findByTestId('review-schedule-row-c2');
    expect(within(row).getByText('Upcoming')).toBeInTheDocument();
    expect(within(row).getByTestId('review-schedule-reason-c2')).toHaveTextContent(
      'No annual review on record; due by December 31, 2026.',
    );
  });

  it('states that Q3 2026 is not covered for an overdue quarterly row', async () => {
    mockedListReviewSchedule.mockResolvedValue([overdueQuarterly]);

    renderPage();

    const row = await screen.findByTestId('review-schedule-row-c3');
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).getByTestId('review-schedule-reason-c3')).toHaveTextContent(
      'Q3 2026 is not covered by a completed review (was due by September 30, 2026).',
    );
  });

  it('shows "Never reviewed" with no date and no overdue wording for a never-reviewed row', async () => {
    mockedListReviewSchedule.mockResolvedValue([neverReviewed]);

    renderPage();

    const row = await screen.findByTestId('review-schedule-row-c4');
    expect(within(row).getByTestId('review-schedule-last-review-c4')).toHaveTextContent(
      'Never reviewed',
    );
    expect(within(row).queryByTestId('review-schedule-reason-c4')).not.toBeInTheDocument();
    expect(row).not.toHaveTextContent(/overdue/i);
    expect(row.textContent).not.toMatch(/\d{4}/);
  });

  it('shows status and last review date and no reason line for an up-to-date row', async () => {
    mockedListReviewSchedule.mockResolvedValue([baseRow]);

    renderPage();

    const row = await screen.findByTestId('review-schedule-row-c1');
    expect(within(row).getByText('Up to date')).toBeInTheDocument();
    expect(within(row).getByTestId('review-schedule-last-review-c1')).toHaveTextContent(
      'November 15, 2026',
    );
    expect(within(row).queryByTestId('review-schedule-reason-c1')).not.toBeInTheDocument();
  });

  it('renders no reason line, and does not crash, for an overdue row with no usable reason data', async () => {
    mockedListReviewSchedule.mockResolvedValue([
      { ...overdueQuarterly, quarterNumber: null, quarterYear: null },
      { ...upcomingAnnual, deadline: null },
    ]);

    renderPage();

    await screen.findByTestId('review-schedule-row-c3');
    expect(screen.queryByTestId('review-schedule-reason-c3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-schedule-reason-c2')).not.toBeInTheDocument();
    expect(within(rowOf('c3')).getByText('Overdue')).toBeInTheDocument();
    expect(within(rowOf('c2')).getByText('Upcoming')).toBeInTheDocument();
  });

  it('localizes the element type and never shows a raw enum value', async () => {
    mockedListReviewSchedule.mockResolvedValue([
      baseRow,
      upcomingAnnual,
      overdueQuarterly,
      neverReviewed,
    ]);

    renderPage();

    await screen.findByTestId('review-schedule-row-c1');
    const text = document.body.textContent ?? '';
    expect(text).toContain(i18n.t('inspectableElement.type.extinguisher'));
    for (const raw of [
      'EXTINGUISHER',
      'NEVER_REVIEWED',
      'UP_TO_DATE',
      'OVERDUE',
      'UPCOMING',
      'QUARTER_MISSED',
      'ANNUAL_NOT_ON_RECORD',
    ]) {
      expect(text).not.toContain(raw);
    }
  });

  it('renders every row in the server order with nothing hidden or regrouped', async () => {
    mockedListReviewSchedule.mockResolvedValue([
      upcomingAnnual,
      baseRow,
      neverReviewed,
      overdueQuarterly,
    ]);

    renderPage();

    const rows = await screen.findAllByTestId(/^review-schedule-row-/);
    expect(rows.map((element) => element.getAttribute('data-testid'))).toEqual([
      'review-schedule-row-c2',
      'review-schedule-row-c1',
      'review-schedule-row-c4',
      'review-schedule-row-c3',
    ]);
  });

  it('offers no control and shows no per-session data', async () => {
    mockedListReviewSchedule.mockResolvedValue([
      baseRow,
      upcomingAnnual,
      overdueQuarterly,
      neverReviewed,
    ]);

    renderPage();

    await screen.findByTestId('review-schedule-row-c1');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
    expect(screen.queryAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Community',
      'Element type',
      'Status',
      'Reason',
      'Last review',
    ]);
  });

  it.each([
    ['es', 'Calendario de revisiones'],
    ['ca', 'Calendari de revisions'],
  ])('renders from the %s locale keys with no English fallback', async (locale, title) => {
    await i18n.changeLanguage(locale);
    mockedListReviewSchedule.mockResolvedValue([upcomingAnnual]);

    renderPage();

    const row = await screen.findByTestId('review-schedule-row-c2');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(row).not.toHaveTextContent('Upcoming');
    expect(within(row).getByTestId('review-schedule-reason-c2')).not.toHaveTextContent(
      'No annual review',
    );
    expect(within(row).getByTestId('review-schedule-reason-c2')).toHaveTextContent('2026');
  });

  it('names the table by its heading and scopes every column header', async () => {
    mockedListReviewSchedule.mockResolvedValue([baseRow]);

    renderPage();

    const table = await screen.findByRole('table', { name: i18n.t('reviewSchedule.title') });
    expect(table.querySelector('caption')).toHaveClass('visually-hidden');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(table.querySelector('[scope="row"]')).toBeNull();
  });

  it('names the table by the page heading in the active language (es)', async () => {
    await i18n.changeLanguage('es');
    try {
      mockedListReviewSchedule.mockResolvedValue([baseRow]);

      renderPage();

      const heading = await screen.findByRole('heading', { level: 1 });
      const table = screen.getByRole('table', { name: i18n.t('reviewSchedule.title') });
      expect(i18n.t('reviewSchedule.title')).not.toBe(i18n.t('reviewSchedule.title', { lng: 'en' }));
      expect(table.querySelector('caption')).toHaveTextContent(heading.textContent ?? '');
      expect(heading.textContent).toBe(i18n.t('reviewSchedule.title'));
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
