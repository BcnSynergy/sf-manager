import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
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
      observations: null,
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
      initialEntries={[
        `/communities/${COMMUNITY_ID}/inspectable-elements/${ELEMENT_ID}/history`,
      ]}
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
});
