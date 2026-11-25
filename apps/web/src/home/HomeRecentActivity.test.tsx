import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Role } from '@sf-manager/validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import * as reviewHistoryApi from '../api/review-history';
import type { ReviewHistoryRow } from '../api/review-history';
import { HomeRecentActivity } from './HomeRecentActivity';

vi.mock('../api/review-history');

const mockedListReviewHistory = vi.mocked(reviewHistoryApi.listReviewHistory);

function row(id: string, communityName: string, completedAt: string): ReviewHistoryRow {
  return {
    id,
    communityId: `community-${id}`,
    communityName,
    performedById: 'user-1',
    performedByEmail: 'technician@sf-manager.example',
    startedAt: completedAt,
    completedAt,
  };
}

function renderActivity(role: string) {
  return render(
    <MemoryRouter>
      <HomeRecentActivity role={role as Role} />
    </MemoryRouter>,
  );
}

async function activityItems() {
  const list = await screen.findByTestId('home-activity-list');
  return within(list)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('HomeRecentActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListReviewHistory.mockResolvedValue([]);
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('lists the five most recently completed reviews, newest first, each opening its review', async () => {
    mockedListReviewHistory.mockResolvedValue([
      row('a', 'Alpha', '2026-11-01T10:00:00.000Z'),
      row('g', 'Golf', '2026-11-07T10:00:00.000Z'),
      row('c', 'Charlie', '2026-11-03T10:00:00.000Z'),
      row('e', 'Echo', '2026-11-05T10:00:00.000Z'),
      row('b', 'Bravo', '2026-11-02T10:00:00.000Z'),
      row('f', 'Foxtrot', '2026-11-06T10:00:00.000Z'),
      row('d', 'Delta', '2026-11-04T10:00:00.000Z'),
    ]);
    renderActivity('MAINTENANCE_TECHNICIAN');

    expect(await activityItems()).toEqual([
      ['Golf', '/review-history/g'],
      ['Foxtrot', '/review-history/f'],
      ['Echo', '/review-history/e'],
      ['Delta', '/review-history/d'],
      ['Charlie', '/review-history/c'],
    ]);
  });

  it('says when and by whom each review was completed, in the Madrid time zone', async () => {
    mockedListReviewHistory.mockResolvedValue([row('a', 'Alpha', '2026-11-24T23:30:00.000Z')]);
    renderActivity('MANAGER');

    const link = (await screen.findAllByRole('link', { name: 'Alpha' }))[0];
    expect(link).toHaveAccessibleDescription(
      'Completed on November 25, 2026 by technician@sf-manager.example',
    );
  });

  it('offers the whole review history once there is something to show', async () => {
    mockedListReviewHistory.mockResolvedValue([row('a', 'Alpha', '2026-11-01T10:00:00.000Z')]);
    renderActivity('MAINTENANCE_COMPANY_MANAGER');

    const all = await screen.findByRole('link', { name: 'View all review history' });
    expect(all).toHaveAttribute('href', '/review-history');
  });

  it('says so when no review has been completed yet', async () => {
    renderActivity('MANAGER');

    expect(await screen.findByTestId('home-activity-none')).toHaveTextContent(
      'No reviews have been completed yet.',
    );
    expect(screen.queryByTestId('home-activity-list')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View all review history' })).not.toBeInTheDocument();
  });

  it('shows a loading message until the history arrives', () => {
    mockedListReviewHistory.mockReturnValue(new Promise(() => {}));
    renderActivity('SYSTEM_ADMIN');

    expect(screen.getByTestId('home-activity-loading')).toHaveTextContent(
      'Loading recent activity...',
    );
  });

  it('shows one message when the history cannot be loaded', async () => {
    mockedListReviewHistory.mockRejectedValue(new Error('network'));
    renderActivity('COMMUNITY_REPRESENTATIVE');

    expect(await screen.findByTestId('home-activity-error')).toHaveTextContent(
      'Recent activity could not be loaded.',
    );
    expect(screen.queryByTestId('home-activity-list')).not.toBeInTheDocument();
  });

  it.each([
    'SYSTEM_ADMIN',
    'MANAGER',
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ])('gives %s the section under its heading', async (role) => {
    renderActivity(role);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Recent activity' }),
    ).toBeInTheDocument();
    expect(mockedListReviewHistory).toHaveBeenCalledTimes(1);
  });

  it('shows nothing to an unrecognized role and requests nothing', () => {
    const { container } = renderActivity('NOT_A_ROLE');

    expect(container).toBeEmptyDOMElement();
    expect(mockedListReviewHistory).not.toHaveBeenCalled();
  });

  it('follows the selected language', async () => {
    await i18n.changeLanguage('es');
    mockedListReviewHistory.mockResolvedValue([row('a', 'Alpha', '2026-11-24T23:30:00.000Z')]);
    renderActivity('MAINTENANCE_TECHNICIAN');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Actividad reciente' }),
    ).toBeInTheDocument();
    expect((await screen.findAllByRole('link', { name: 'Alpha' }))[0]).toHaveAccessibleDescription(
      'Terminada el 25 de noviembre de 2026 por technician@sf-manager.example',
    );
  });
});
