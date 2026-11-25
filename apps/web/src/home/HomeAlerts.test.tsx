import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Role } from '@sf-manager/validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import * as reviewScheduleApi from '../api/review-schedule';
import type { ReviewScheduleRow, ReviewScheduleStatus } from '../api/review-schedule';
import * as reviewSessionApi from '../api/review-session';
import type { ReviewSession } from '../api/review-session';
import { HomeAlerts } from './HomeAlerts';

vi.mock('../api/review-schedule');
vi.mock('../api/review-session');

const mockedListReviewSchedule = vi.mocked(reviewScheduleApi.listReviewSchedule);
const mockedListOwnReviewSessions = vi.mocked(reviewSessionApi.listOwnReviewSessions);

function scheduleRow(status: ReviewScheduleStatus, index: number): ReviewScheduleRow {
  return {
    communityId: `community-${index}`,
    communityName: `Community ${index}`,
    elementType: 'EXTINGUISHER',
    status,
    reasonCode: 'NEVER_REVIEWED',
    quarterYear: null,
    quarterNumber: null,
    deadline: null,
    lastCoveringSessionDate: null,
    inProgress: false,
  };
}

function schedule(counts: Partial<Record<ReviewScheduleStatus, number>>): ReviewScheduleRow[] {
  let index = 0;
  return Object.entries(counts).flatMap(([status, count]) =>
    Array.from({ length: count ?? 0 }, () => scheduleRow(status as ReviewScheduleStatus, index++)),
  );
}

function drafts(count: number): ReviewSession[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index}`,
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: 'draft',
    startedAt: '2026-11-20T10:00:00.000Z',
    completedAt: null,
  }));
}

function renderAlerts(role: string) {
  return render(
    <MemoryRouter>
      <HomeAlerts role={role as Role} />
    </MemoryRouter>,
  );
}

async function alertLinks() {
  const list = await screen.findByTestId('home-alerts-list');
  return within(list)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('HomeAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListReviewSchedule.mockResolvedValue([]);
    mockedListOwnReviewSessions.mockResolvedValue([]);
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('counts overdue, never-reviewed and upcoming obligations and unfinished drafts', async () => {
    mockedListReviewSchedule.mockResolvedValue(
      schedule({ OVERDUE: 2, NEVER_REVIEWED: 3, UPCOMING: 4, UP_TO_DATE: 5 }),
    );
    mockedListOwnReviewSessions.mockResolvedValue(drafts(2));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await alertLinks()).toEqual([
      ['2 overdue reviews', '/review-schedule'],
      ['3 never reviewed', '/review-schedule'],
      ['4 upcoming reviews', '/review-schedule'],
      ['2 unfinished drafts', '/review-sessions'],
    ]);
  });

  it("shows each alert as a badge in its schedule status's tone, drafts neutral", async () => {
    mockedListReviewSchedule.mockResolvedValue(
      schedule({ OVERDUE: 1, NEVER_REVIEWED: 1, UPCOMING: 1 }),
    );
    mockedListOwnReviewSessions.mockResolvedValue(drafts(1));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    const list = await screen.findByTestId('home-alerts-list');
    const badgeClasses = within(list)
      .getAllByRole('link')
      .map((link) => link.querySelector('.sf-badge')?.className);
    expect(badgeClasses).toEqual([
      'sf-badge sf-badge-danger',
      'sf-badge sf-badge-warning',
      'sf-badge sf-badge-notice',
      'sf-badge',
    ]);
  });

  it('uses the singular for a count of one', async () => {
    mockedListReviewSchedule.mockResolvedValue(schedule({ OVERDUE: 1, UPCOMING: 1 }));
    mockedListOwnReviewSessions.mockResolvedValue(drafts(1));
    renderAlerts('COMMUNITY_REPRESENTATIVE');

    expect(await alertLinks()).toEqual([
      ['1 overdue review', '/review-schedule'],
      ['1 upcoming review', '/review-schedule'],
      ['1 unfinished draft', '/review-sessions'],
    ]);
  });

  it('leaves out every alert whose count is zero', async () => {
    mockedListReviewSchedule.mockResolvedValue(schedule({ UPCOMING: 1, UP_TO_DATE: 3 }));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await alertLinks()).toEqual([['1 upcoming review', '/review-schedule']]);
  });

  it('says so when there is nothing to warn about', async () => {
    mockedListReviewSchedule.mockResolvedValue(schedule({ UP_TO_DATE: 2 }));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await screen.findByTestId('home-alerts-none')).toHaveTextContent('You have no alerts.');
    expect(screen.queryByTestId('home-alerts-list')).not.toBeInTheDocument();
  });

  it.each(['SYSTEM_ADMIN', 'MANAGER'])(
    'gives %s the schedule alerts and never asks for drafts',
    async (role) => {
      mockedListReviewSchedule.mockResolvedValue(schedule({ OVERDUE: 1 }));
      renderAlerts(role);

      expect(await alertLinks()).toEqual([['1 overdue review', '/review-schedule']]);
      expect(mockedListOwnReviewSessions).not.toHaveBeenCalled();
    },
  );

  it.each(['MAINTENANCE_COMPANY_MANAGER', 'NOT_A_ROLE'])(
    'shows nothing to %s and requests nothing',
    (role) => {
      const { container } = renderAlerts(role);

      expect(container).toBeEmptyDOMElement();
      expect(mockedListReviewSchedule).not.toHaveBeenCalled();
      expect(mockedListOwnReviewSessions).not.toHaveBeenCalled();
    },
  );

  it('shows a loading message until the counts arrive', () => {
    mockedListReviewSchedule.mockReturnValue(new Promise(() => {}));
    renderAlerts('MANAGER');

    expect(screen.getByTestId('home-alerts-loading')).toHaveTextContent('Checking for alerts...');
  });

  it('shows one message, and no partial counts, when a source fails', async () => {
    mockedListReviewSchedule.mockResolvedValue(schedule({ OVERDUE: 2 }));
    mockedListOwnReviewSessions.mockRejectedValue(new Error('network'));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await screen.findByTestId('home-alerts-error')).toHaveTextContent(
      'Alerts could not be loaded.',
    );
    expect(screen.queryByTestId('home-alerts-list')).not.toBeInTheDocument();
  });

  it.each(['MANAGER', 'MAINTENANCE_TECHNICIAN'])(
    'shows the error, not "no alerts", to %s when the schedule request fails',
    async (role) => {
      mockedListReviewSchedule.mockRejectedValue(new Error('network'));
      mockedListOwnReviewSessions.mockResolvedValue(drafts(1));
      renderAlerts(role);

      expect(await screen.findByTestId('home-alerts-error')).toHaveTextContent(
        'Alerts could not be loaded.',
      );
      expect(screen.queryByTestId('home-alerts-none')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-alerts-list')).not.toBeInTheDocument();
    },
  );

  it('gives the alerts a heading', async () => {
    renderAlerts('MANAGER');

    expect(await screen.findByRole('heading', { level: 2, name: 'Alerts' })).toBeInTheDocument();
  });

  it('follows the selected language', async () => {
    await i18n.changeLanguage('es');
    mockedListReviewSchedule.mockResolvedValue(schedule({ OVERDUE: 2 }));
    mockedListOwnReviewSessions.mockResolvedValue(drafts(1));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await alertLinks()).toEqual([
      ['2 revisiones vencidas', '/review-schedule'],
      ['1 borrador sin terminar', '/review-sessions'],
    ]);
  });

  it('uses the Catalan singular and plural', async () => {
    await i18n.changeLanguage('ca');
    mockedListReviewSchedule.mockResolvedValue(schedule({ OVERDUE: 1, UPCOMING: 2 }));
    mockedListOwnReviewSessions.mockResolvedValue(drafts(2));
    renderAlerts('MAINTENANCE_TECHNICIAN');

    expect(await alertLinks()).toEqual([
      ['1 revisió vençuda', '/review-schedule'],
      ['2 revisions properes', '/review-schedule'],
      ['2 esborranys sense acabar', '/review-sessions'],
    ]);
  });
});
