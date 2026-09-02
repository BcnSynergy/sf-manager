import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as inspectableElementApi from '../api/inspectable-element';
import { CommunityElementsListPage } from './CommunityElementsListPage';

vi.mock('../api/inspectable-element');

const mockedListInspectableElements = vi.mocked(
  inspectableElementApi.listInspectableElements,
);

const COMMUNITY_ID = 'community-1';

const elementA = {
  id: 'element-1',
  communityId: COMMUNITY_ID,
  elementType: 'EXTINGUISHER' as const,
  name: 'Lobby extinguisher',
  description: 'Ground floor entrance',
  location: 'Ground-floor corridor',
  serialNumber: 'SN-001',
  installedAt: '2026-03-15',
};

const elementB = {
  id: 'element-2',
  communityId: COMMUNITY_ID,
  elementType: 'EXTINGUISHER' as const,
  name: 'Basement extinguisher',
  description: null,
  location: 'Basement parking',
  serialNumber: null,
  installedAt: '2026-01-01',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/communities/${COMMUNITY_ID}/inspectable-elements`]}>
      <Routes>
        <Route
          path="/communities/:communityId/inspectable-elements"
          element={<CommunityElementsListPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommunityElementsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListInspectableElements.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('community-elements-list-loading')).toBeInTheDocument();
  });

  it('shows an empty state when no active elements exist', async () => {
    mockedListInspectableElements.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('community-elements-list-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    mockedListInspectableElements.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('community-elements-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('community-elements-list-loading')).not.toBeInTheDocument();
  });

  it('renders each active element row with its fields, using the label map for elementType', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

    renderPage();

    const row = await screen.findByTestId(`community-elements-list-row-${elementA.id}`);
    expect(row).toHaveTextContent(elementA.name);
    expect(row).toHaveTextContent(elementA.location);
    expect(row).toHaveTextContent(elementA.serialNumber as string);
    expect(row).toHaveTextContent(elementA.installedAt);
    expect(row).toHaveTextContent('Fire extinguisher');
    expect(row).not.toHaveTextContent('EXTINGUISHER');
  });

  it('calls listInspectableElements with the communityId from the route', async () => {
    mockedListInspectableElements.mockResolvedValue([]);

    renderPage();

    await screen.findByTestId('community-elements-list-empty');
    expect(mockedListInspectableElements).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('shows a "New inspectable element" link scoped to the community', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);

    renderPage();

    const link = await screen.findByTestId('community-elements-list-create-link');
    expect(link).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_ID}/inspectable-elements/new`,
    );
  });
});
