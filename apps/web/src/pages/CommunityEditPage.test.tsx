import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import { CommunityEditPage } from './CommunityEditPage';

vi.mock('../api/community');

const mockedListCommunities = vi.mocked(communityApi.listCommunities);
const mockedUpdateCommunity = vi.mocked(communityApi.updateCommunity);

const communityA = {
  id: 'community-1',
  name: 'Sunrise',
  address: '1 Main St',
  locale: 'en' as const,
};
const communityB = {
  id: 'community-2',
  name: 'Harbor View',
  address: '2 Port Rd',
  locale: 'es' as const,
};

function renderPage(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/communities/${id}/edit`]}>
      <Routes>
        <Route path="/communities/:id/edit" element={<CommunityEditPage />} />
        <Route path="/communities" element={<div data-testid="communities-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommunityEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills name, address, and locale from the fetched list', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    renderPage(communityB.id);

    expect(await screen.findByTestId('community-edit-name')).toHaveValue(communityB.name);
    expect(screen.getByTestId('community-edit-address')).toHaveValue(communityB.address);
    expect(screen.getByTestId('community-edit-locale')).toHaveValue(communityB.locale);
  });

  it('shows a not-found state when :id is absent from the list, and renders no form', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    renderPage('community-missing');

    expect(await screen.findByTestId('community-edit-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('community-edit-name')).not.toBeInTheDocument();
  });

  it('shows a network-error state, not not-found, when listCommunities() itself rejects', async () => {
    mockedListCommunities.mockRejectedValue(new ApiError(0));
    renderPage(communityA.id);

    expect(await screen.findByTestId('community-edit-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('community-edit-not-found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('community-edit-name')).not.toBeInTheDocument();
  });

  it('saves changes and navigates to the communities list without a manual reload', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    mockedUpdateCommunity.mockResolvedValue({ ...communityB, name: 'Harbor View Updated' });
    renderPage(communityB.id);

    fireEvent.change(await screen.findByTestId('community-edit-name'), {
      target: { value: 'Harbor View Updated' },
    });
    fireEvent.click(screen.getByTestId('community-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateCommunity).toHaveBeenCalledWith(communityB.id, {
        name: 'Harbor View Updated',
        address: communityB.address,
        locale: communityB.locale,
      }),
    );
    expect(await screen.findByTestId('communities-list-sentinel')).toBeInTheDocument();
  });

  it('blocks submission client-side and shows a validation error for a blank name', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    renderPage(communityB.id);

    fireEvent.change(await screen.findByTestId('community-edit-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('community-edit-submit'));

    expect(await screen.findByTestId('community-edit-error')).toBeInTheDocument();
    expect(mockedUpdateCommunity).not.toHaveBeenCalled();
  });

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    renderPage(communityB.id);

    fireEvent.change(await screen.findByTestId('community-edit-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('community-edit-submit'));

    const first = await screen.findByTestId('community-edit-error');
    fireEvent.click(screen.getByTestId('community-edit-submit'));

    const second = screen.getByTestId('community-edit-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
  });

  it('shows a mapped error message on a server-side rejection, without reading ApiError.message', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    mockedUpdateCommunity.mockRejectedValue(new ApiError(400));
    renderPage(communityB.id);

    fireEvent.click(await screen.findByTestId('community-edit-submit'));

    expect(await screen.findByTestId('community-edit-error')).toBeInTheDocument();
    expect(screen.queryByTestId('communities-list-sentinel')).not.toBeInTheDocument();
  });

  describe('design system', () => {
    it('renders the loading, not-found and error states in empty-state boxes under a page header', async () => {
      mockedListCommunities.mockReturnValue(new Promise(() => {}));
      const loading = renderPage(communityA.id);
      expect(screen.getByTestId('community-edit-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedListCommunities.mockResolvedValue([communityA]);
      const notFound = renderPage('community-missing');
      expect(await screen.findByTestId('community-edit-not-found')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      notFound.unmount();

      mockedListCommunities.mockRejectedValue(new ApiError(0));
      renderPage(communityA.id);
      expect(await screen.findByTestId('community-edit-error-state')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the form under a page header, one field group per label and control', async () => {
      mockedListCommunities.mockResolvedValue([communityA]);
      renderPage(communityA.id);

      const submit = await screen.findByTestId('community-edit-submit');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      expect(submit.closest('form')).toHaveClass('sf-form');
      for (const field of ['name', 'address', 'locale']) {
        const control = screen.getByTestId(`community-edit-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('renders the submit as the primary action and the form error as a danger alert', async () => {
      mockedListCommunities.mockResolvedValue([communityA]);
      mockedUpdateCommunity.mockRejectedValue(new ApiError(400));
      renderPage(communityA.id);

      const submit = await screen.findByTestId('community-edit-submit');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');

      fireEvent.click(submit);

      const error = await screen.findByTestId('community-edit-error');
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
