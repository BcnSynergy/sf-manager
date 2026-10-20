import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ElementReviewHistoryPage } from './ElementReviewHistoryPage';

vi.mock('../api/review-history');

const mockedReadElementReviewHistory = vi.mocked(reviewHistoryApi.readElementReviewHistory);

const COMMUNITY_ID = 'community-1';
const ELEMENT_ID = 'element-1';

const activeElementHistory = {
  element: {
    id: ELEMENT_ID,
    code: 'AB3456789C',
    name: 'Lobby extinguisher',
    elementType: 'EXTINGUISHER' as const,
    location: 'Ground-floor corridor',
    communityId: COMMUNITY_ID,
    communityName: 'Sunset Towers',
    deactivatedAt: null,
  },
  entries: [
    {
      reviewSessionId: 'session-1',
      performedById: 'u1',
      performedByEmail: 'tech@sf-manager.example',
      reviewed: true,
      // Present on purpose: the page shows observations only for unreviewed
      // entries, and the styling test pins that this one stays hidden.
      observations: 'Pressure gauge checked',
      recordedAt: '2026-09-01T00:30:00.000Z',
    },
    {
      reviewSessionId: 'session-2',
      performedById: 'u2',
      performedByEmail: 'tech2@sf-manager.example',
      reviewed: false,
      observations: 'Access blocked',
      recordedAt: '2026-08-01T00:30:00.000Z',
    },
  ],
};

const decommissionedElementHistory = {
  element: {
    ...activeElementHistory.element,
    id: 'element-2',
    deactivatedAt: '2026-05-01T00:00:00.000Z',
  },
  entries: [],
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/communities/${COMMUNITY_ID}/inspectable-elements/${ELEMENT_ID}/history`]}
    >
      <Routes>
        <Route
          path="/communities/:communityId/inspectable-elements/:elementId/history"
          element={<ElementReviewHistoryPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ElementReviewHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the request is in flight', () => {
    mockedReadElementReviewHistory.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('element-review-history-loading')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) on a 404 (unreachable element)', async () => {
    mockedReadElementReviewHistory.mockRejectedValue(
      new ApiError(404, 'INSPECTABLE_ELEMENT_NOT_FOUND'),
    );

    renderPage();

    expect(await screen.findByTestId('element-review-history-error')).toBeInTheDocument();
    expect(screen.queryByTestId('element-review-history-loading')).not.toBeInTheDocument();
  });

  it('shows an error state on an unexpected failure', async () => {
    mockedReadElementReviewHistory.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('element-review-history-error')).toBeInTheDocument();
  });

  it('renders the element header, type through the label map, never the raw enum', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

    renderPage();

    const header = await screen.findByTestId('element-review-history-header');
    expect(header).toHaveTextContent('AB3456789C');
    expect(header).toHaveTextContent('Lobby extinguisher');
    expect(header).toHaveTextContent('Ground-floor corridor');
    expect(header).toHaveTextContent('Sunset Towers');
    expect(header).toHaveTextContent('Fire extinguisher');
    expect(header).not.toHaveTextContent('EXTINGUISHER');
  });

  it('shows an active state badge for a non-decommissioned element', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

    renderPage();

    const state = await screen.findByTestId('element-review-history-state');
    expect(state).toHaveTextContent('Active');
    expect(state.dataset.elementState).toBe('active');
  });

  it('shows a decommissioned state badge for a decommissioned element', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(decommissionedElementHistory);

    renderPage();

    const state = await screen.findByTestId('element-review-history-state');
    expect(state).toHaveTextContent('Decommissioned');
    expect(state.dataset.elementState).toBe('decommissioned');
  });

  it('renders every entry, chronological, each linking to its session detail', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

    renderPage();

    const entry1 = await screen.findByTestId('element-review-history-entry-session-1');
    expect(entry1).toHaveTextContent('tech@sf-manager.example');
    const link1 = screen.getByTestId('element-review-history-open-session-1');
    expect(link1).toHaveAttribute('href', '/review-history/session-1');

    const entry2 = screen.getByTestId('element-review-history-entry-session-2');
    expect(entry2).toHaveTextContent('Access blocked');
    const link2 = screen.getByTestId('element-review-history-open-session-2');
    expect(link2).toHaveAttribute('href', '/review-history/session-2');
  });

  it('shows an empty state for a never-reviewed element (reachable, zero entries)', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(decommissionedElementHistory);

    renderPage();

    expect(await screen.findByTestId('element-review-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId(/element-review-history-entry-/)).not.toBeInTheDocument();
  });

  it('renders no control beyond the session links — this is a read-only history view', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

    renderPage();

    await screen.findByTestId('element-review-history-entry-session-1');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelector('form')).not.toBeInTheDocument();
  });

  it('calls readElementReviewHistory with the route params', async () => {
    mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

    renderPage();

    await screen.findByTestId('element-review-history-header');
    expect(mockedReadElementReviewHistory).toHaveBeenCalledWith(COMMUNITY_ID, ELEMENT_ID);
  });

  describe('design system styling', () => {
    it('renders the loading state as an sf-empty line under an sf-page-header', () => {
      mockedReadElementReviewHistory.mockReturnValue(new Promise(() => {}));

      renderPage();

      expect(screen.getByTestId('element-review-history-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the error state as an sf-empty line under an sf-page-header', async () => {
      mockedReadElementReviewHistory.mockRejectedValue(new ApiError(0));

      renderPage();

      expect(await screen.findByTestId('element-review-history-error')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the element as a panel titled by its name with a labelled detail list', async () => {
      mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

      renderPage();

      const header = await screen.findByTestId('element-review-history-header');
      expect(header).toHaveClass('sf-panel');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      const title = within(header).getByRole('heading', { level: 2 });
      expect(title).toHaveClass('sf-section-title');
      expect(title).toHaveTextContent('Lobby extinguisher');

      const terms = within(header).getAllByRole('term');
      expect(terms.map((term) => term.textContent)).toEqual([
        'Code',
        'Type',
        'Location',
        'Community',
        'State',
      ]);
      const values = within(header).getAllByRole('definition');
      expect(values.map((value) => value.textContent)).toEqual([
        'AB3456789C',
        'Fire extinguisher',
        'Ground-floor corridor',
        'Sunset Towers',
        'Active',
      ]);
      expect(values[0]).toHaveClass('sf-data');
      expect(header).not.toHaveTextContent('Code:');
    });

    it('falls back to the unknown-community label in the detail list', async () => {
      mockedReadElementReviewHistory.mockResolvedValue({
        ...activeElementHistory,
        element: { ...activeElementHistory.element, communityName: '' },
      });

      renderPage();

      const header = await screen.findByTestId('element-review-history-header');
      expect(within(header).getAllByRole('definition')[3]).toHaveTextContent('Unknown community');
    });

    it('renders the state as a badge: success when active, neutral when decommissioned', async () => {
      mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

      const { unmount } = renderPage();

      expect(await screen.findByTestId('element-review-history-state')).toHaveClass(
        'sf-badge',
        'sf-badge-success',
      );
      unmount();

      mockedReadElementReviewHistory.mockResolvedValue(decommissionedElementHistory);
      renderPage();

      const state = await screen.findByTestId('element-review-history-state');
      expect(state).toHaveClass('sf-badge');
      expect(state).not.toHaveClass('sf-badge-success');
    });

    it('renders the record as a titled section with an sf-empty state when never reviewed', async () => {
      mockedReadElementReviewHistory.mockResolvedValue(decommissionedElementHistory);

      renderPage();

      const empty = await screen.findByTestId('element-review-history-empty');
      expect(empty).toHaveClass('sf-empty');
      const section = screen.getByTestId('element-review-history-entries');
      expect(section).toHaveClass('sf-section');
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Review record');
    });

    it('renders the record as a wrapped table, one row per entry in the order received', async () => {
      mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

      renderPage();

      const table = await screen.findByRole('table', {
        name: i18n.t('reviewHistory.elementHistory.entriesTitle'),
      });
      expect(table.parentElement).toHaveClass('sf-table-wrap');
      expect(table.querySelector('caption')).toHaveClass('visually-hidden');
      const headers = within(table).getAllByRole('columnheader');
      expect(headers.map((header) => header.textContent)).toEqual([
        'Recorded at',
        'Performed by',
        'Result',
        'Observations',
        '',
      ]);
      for (const header of headers) {
        expect(header).toHaveAttribute('scope', 'col');
      }

      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows.map((row) => row.dataset.testid)).toEqual([
        'element-review-history-entry-session-1',
        'element-review-history-entry-session-2',
      ]);
    });

    it('shows the date as data, the result as a badge and the link as a secondary button', async () => {
      mockedReadElementReviewHistory.mockResolvedValue(activeElementHistory);

      renderPage();

      const reviewedRow = await screen.findByTestId('element-review-history-entry-session-1');
      const reviewedCells = within(reviewedRow).getAllByRole('cell');
      expect(reviewedCells[0]).toHaveClass('sf-data');
      expect(reviewedCells[0]).toHaveTextContent('2026-09-01T00:30:00.000Z');
      expect(reviewedCells[1]).toHaveTextContent('tech@sf-manager.example');
      expect(within(reviewedCells[2]).getByText('Reviewed')).toHaveClass(
        'sf-badge',
        'sf-badge-success',
      );
      expect(reviewedCells[3]).toHaveTextContent('');

      const unreviewedRow = screen.getByTestId('element-review-history-entry-session-2');
      const unreviewedCells = within(unreviewedRow).getAllByRole('cell');
      expect(within(unreviewedCells[2]).getByText('Not reviewed')).toHaveClass(
        'sf-badge',
        'sf-badge-warning',
      );
      expect(unreviewedCells[3]).toHaveTextContent('Access blocked');

      const open = screen.getByTestId('element-review-history-open-session-1');
      expect(open).toHaveClass('sf-btn');
      expect(open).not.toHaveClass('sf-btn-primary');
      expect(open.parentElement).toHaveClass('sf-actions');
    });
  });
});
