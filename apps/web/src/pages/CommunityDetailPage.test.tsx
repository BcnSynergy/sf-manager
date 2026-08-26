import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import { CommunityDetailPage } from './CommunityDetailPage';

vi.mock('../api/community');

const mockedListCommunities = vi.mocked(communityApi.listCommunities);
const mockedListRepresentatives = vi.mocked(communityApi.listRepresentatives);
const mockedListTechnicians = vi.mocked(communityApi.listTechnicians);
const mockedAddRepresentative = vi.mocked(communityApi.addRepresentative);
const mockedDeactivateRepresentative = vi.mocked(communityApi.deactivateRepresentative);

const communityA = { id: 'community-1', name: 'Sunrise', address: '1 Main St', locale: 'en' as const };

function renderPage(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/communities/${id}`]}>
      <Routes>
        <Route path="/communities/:id" element={<CommunityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Finds the enclosing <section> for a given AssignmentSection instance via
// one of its stable inner testids, since the <section> element itself
// carries no testid of its own (mirrors AssignmentSection.tsx's markup).
function getSectionContainer(testIdPrefix: string) {
  const marker = screen.getByTestId(`${testIdPrefix}-assign-input`);
  const section = marker.closest('section');
  if (!section) {
    throw new Error(`no <section> ancestor found for ${testIdPrefix}`);
  }
  return section;
}

describe('CommunityDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListRepresentatives.mockResolvedValue([]);
    mockedListTechnicians.mockResolvedValue([]);
  });

  it('shows a loading state while the community fetch is in flight', () => {
    mockedListCommunities.mockReturnValue(new Promise(() => {}));

    renderPage(communityA.id);

    expect(screen.getByTestId('community-detail-loading')).toBeInTheDocument();
  });

  it('renders the community name, address, and locale once loaded', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);

    renderPage(communityA.id);

    expect(await screen.findByTestId('community-detail-name')).toHaveTextContent(communityA.name);
    expect(screen.getByTestId('community-detail-address')).toHaveTextContent(communityA.address);
    // 'en' must render through the locale label map, not as the raw enum value.
    expect(screen.getByTestId('community-detail-locale')).toHaveTextContent('English');
    expect(screen.getByTestId('community-detail-locale')).not.toHaveTextContent('en');
  });

  it('fetches representatives and technicians independently, not waiting on the community fetch', async () => {
    // The community fetch never resolves; the two assignment lists still do —
    // proving they are independent parallel requests, not sequenced/Promise.all'd
    // behind the community fetch (design.md Decision 4).
    mockedListCommunities.mockReturnValue(new Promise(() => {}));

    renderPage(communityA.id);

    expect(screen.getByTestId('community-detail-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('representatives-empty')).toBeInTheDocument();
    expect(await screen.findByTestId('technicians-empty')).toBeInTheDocument();
  });

  it('still renders both assignment sections when the community fetch itself errors', async () => {
    mockedListCommunities.mockRejectedValue(new ApiError(0));

    renderPage(communityA.id);

    expect(await screen.findByTestId('community-detail-error-state')).toBeInTheDocument();
    expect(await screen.findByTestId('representatives-empty')).toBeInTheDocument();
    expect(await screen.findByTestId('technicians-empty')).toBeInTheDocument();
  });

  it('renders neither assignment section when the community is not found', async () => {
    mockedListCommunities.mockResolvedValue([]);

    renderPage('community-missing');

    expect(await screen.findByTestId('community-detail-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('representatives-assign-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('technicians-assign-input')).not.toBeInTheDocument();
  });

  it('composes two independent AssignmentSection instances, each with its own ConfirmDialog', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);
    mockedListRepresentatives.mockResolvedValue([
      { communityId: communityA.id, userId: 'rep-a', deactivatedAt: null },
    ]);
    mockedListTechnicians.mockResolvedValue([
      { communityId: communityA.id, userId: 'tech-a', deactivatedAt: null },
    ]);

    renderPage(communityA.id);

    await screen.findByTestId('representatives-row-rep-a');
    await screen.findByTestId('technicians-row-tech-a');

    // Both AssignmentSection instances are mounted simultaneously, so BOTH
    // render a ConfirmDialog with the SAME fixed `confirm-dialog` testid
    // (ConfirmDialog.tsx does not parameterize it). An unscoped query must
    // fail with "found multiple elements" — this assertion documents and
    // proves that risk instead of silently avoiding it.
    expect(() => screen.getByTestId('confirm-dialog')).toThrow();

    fireEvent.click(screen.getByTestId('representatives-deactivate-rep-a'));

    const repSection = getSectionContainer('representatives');
    const techSection = getSectionContainer('technicians');

    expect(within(repSection).getByTestId('confirm-dialog')).toHaveAttribute('open');
    expect(within(techSection).getByTestId('confirm-dialog')).not.toHaveAttribute('open');

    fireEvent.click(within(repSection).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedDeactivateRepresentative).toHaveBeenCalledWith(communityA.id, 'rep-a'));
  });

  it('renders the representative exclusivity swap after a mocked add, scoped to the representatives section', async () => {
    mockedListCommunities.mockResolvedValue([communityA]);
    mockedListRepresentatives
      .mockResolvedValueOnce([{ communityId: communityA.id, userId: 'incumbent', deactivatedAt: null }])
      .mockResolvedValueOnce([
        { communityId: communityA.id, userId: 'incumbent', deactivatedAt: '2026-08-26T00:00:00.000Z' },
        { communityId: communityA.id, userId: 'new-rep', deactivatedAt: null },
      ]);
    mockedAddRepresentative.mockResolvedValue({
      communityId: communityA.id,
      userId: 'new-rep',
      deactivatedAt: null,
    });

    renderPage(communityA.id);

    await screen.findByTestId('representatives-row-incumbent');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'new-rep' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('representatives-row-incumbent')).toHaveTextContent(
        'Deactivated',
      ),
    );
    expect(screen.getByTestId('representatives-row-new-rep')).toHaveTextContent(
      'Active',
    );
    // Technicians section is untouched by the representative-only swap.
    expect(screen.getByTestId('technicians-empty')).toBeInTheDocument();
  });
});
