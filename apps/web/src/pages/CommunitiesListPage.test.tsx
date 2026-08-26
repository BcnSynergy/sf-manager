import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import { CommunitiesListPage } from './CommunitiesListPage';

vi.mock('../api/community');

const mockedListCommunities = vi.mocked(communityApi.listCommunities);
const mockedSoftDeleteCommunity = vi.mocked(communityApi.softDeleteCommunity);

const communityA = {
  id: 'community-1',
  name: 'Sunset Towers',
  address: '123 Main St',
  locale: 'en' as const,
};
const communityB = {
  id: 'community-2',
  name: 'Riverside Court',
  address: '45 River Rd',
  locale: 'es' as const,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunitiesListPage />
    </MemoryRouter>,
  );
}

describe('CommunitiesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListCommunities.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('communities-list-loading')).toBeInTheDocument();
  });

  it('shows an empty state when no active communities exist', async () => {
    mockedListCommunities.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('communities-list-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    mockedListCommunities.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('communities-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('communities-list-loading')).not.toBeInTheDocument();
  });

  it('renders each active community row with name, address, and locale label', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);

    renderPage();

    const row = await screen.findByTestId(`communities-list-row-${communityB.id}`);
    expect(row).toHaveTextContent(communityB.name);
    expect(row).toHaveTextContent(communityB.address);
    // communityB.locale is 'es' — asserts the translated label renders, not
    // the raw enum value (spec "Enum Value Label Mapping").
    expect(row).toHaveTextContent('Spanish');
    expect(row).not.toHaveTextContent(communityB.locale);
  });

  it('never shows a soft-deleted community (list already excludes it)', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage();

    await screen.findByTestId(`communities-list-row-${communityA.id}`);

    expect(screen.queryByTestId(`communities-list-row-${communityB.id}`)).not.toBeInTheDocument();
  });

  it('shows a "New community" link pointing to /communities/new', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage();

    const link = await screen.findByTestId('communities-list-create-link');
    expect(link).toHaveAttribute('href', '/communities/new');
  });

  it('shows an "Edit" link per row pointing to /communities/:id/edit', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage();

    const link = await screen.findByTestId(`communities-list-edit-${communityA.id}`);
    expect(link).toHaveAttribute('href', `/communities/${communityA.id}/edit`);
  });

  it('requires confirmation before calling softDeleteCommunity', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`communities-list-delete-${communityA.id}`));

    expect(mockedSoftDeleteCommunity).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('deletes the community after confirmation and refetches the list, without a manual reload', async () => {
    mockedListCommunities
      .mockResolvedValueOnce([communityA, communityB])
      .mockResolvedValueOnce([communityB]);
    mockedSoftDeleteCommunity.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByTestId(`communities-list-delete-${communityA.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedSoftDeleteCommunity).toHaveBeenCalledWith(communityA.id));
    await waitFor(() =>
      expect(screen.queryByTestId(`communities-list-row-${communityA.id}`)).not.toBeInTheDocument(),
    );
    expect(mockedListCommunities).toHaveBeenCalledTimes(2);
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`communities-list-delete-${communityA.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedSoftDeleteCommunity).not.toHaveBeenCalled();
    expect(screen.getByTestId(`communities-list-row-${communityA.id}`)).toBeInTheDocument();
  });

  it('shows a mapped message (not English server prose) when deletion fails', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);
    mockedSoftDeleteCommunity.mockRejectedValue(new ApiError(404));

    renderPage();

    fireEvent.click(await screen.findByTestId(`communities-list-delete-${communityA.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('communities-list-action-error')).toBeInTheDocument();
    expect(screen.getByTestId(`communities-list-row-${communityA.id}`)).toBeInTheDocument();
  });
});
