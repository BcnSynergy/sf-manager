import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import { useCommunity } from './use-community';

vi.mock('../api/community');

const mockedListCommunities = vi.mocked(communityApi.listCommunities);

const communityA = { id: 'community-1', name: 'Sunrise', address: '1 Main St', locale: 'en' as const };
const communityB = { id: 'community-2', name: 'Harbor View', address: '2 Port Rd', locale: 'es' as const };

describe('useCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in a loading state', () => {
    mockedListCommunities.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCommunity(communityA.id));

    expect(result.current.loadState).toBe('loading');
    expect(result.current.community).toBeUndefined();
  });

  it('selects the matching community by :id from the full list', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    const { result } = renderHook(() => useCommunity(communityB.id));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.community).toEqual(communityB);
  });

  it('renders an explicit not-found state when :id is absent from the list', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    const { result } = renderHook(() => useCommunity('community-missing'));

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));
    expect(result.current.community).toBeUndefined();
  });

  it('renders an explicit not-found state when :id is undefined', async () => {
    mockedListCommunities.mockResolvedValue([communityA, communityB]);
    const { result } = renderHook(() => useCommunity(undefined));

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));
    expect(result.current.community).toBeUndefined();
  });

  it('renders a distinct error state, not not-found, when listCommunities() itself rejects', async () => {
    mockedListCommunities.mockRejectedValue(new ApiError(0));
    const { result } = renderHook(() => useCommunity(communityA.id));

    await waitFor(() => expect(result.current.loadState).toBe('error'));
    expect(result.current.community).toBeUndefined();
  });
});
