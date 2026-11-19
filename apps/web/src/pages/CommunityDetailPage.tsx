import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  addRepresentative,
  addTechnician,
  deactivateRepresentative,
  deactivateTechnician,
  listRepresentatives,
  listTechnicians,
  reactivateRepresentative,
  reactivateTechnician,
} from '../api/community';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { listUsers, type User } from '../api/users';
import type { Role } from '@sf-manager/validation';
import { PageHeader } from '../components/PageHeader';
import {
  AssignmentSection,
  type AssignmentCandidates,
  type AssignmentOps,
  type AssignmentSectionKeys,
} from '../community/AssignmentSection';
import { mapApiErrorToMessageKey } from '../community/error-messages';
import { mapLocaleToLabelKey } from '../community/locale-labels';
import { useCommunity } from '../community/use-community';

const REPRESENTATIVE_KEYS: AssignmentSectionKeys = {
  title: 'community.representatives.title',
  empty: 'community.representatives.empty',
  assignLabel: 'community.representatives.assignLabel',
  confirmTitle: 'community.representatives.confirmTitle',
  confirmMessage: 'community.representatives.confirmMessage',
  ineligible: 'community.representatives.ineligible',
};

const TECHNICIAN_KEYS: AssignmentSectionKeys = {
  title: 'community.technicians.title',
  empty: 'community.technicians.empty',
  assignLabel: 'community.technicians.assignLabel',
  confirmTitle: 'community.technicians.confirmTitle',
  confirmMessage: 'community.technicians.confirmMessage',
  ineligible: 'community.technicians.ineligible',
};

// EN-207: one GET /users per page visit, shared by both sections. An
// assignment action changes no user, so the list is not requested again;
// the section filters out users with a row after each refetch.
type UserList =
  { state: 'loading' } | { state: 'loaded'; users: User[] } | { state: 'error'; errorKey: string };

function useUserList(): UserList {
  const [userList, setUserList] = useState<UserList>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listUsers()
      .then((users) => {
        if (!cancelled) {
          setUserList({ state: 'loaded', users });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUserList({
            state: 'error',
            errorKey: mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return userList;
}

// EN-57: the users each section may assign. Mirrors the API's only
// eligibility rule (assignment-eligibility.policy.ts: the required role per
// assignment kind); the API still enforces it with INELIGIBLE_ROLE.
function candidatesWithRole(userList: UserList, role: Role): AssignmentCandidates {
  if (userList.state !== 'loaded') {
    return userList;
  }
  return {
    state: 'loaded',
    users: userList.users
      .filter((user) => user.role === role)
      .map((user) => ({ id: user.id, email: user.email })),
  };
}

// design.md Decision 3 — the only thing that differs between the two
// sections is endpoints/copy/testid prefix, injected here; AssignmentSection
// itself owns no exclusivity/mode knowledge.
function buildRepresentativeOps(communityId: string): AssignmentOps {
  return {
    list: () => listRepresentatives(communityId),
    assign: (userId) => addRepresentative(communityId, userId),
    deactivate: (userId) => deactivateRepresentative(communityId, userId),
    reactivate: (userId) => reactivateRepresentative(communityId, userId),
  };
}

function buildTechnicianOps(communityId: string): AssignmentOps {
  return {
    list: () => listTechnicians(communityId),
    assign: (userId) => addTechnician(communityId, userId),
    deactivate: (userId) => deactivateTechnician(communityId, userId),
    reactivate: (userId) => reactivateTechnician(communityId, userId),
  };
}

// spec.md "Community Detail View" / "Representative Assignment Lifecycle" /
// "Technician Assignment Lifecycle". Reuses useCommunity(id) (Phase 6) for
// the community fields — this page does NOT re-implement a fetch-and-select
// (design.md Decision 4, apply-time verification target). The community
// fetch and the two assignment lists are three INDEPENDENT PARALLEL
// requests (design.md Data Flow): the assignment lists take :id directly
// from the route and do not wait on useCommunity's result, so a slow or
// failing community fetch never blanks them, and vice versa. The only
// state that suppresses the assignment sections is 'not-found' — the
// assignment endpoints are not gated on the community being listed, so
// rendering them for an unknown/soft-deleted community would offer actions
// on a community the admin cannot see (design.md Decision 4 guardrail).
//
// Multi-community warning (spec "Representative Assignment Lifecycle"):
// deliberately not surfaced anywhere on this page — RepresentativeAssignment
// .warning is typed in api/community.ts but never read here.
export function CommunityDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { community, loadState } = useCommunity(id);
  const userList = useUserList();

  return (
    <main>
      <PageHeader title={t('community.detail.title')}>
        {/* design.md Decision 9 — this Link is CommunityDetailPage's only
            sanctioned change for the inspectable-elements slice; the elements
            list is a distinct, community-scoped route, never a standalone one
            (spec.md "Navigation to Inspectable Elements"). */}
        {loadState === 'loaded' && community && id !== undefined && (
          <Link
            to={`/communities/${id}/inspectable-elements`}
            className="sf-btn sf-btn-primary"
            data-testid="community-detail-elements-link"
          >
            {t('community.detail.elementsLink')}
          </Link>
        )}
      </PageHeader>

      {loadState === 'loading' && (
        <p className="sf-empty" data-testid="community-detail-loading">
          {t('community.list.loading')}
        </p>
      )}

      {loadState === 'not-found' && (
        <p className="sf-empty" data-testid="community-detail-not-found">
          {t('community.detail.notFound')}
        </p>
      )}

      {loadState === 'error' && (
        <p className="sf-empty" data-testid="community-detail-error-state">
          {t('common.error.network')}
        </p>
      )}

      {loadState === 'loaded' && community && (
        <div className="sf-panel">
          <dl>
            <dt>{t('community.detail.nameLabel')}</dt>
            <dd data-testid="community-detail-name">{community.name}</dd>
            <dt>{t('community.detail.addressLabel')}</dt>
            <dd data-testid="community-detail-address">{community.address}</dd>
            <dt>{t('community.detail.localeLabel')}</dt>
            <dd data-testid="community-detail-locale">
              {t(mapLocaleToLabelKey(community.locale))}
            </dd>
          </dl>
        </div>
      )}

      {id !== undefined && loadState !== 'not-found' && (
        <>
          <AssignmentSection
            ops={buildRepresentativeOps(id)}
            candidates={candidatesWithRole(userList, 'COMMUNITY_REPRESENTATIVE')}
            testIdPrefix="representatives"
            keys={REPRESENTATIVE_KEYS}
          />
          <AssignmentSection
            ops={buildTechnicianOps(id)}
            candidates={candidatesWithRole(userList, 'MAINTENANCE_TECHNICIAN')}
            testIdPrefix="technicians"
            keys={TECHNICIAN_KEYS}
          />
        </>
      )}
    </main>
  );
}
