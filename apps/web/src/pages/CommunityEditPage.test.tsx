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

const communityA = { id: 'community-1', name: 'Sunrise', address: '1 Main St', locale: 'en' as const };
const communityB = { id: 'community-2', name: 'Harbor View', address: '2 Port Rd', locale: 'es' as const };

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

    fireEvent.change(await screen.findByTestId('community-edit-name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('community-edit-submit'));

    expect(await screen.findByTestId('community-edit-error')).toBeInTheDocument();
    expect(mockedUpdateCommunity).not.toHaveBeenCalled();
  });

  it('shows a mapped error message on a server-side rejection, without reading ApiError.message', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    mockedUpdateCommunity.mockRejectedValue(new ApiError(400));
    renderPage(communityB.id);

    fireEvent.click(await screen.findByTestId('community-edit-submit'));

    expect(await screen.findByTestId('community-edit-error')).toBeInTheDocument();
    expect(screen.queryByTestId('communities-list-sentinel')).not.toBeInTheDocument();
  });
});
