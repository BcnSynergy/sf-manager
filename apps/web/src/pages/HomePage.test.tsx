import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Role } from '@sf-manager/validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import * as reviewHistoryApi from '../api/review-history';
import * as reviewScheduleApi from '../api/review-schedule';
import * as reviewSessionApi from '../api/review-session';
import { useAuth } from '../auth/AuthProvider';
import { NAV_ITEMS_BY_ROLE } from '../layout/nav-items';
import { HomePage } from './HomePage';

vi.mock('../api/review-history');
vi.mock('../api/review-schedule');
vi.mock('../api/review-session');
vi.mock('../auth/AuthProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);

const ROLES = Object.keys(NAV_ITEMS_BY_ROLE) as Role[];

function signInAs(role: string) {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', email: 'someone@sf-manager.example', role: role as Role },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    sessionEnded: false,
    clearSessionEnded: vi.fn(),
    sessionUnavailable: false,
    retrySessionCheck: vi.fn(),
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage />
    </MemoryRouter>,
  );
}

function sectionLinks(role: Role) {
  return NAV_ITEMS_BY_ROLE[role].filter((item) => item.to !== '/');
}

describe('HomePage', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchSpy);
    vi.mocked(reviewScheduleApi.listReviewSchedule).mockResolvedValue([]);
    vi.mocked(reviewSessionApi.listOwnReviewSessions).mockResolvedValue([]);
    vi.mocked(reviewHistoryApi.listReviewHistory).mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage('en');
  });

  it.each(ROLES)('links %s to exactly the sections its navigation offers, in order', (role) => {
    signInAs(role);
    renderPage();

    const hrefs = within(screen.getByTestId('home-sections'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(sectionLinks(role).map((item) => item.to));
  });

  it('shows each section with its name and what it is for', () => {
    signInAs('MAINTENANCE_TECHNICIAN');
    renderPage();

    const card = screen.getByRole('link', { name: 'Review sessions' });
    expect(card).toHaveAccessibleDescription('Start a review or continue a draft');
  });

  it("pairs every section with its own description, never another section's", () => {
    const items = ROLES.flatMap((role) => sectionLinks(role));
    for (const item of items) {
      expect(item.descriptionKey, item.to).toBe(
        item.labelKey.replace(/^nav\./, 'home.description.'),
      );
    }
  });

  it("groups the sections under the navigation's group headings", () => {
    signInAs('SYSTEM_ADMIN');
    renderPage();

    const headings = within(screen.getByTestId('home-sections'))
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Operations', 'Setup', 'Administration']);
  });

  it('says who is signed in and with which role', () => {
    signInAs('MANAGER');
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home');
    expect(screen.getByTestId('home-signed-in')).toHaveTextContent(
      'Signed in as someone@sf-manager.example (Manager)',
    );
  });

  it('follows the selected language', async () => {
    signInAs('MAINTENANCE_TECHNICIAN');
    await i18n.changeLanguage('es');
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicio');
    expect(screen.getByRole('link', { name: 'Sesiones de revisión' })).toBeInTheDocument();
  });

  it('shows no system status and does not call the health check', () => {
    signInAs('SYSTEM_ADMIN');
    renderPage();

    expect(screen.queryByTestId('health-status')).not.toBeInTheDocument();
    expect(screen.queryByText('All systems operational')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the alerts between who is signed in and the sections', async () => {
    signInAs('MAINTENANCE_TECHNICIAN');
    renderPage();

    const alerts = await screen.findByRole('heading', { level: 2, name: 'Alerts' });
    const signedIn = screen.getByTestId('home-signed-in');
    const sections = screen.getByTestId('home-sections');
    expect(
      signedIn.compareDocumentPosition(alerts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      alerts.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("starts the alerts again from loading when the role changes, never showing the previous role's counts", async () => {
    signInAs('MAINTENANCE_TECHNICIAN');
    vi.mocked(reviewSessionApi.listOwnReviewSessions).mockResolvedValue([
      {
        id: 'session-1',
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: '1',
        status: 'draft',
        startedAt: '2026-11-20T10:00:00.000Z',
        completedAt: null,
      },
    ]);
    const { rerender } = renderPage();
    expect(await screen.findByText('1 unfinished draft')).toBeInTheDocument();

    vi.mocked(reviewScheduleApi.listReviewSchedule).mockReturnValue(new Promise(() => {}));
    signInAs('MANAGER');
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-alerts-loading')).toBeInTheDocument();
    expect(screen.queryByText('1 unfinished draft')).not.toBeInTheDocument();
  });

  it('shows the recent activity after the alerts and before the sections', async () => {
    signInAs('MAINTENANCE_TECHNICIAN');
    renderPage();

    const alerts = await screen.findByRole('heading', { level: 2, name: 'Alerts' });
    const activity = await screen.findByRole('heading', { level: 2, name: 'Recent activity' });
    const sections = screen.getByTestId('home-sections');
    expect(
      alerts.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      activity.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('offers no section to an unrecognized role', () => {
    signInAs('NOT_A_ROLE');
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home');
    expect(screen.getByTestId('home-signed-in')).toHaveTextContent(
      'Signed in as someone@sf-manager.example',
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('has a description in every language for every section a role can be offered', () => {
    const items = ROLES.flatMap((role) => sectionLinks(role));
    for (const lng of ['en', 'es', 'ca']) {
      for (const item of items) {
        expect(item.descriptionKey, item.to).toBeDefined();
        expect(i18n.exists(item.descriptionKey!, { lng }), `${lng} ${item.to}`).toBe(true);
      }
    }
  });
});
