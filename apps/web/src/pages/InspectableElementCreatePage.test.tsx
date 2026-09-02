import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as inspectableElementApi from '../api/inspectable-element';
import { InspectableElementCreatePage } from './InspectableElementCreatePage';

vi.mock('../api/inspectable-element');

const mockedCreateInspectableElement = vi.mocked(
  inspectableElementApi.createInspectableElement,
);

const COMMUNITY_ID = 'community-1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/communities/${COMMUNITY_ID}/inspectable-elements/new`]}>
      <Routes>
        <Route
          path="/communities/:communityId/inspectable-elements/new"
          element={<InspectableElementCreatePage />}
        />
        <Route
          path="/communities/:communityId/inspectable-elements"
          element={<div data-testid="community-elements-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_NAME = 'Lobby extinguisher';
const VALID_LOCATION = 'Ground-floor corridor';
const VALID_INSTALLED_AT = '2026-03-15';

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId('inspectable-element-create-name'), {
    target: { value: VALID_NAME },
  });
  fireEvent.change(screen.getByTestId('inspectable-element-create-location'), {
    target: { value: VALID_LOCATION },
  });
  fireEvent.change(screen.getByTestId('inspectable-element-create-installed-at'), {
    target: { value: VALID_INSTALLED_AT },
  });
}

describe('InspectableElementCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the elementType options through the label map, never the raw enum value', () => {
    renderPage();

    const select = screen.getByTestId('inspectable-element-create-type');
    expect(select).toHaveTextContent('Fire extinguisher');
    expect(select).not.toHaveTextContent('EXTINGUISHER');
  });

  it('blocks submission client-side and shows a validation error when a required field is empty', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('inspectable-element-create-name'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByTestId('inspectable-element-create-location'), {
      target: { value: VALID_LOCATION },
    });
    fireEvent.change(screen.getByTestId('inspectable-element-create-installed-at'), {
      target: { value: VALID_INSTALLED_AT },
    });
    fireEvent.click(screen.getByTestId('inspectable-element-create-submit'));

    expect(await screen.findByTestId('inspectable-element-create-error')).toBeInTheDocument();
    expect(mockedCreateInspectableElement).not.toHaveBeenCalled();
  });

  it('navigates to the community elements list without a manual reload on a valid submission', async () => {
    mockedCreateInspectableElement.mockResolvedValue({
      id: 'element-1',
      communityId: COMMUNITY_ID,
      elementType: 'EXTINGUISHER',
      name: VALID_NAME,
      description: null,
      location: VALID_LOCATION,
      serialNumber: null,
      installedAt: VALID_INSTALLED_AT,
    });
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByTestId('inspectable-element-create-submit'));

    await waitFor(() =>
      expect(mockedCreateInspectableElement).toHaveBeenCalledWith(COMMUNITY_ID, {
        elementType: 'EXTINGUISHER',
        name: VALID_NAME,
        location: VALID_LOCATION,
        installedAt: VALID_INSTALLED_AT,
      }),
    );
    expect(
      await screen.findByTestId('community-elements-list-sentinel'),
    ).toBeInTheDocument();
  });

  it('shows the generic not-found message when the server rejects with code: COMMUNITY_NOT_FOUND', async () => {
    mockedCreateInspectableElement.mockRejectedValue(new ApiError(404, 'COMMUNITY_NOT_FOUND'));
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByTestId('inspectable-element-create-submit'));

    const error = await screen.findByTestId('inspectable-element-create-error');
    expect(error).toHaveTextContent(
      'This community or inspectable element could not be found.',
    );
    expect(
      screen.queryByTestId('community-elements-list-sentinel'),
    ).not.toBeInTheDocument();
  });

  it('shows a mapped error message (not English server prose) for a generic failure', async () => {
    mockedCreateInspectableElement.mockRejectedValue(new ApiError(0));
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByTestId('inspectable-element-create-submit'));

    expect(await screen.findByTestId('inspectable-element-create-error')).toBeInTheDocument();
  });
});
