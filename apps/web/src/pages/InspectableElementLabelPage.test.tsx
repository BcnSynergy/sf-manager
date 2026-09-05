import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import * as inspectableElementApi from '../api/inspectable-element';
import { InspectableElementLabelPage } from './InspectableElementLabelPage';

vi.mock('../api/inspectable-element');
vi.mock('../api/community');

const mockedListInspectableElements = vi.mocked(inspectableElementApi.listInspectableElements);
const mockedListCommunities = vi.mocked(communityApi.listCommunities);

const COMMUNITY_ID = 'community-1';

const community = {
  id: COMMUNITY_ID,
  name: 'Sunset Towers',
  address: '123 Main St',
  locale: 'en' as const,
};

const element = {
  id: 'element-1',
  communityId: COMMUNITY_ID,
  elementType: 'EXTINGUISHER' as const,
  name: 'Lobby extinguisher',
  description: 'Near the main door',
  location: 'Ground-floor corridor',
  serialNumber: 'SN-001',
  installedAt: '2026-03-15',
  code: '23456789AB',
};

function renderPage(elementId: string) {
  return render(
    <MemoryRouter
      initialEntries={[`/communities/${COMMUNITY_ID}/inspectable-elements/${elementId}/label`]}
    >
      <Routes>
        <Route
          path="/communities/:communityId/inspectable-elements/:elementId/label"
          element={<InspectableElementLabelPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InspectableElementLabelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the requests are in flight', () => {
    mockedListInspectableElements.mockReturnValue(new Promise(() => {}));
    mockedListCommunities.mockReturnValue(new Promise(() => {}));

    renderPage(element.id);

    expect(screen.getByTestId('inspectable-element-label-loading')).toBeInTheDocument();
  });

  it('renders the code, name, location, and community once both requests resolve', async () => {
    mockedListInspectableElements.mockResolvedValue([element]);
    mockedListCommunities.mockResolvedValue([community]);

    renderPage(element.id);

    expect(await screen.findByTestId('inspectable-element-label-code')).toHaveTextContent(
      element.code,
    );
    expect(screen.getByTestId('inspectable-element-label-name')).toHaveTextContent(element.name);
    expect(screen.getByTestId('inspectable-element-label-location')).toHaveTextContent(
      element.location,
    );
    expect(screen.getByTestId('inspectable-element-label-community')).toHaveTextContent(
      community.name,
    );
    expect(screen.getByTestId('element-qr-code')).toBeInTheDocument();
  });

  it('calls window.print when the Print button is clicked', async () => {
    mockedListInspectableElements.mockResolvedValue([element]);
    mockedListCommunities.mockResolvedValue([community]);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    renderPage(element.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-label-print'));

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('shows a not-found state when :elementId is absent from the list', async () => {
    mockedListInspectableElements.mockResolvedValue([element]);
    mockedListCommunities.mockResolvedValue([community]);

    renderPage('element-missing');

    expect(await screen.findByTestId('inspectable-element-label-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('inspectable-element-label-code')).not.toBeInTheDocument();
  });

  it('shows an error state, not not-found, when a request rejects', async () => {
    mockedListInspectableElements.mockRejectedValue(new ApiError(0));
    mockedListCommunities.mockResolvedValue([community]);

    renderPage(element.id);

    expect(await screen.findByTestId('inspectable-element-label-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('inspectable-element-label-not-found')).not.toBeInTheDocument();
  });

  it('shows an error state when the element resolves but its community cannot be found', async () => {
    mockedListInspectableElements.mockResolvedValue([element]);
    mockedListCommunities.mockResolvedValue([]);

    renderPage(element.id);

    expect(await screen.findByTestId('inspectable-element-label-error-state')).toBeInTheDocument();
  });

  describe('locale parity', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    it('renders the Spanish title when the active locale is es', async () => {
      mockedListInspectableElements.mockResolvedValue([element]);
      mockedListCommunities.mockResolvedValue([community]);
      await i18n.changeLanguage('es');

      renderPage(element.id);

      expect(await screen.findByTestId('inspectable-element-label-code')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Element label');
    });

    it('renders the Catalan title when the active locale is ca', async () => {
      mockedListInspectableElements.mockResolvedValue([element]);
      mockedListCommunities.mockResolvedValue([community]);
      await i18n.changeLanguage('ca');

      renderPage(element.id);

      expect(await screen.findByTestId('inspectable-element-label-code')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Element label');
    });
  });
});
