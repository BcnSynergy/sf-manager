import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as inspectableElementApi from '../api/inspectable-element';
import { InspectableElementEditPage } from './InspectableElementEditPage';

vi.mock('../api/inspectable-element');

const mockedListInspectableElements = vi.mocked(inspectableElementApi.listInspectableElements);
const mockedUpdateInspectableElement = vi.mocked(inspectableElementApi.updateInspectableElement);
const mockedSoftDeleteInspectableElement = vi.mocked(
  inspectableElementApi.softDeleteInspectableElement,
);

const COMMUNITY_ID = 'community-1';

const elementA = {
  id: 'element-1',
  communityId: COMMUNITY_ID,
  elementType: 'EXTINGUISHER' as const,
  name: 'Lobby extinguisher',
  description: 'Near the main door',
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
  location: 'Basement',
  serialNumber: null,
  installedAt: '2026-01-01',
};

function renderPage(elementId: string) {
  return render(
    <MemoryRouter
      initialEntries={[`/communities/${COMMUNITY_ID}/inspectable-elements/${elementId}/edit`]}
    >
      <Routes>
        <Route
          path="/communities/:communityId/inspectable-elements/:elementId/edit"
          element={<InspectableElementEditPage />}
        />
        <Route
          path="/communities/:communityId/inspectable-elements"
          element={<div data-testid="community-elements-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InspectableElementEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListInspectableElements.mockReturnValue(new Promise(() => {}));

    renderPage(elementA.id);

    expect(screen.getByTestId('inspectable-element-edit-loading')).toBeInTheDocument();
  });

  it('prefills fields from the fetched list, rendering elementType through the label map', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

    renderPage(elementB.id);

    expect(await screen.findByTestId('inspectable-element-edit-name')).toHaveValue(elementB.name);
    expect(screen.getByTestId('inspectable-element-edit-location')).toHaveValue(elementB.location);
    expect(screen.getByTestId('inspectable-element-edit-installed-at')).toHaveValue(
      elementB.installedAt,
    );
    expect(screen.getByTestId('inspectable-element-edit-description')).toHaveValue('');
    expect(screen.getByTestId('inspectable-element-edit-serial-number')).toHaveValue('');
    const type = screen.getByTestId('inspectable-element-edit-type');
    expect(type).toHaveTextContent('Fire extinguisher');
    expect(type).not.toHaveTextContent('EXTINGUISHER');
  });

  it('shows a not-found state when :elementId is absent from the list, and renders no form', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

    renderPage('element-missing');

    expect(await screen.findByTestId('inspectable-element-edit-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('inspectable-element-edit-name')).not.toBeInTheDocument();
  });

  it('shows a network-error state, not not-found, when listInspectableElements() itself rejects', async () => {
    mockedListInspectableElements.mockRejectedValue(new ApiError(0));

    renderPage(elementA.id);

    expect(await screen.findByTestId('inspectable-element-edit-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('inspectable-element-edit-not-found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inspectable-element-edit-name')).not.toBeInTheDocument();
  });

  it('saves changes and navigates to the community elements list without a manual reload', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);
    mockedUpdateInspectableElement.mockResolvedValue({ ...elementA, name: 'Updated name' });

    renderPage(elementA.id);

    fireEvent.change(await screen.findByTestId('inspectable-element-edit-name'), {
      target: { value: 'Updated name' },
    });
    fireEvent.click(screen.getByTestId('inspectable-element-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateInspectableElement).toHaveBeenCalledWith(COMMUNITY_ID, elementA.id, {
        name: 'Updated name',
        description: elementA.description,
        location: elementA.location,
        serialNumber: elementA.serialNumber,
        installedAt: elementA.installedAt,
      }),
    );
    expect(await screen.findByTestId('community-elements-list-sentinel')).toBeInTheDocument();
  });

  it('sends an explicit null, not undefined, when an optional field is cleared', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);
    mockedUpdateInspectableElement.mockResolvedValue(elementA);

    renderPage(elementA.id);

    fireEvent.change(await screen.findByTestId('inspectable-element-edit-description'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('inspectable-element-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateInspectableElement).toHaveBeenCalledWith(
        COMMUNITY_ID,
        elementA.id,
        expect.objectContaining({ description: null }),
      ),
    );
  });

  it('blocks submission client-side and shows a validation error for a blank name', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);

    renderPage(elementA.id);

    fireEvent.change(await screen.findByTestId('inspectable-element-edit-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('inspectable-element-edit-submit'));

    expect(await screen.findByTestId('inspectable-element-edit-error')).toBeInTheDocument();
    expect(mockedUpdateInspectableElement).not.toHaveBeenCalled();
  });

  it('shows the generic not-found message when the update is rejected with code: INSPECTABLE_ELEMENT_NOT_FOUND', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);
    mockedUpdateInspectableElement.mockRejectedValue(
      new ApiError(404, 'INSPECTABLE_ELEMENT_NOT_FOUND'),
    );

    renderPage(elementA.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-edit-submit'));

    const error = await screen.findByTestId('inspectable-element-edit-error');
    expect(error).toHaveTextContent('This community or inspectable element could not be found.');
    expect(screen.queryByTestId('community-elements-list-sentinel')).not.toBeInTheDocument();
  });

  it('requires confirmation before calling softDeleteInspectableElement', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);

    renderPage(elementA.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-edit-delete'));

    expect(mockedSoftDeleteInspectableElement).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);

    renderPage(elementA.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedSoftDeleteInspectableElement).not.toHaveBeenCalled();
    expect(screen.queryByTestId('community-elements-list-sentinel')).not.toBeInTheDocument();
  });

  it('soft-deletes after confirmation and navigates to the list without a manual reload', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);
    mockedSoftDeleteInspectableElement.mockResolvedValue(undefined);

    renderPage(elementA.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(mockedSoftDeleteInspectableElement).toHaveBeenCalledWith(COMMUNITY_ID, elementA.id),
    );
    expect(await screen.findByTestId('community-elements-list-sentinel')).toBeInTheDocument();
  });

  it('shows a delete error distinct from the save error on a failed soft-delete', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);
    mockedSoftDeleteInspectableElement.mockRejectedValue(new ApiError(0));

    renderPage(elementA.id);

    fireEvent.click(await screen.findByTestId('inspectable-element-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('inspectable-element-edit-delete-error')).toBeInTheDocument();
    expect(screen.queryByTestId('community-elements-list-sentinel')).not.toBeInTheDocument();
  });
});
