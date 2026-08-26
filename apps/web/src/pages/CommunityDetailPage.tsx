import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
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
import { AssignmentSection, type AssignmentOps } from '../community/AssignmentSection';
import { mapLocaleToLabelKey } from '../community/locale-labels';
import { useCommunity } from '../community/use-community';

const REPRESENTATIVE_KEYS = {
  title: 'community.representatives.title',
  empty: 'community.representatives.empty',
  assignLabel: 'community.representatives.assignLabel',
  confirmTitle: 'community.representatives.confirmTitle',
  confirmMessage: 'community.representatives.confirmMessage',
  ineligible: 'community.representatives.ineligible',
};

const TECHNICIAN_KEYS = {
  title: 'community.technicians.title',
  empty: 'community.technicians.empty',
  assignLabel: 'community.technicians.assignLabel',
  confirmTitle: 'community.technicians.confirmTitle',
  confirmMessage: 'community.technicians.confirmMessage',
  ineligible: 'community.technicians.ineligible',
};

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

  return (
    <main>
      <h1>{t('community.detail.title')}</h1>

      {loadState === 'loading' && (
        <p data-testid="community-detail-loading">{t('community.list.loading')}</p>
      )}

      {loadState === 'not-found' && (
        <p data-testid="community-detail-not-found">{t('community.detail.notFound')}</p>
      )}

      {loadState === 'error' && (
        <p data-testid="community-detail-error-state">{t('common.error.network')}</p>
      )}

      {loadState === 'loaded' && community && (
        <dl>
          <dt>{t('community.detail.nameLabel')}</dt>
          <dd data-testid="community-detail-name">{community.name}</dd>
          <dt>{t('community.detail.addressLabel')}</dt>
          <dd data-testid="community-detail-address">{community.address}</dd>
          <dt>{t('community.detail.localeLabel')}</dt>
          <dd data-testid="community-detail-locale">{t(mapLocaleToLabelKey(community.locale))}</dd>
        </dl>
      )}

      {id !== undefined && loadState !== 'not-found' && (
        <>
          <AssignmentSection
            ops={buildRepresentativeOps(id)}
            testIdPrefix="representatives"
            keys={REPRESENTATIVE_KEYS}
          />
          <AssignmentSection
            ops={buildTechnicianOps(id)}
            testIdPrefix="technicians"
            keys={TECHNICIAN_KEYS}
          />
        </>
      )}
    </main>
  );
}
