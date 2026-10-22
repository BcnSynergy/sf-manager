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
  code: '23456789AB',
  deactivatedAt: null,
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
  code: 'CDEFGHJKMN',
  deactivatedAt: '2026-05-01T00:00:00.000Z',
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

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    mockedListInspectableElements.mockResolvedValue([elementA]);

    renderPage(elementA.id);

    fireEvent.change(await screen.findByTestId('inspectable-element-edit-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('inspectable-element-edit-submit'));

    const first = await screen.findByTestId('inspectable-element-edit-error');
    fireEvent.click(screen.getByTestId('inspectable-element-edit-submit'));

    const second = screen.getByTestId('inspectable-element-edit-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
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

  // inspectable-element-admin-ui spec.md "Decommission and Reactivate
  // Control": single-element, reason-free, requires confirmation before
  // decommissioning, reflects the new state once the action succeeds.
  describe('decommission / reactivate control', () => {
    it('shows a Decommission action for an active element', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

      renderPage(elementA.id);

      expect(
        await screen.findByTestId('inspectable-element-edit-decommission'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('inspectable-element-edit-reactivate')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('inspectable-element-edit-deactivated-label'),
      ).not.toBeInTheDocument();
    });

    it('shows a decommissioned state label for a decommissioned element', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

      renderPage(elementB.id);

      expect(
        await screen.findByTestId('inspectable-element-edit-deactivated-label'),
      ).toBeInTheDocument();
    });

    it('shows a Reactivate action for a decommissioned element', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA, elementB]);

      renderPage(elementB.id);

      expect(await screen.findByTestId('inspectable-element-edit-reactivate')).toBeInTheDocument();
      expect(screen.queryByTestId('inspectable-element-edit-decommission')).not.toBeInTheDocument();
    });

    it('requires confirmation before decommissioning and sends no request when dismissed', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);

      renderPage(elementA.id);

      fireEvent.click(await screen.findByTestId('inspectable-element-edit-decommission'));
      expect(mockedUpdateInspectableElement).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(mockedUpdateInspectableElement).not.toHaveBeenCalled();
      expect(screen.getByTestId('inspectable-element-edit-decommission')).toBeInTheDocument();
    });

    it('decommissions an active element after confirmation and shows Reactivate afterward', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      mockedUpdateInspectableElement.mockResolvedValue({
        ...elementA,
        deactivatedAt: '2026-06-01T00:00:00.000Z',
      });

      renderPage(elementA.id);

      fireEvent.click(await screen.findByTestId('inspectable-element-edit-decommission'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() =>
        expect(mockedUpdateInspectableElement).toHaveBeenCalledWith(COMMUNITY_ID, elementA.id, {
          deactivated: true,
        }),
      );
      expect(await screen.findByTestId('inspectable-element-edit-reactivate')).toBeInTheDocument();
    });

    it('reactivates a decommissioned element without a confirmation dialog', async () => {
      mockedListInspectableElements.mockResolvedValue([elementB]);
      mockedUpdateInspectableElement.mockResolvedValue({
        ...elementB,
        deactivatedAt: null,
      });

      renderPage(elementB.id);

      fireEvent.click(await screen.findByTestId('inspectable-element-edit-reactivate'));

      await waitFor(() =>
        expect(mockedUpdateInspectableElement).toHaveBeenCalledWith(COMMUNITY_ID, elementB.id, {
          deactivated: false,
        }),
      );
      expect(
        await screen.findByTestId('inspectable-element-edit-decommission'),
      ).toBeInTheDocument();
    });

    it('shows a distinct error and leaves the displayed state unchanged on a failed decommission', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      mockedUpdateInspectableElement.mockRejectedValue(new ApiError(0));

      renderPage(elementA.id);

      fireEvent.click(await screen.findByTestId('inspectable-element-edit-decommission'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(
        await screen.findByTestId('inspectable-element-edit-decommission-error'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('inspectable-element-edit-decommission')).toBeInTheDocument();
    });
  });

  describe('design system', () => {
    it('renders the loading, not-found and error states in empty-state boxes under a page header', async () => {
      mockedListInspectableElements.mockReturnValue(new Promise(() => {}));
      const loading = renderPage(elementA.id);
      expect(screen.getByTestId('inspectable-element-edit-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedListInspectableElements.mockResolvedValue([elementA]);
      const notFound = renderPage('element-missing');
      expect(await screen.findByTestId('inspectable-element-edit-not-found')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      notFound.unmount();

      mockedListInspectableElements.mockRejectedValue(new ApiError(0));
      renderPage(elementA.id);
      expect(await screen.findByTestId('inspectable-element-edit-error-state')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    // EN-75: the read-only element type is a field group like the editable
    // fields: a bold term above its value, inside an sf-field.
    it('renders the read-only element type as a field group with a bold term', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      renderPage(elementA.id);

      const type = await screen.findByTestId('inspectable-element-edit-type');
      const field = type.parentElement;
      expect(field).toHaveClass('sf-field');
      expect(field?.children).toHaveLength(2);
      expect(field?.firstElementChild).toHaveClass('sf-label');
      // EN-78: a colon kept for screen readers only, so the term and the value
      // are not read as one run.
      expect(field?.firstElementChild).toHaveTextContent(/^Type:$/);
      expect(field?.firstElementChild?.lastElementChild).toHaveClass('visually-hidden');
      expect(field?.firstElementChild?.lastElementChild).toHaveTextContent(/^:$/);
      expect(type).toHaveTextContent(/^Fire extinguisher$/);
    });

    it('renders the form as field groups with the submit as the primary action', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      renderPage(elementA.id);

      const submit = await screen.findByTestId('inspectable-element-edit-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['name', 'description', 'location', 'serial-number', 'installed-at']) {
        const control = screen.getByTestId(`inspectable-element-edit-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    // EN-74: the header holds only the title, so the form fields come first
    // in tab order and the element actions follow the form's Save in their
    // own group, Decommission before Delete.
    it('puts Decommission (secondary) then Delete (danger) after the form, following Save in tab order', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      renderPage(elementA.id);

      const decommission = await screen.findByTestId('inspectable-element-edit-decommission');
      const submit = screen.getByTestId('inspectable-element-edit-submit');
      const remove = screen.getByTestId('inspectable-element-edit-delete');
      expect(decommission).toHaveClass('sf-btn');
      expect(decommission).not.toHaveClass('sf-btn-primary');
      expect(decommission).not.toHaveClass('sf-btn-danger');
      expect(remove).toHaveClass('sf-btn', 'sf-btn-danger');
      for (const action of [decommission, remove]) {
        expect(action.parentElement).toHaveClass('sf-actions');
        expect(action.closest('.sf-page-header')).toBeNull();
        expect(action.closest('form')).toBeNull();
      }
      expect(screen.getByRole('heading', { level: 1 }).parentElement?.children).toHaveLength(1);
      expect(
        submit.compareDocumentPosition(decommission) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        decommission.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('puts Reactivate (secondary) after the form and shows the decommissioned state as a badge', async () => {
      mockedListInspectableElements.mockResolvedValue([elementB]);
      renderPage(elementB.id);

      const reactivate = await screen.findByTestId('inspectable-element-edit-reactivate');
      expect(reactivate).toHaveClass('sf-btn');
      expect(reactivate).not.toHaveClass('sf-btn-primary');
      expect(reactivate.closest('.sf-page-header')).toBeNull();
      expect(reactivate.closest('form')).toBeNull();
      expect(
        screen.getByTestId('inspectable-element-edit-submit').compareDocumentPosition(reactivate) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        reactivate.compareDocumentPosition(screen.getByTestId('inspectable-element-edit-delete')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByTestId('inspectable-element-edit-deactivated-label')).toHaveClass(
        'sf-badge',
      );
    });

    it('shows the save, delete and decommission failures as danger alerts', async () => {
      mockedListInspectableElements.mockResolvedValue([elementA]);
      mockedUpdateInspectableElement.mockRejectedValue(new ApiError(400));
      mockedSoftDeleteInspectableElement.mockRejectedValue(new ApiError(400));
      renderPage(elementA.id);

      fireEvent.click(await screen.findByTestId('inspectable-element-edit-submit'));
      const saveError = await screen.findByTestId('inspectable-element-edit-error');
      expect(mockedUpdateInspectableElement).toHaveBeenCalled();
      expect(saveError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(saveError).toHaveAttribute('role', 'alert');

      fireEvent.click(screen.getByTestId('inspectable-element-edit-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      const deleteError = await screen.findByTestId('inspectable-element-edit-delete-error');
      expect(deleteError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(deleteError).toHaveAttribute('role', 'alert');
      expect(deleteError.closest('form')).toBeNull();
      expect(
        screen.getByTestId('inspectable-element-edit-submit').compareDocumentPosition(deleteError) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        deleteError.compareDocumentPosition(screen.getByTestId('inspectable-element-edit-delete')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      fireEvent.click(screen.getByTestId('inspectable-element-edit-decommission'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      const decommissionError = await screen.findByTestId(
        'inspectable-element-edit-decommission-error',
      );
      expect(decommissionError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(decommissionError).toHaveAttribute('role', 'alert');
      expect(decommissionError.closest('form')).toBeNull();
      expect(
        screen
          .getByTestId('inspectable-element-edit-submit')
          .compareDocumentPosition(decommissionError) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        decommissionError.compareDocumentPosition(
          screen.getByTestId('inspectable-element-edit-decommission'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
