import { useEffect, useState } from 'react';
import { listCommunities, type Community } from '../api/community';

export type CommunityLoadState = 'loading' | 'loaded' | 'not-found' | 'error';

export type UseCommunityResult = {
  community: Community | undefined;
  loadState: CommunityLoadState;
};

// design.md Decision 4: no `GET /communities/:id` exists, so this hook
// fetches listCommunities() and selects the row by :id client-side. Extracted
// into a shared hook (rather than inlined per page, unlike UserEditPage.tsx's
// single-caller listUsers()+find) because CommunityEditPage (this phase) and
// CommunityDetailPage (Phase 7) both need the identical not-found guardrail —
// duplicated guardrails drift. If `:id` is absent from a successfully-fetched
// list (soft-deleted, unknown, or the route param itself missing), callers
// get an explicit 'not-found' state, never a silent redirect (Decision 4's
// guardrail). A rejected listCommunities() call is a distinct 'error' state —
// telling an admin a real community "could not be found" during a transient
// network failure would be misleading.
export function useCommunity(id: string | undefined): UseCommunityResult {
  const [community, setCommunity] = useState<Community | undefined>(undefined);
  const [loadState, setLoadState] = useState<CommunityLoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    listCommunities()
      .then((communities) => {
        if (cancelled) {
          return;
        }
        const found = communities.find((candidate) => candidate.id === id);
        if (!found) {
          setCommunity(undefined);
          setLoadState('not-found');
          return;
        }
        setCommunity(found);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { community, loadState };
}
