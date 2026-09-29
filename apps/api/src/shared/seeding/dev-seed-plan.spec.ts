import { InspectableElementNotFoundError } from '../../modules/inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ActiveTemplateNotFoundError } from '../../modules/review-session/domain/errors/active-template-not-found.error';
import { AnswersDoNotMatchTemplateError } from '../../modules/review-session/domain/errors/answers-do-not-match-template.error';
import { CommunityNotInScopeError } from '../../modules/review-session/domain/errors/community-not-in-scope.error';
import { OpenDraftAlreadyExistsError } from '../../modules/review-session/domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotEditableError } from '../../modules/review-session/domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../../modules/review-session/domain/errors/review-session-not-found.error';
import { UnreviewedElementsWithoutReasonError } from '../../modules/review-session/domain/errors/unreviewed-elements-without-reason.error';
import { User } from '../../modules/users/domain/user.entity';
import type { DevUser } from './dev-dataset';
import {
  describeUserDrift,
  findByNaturalKey,
  isExpectedSessionError,
  planSession,
  planTemplate,
} from './dev-seed-plan';

describe('findByNaturalKey', () => {
  const rows = [
    { id: 'a', key: 'B1' },
    { id: 'b', key: 'B2' },
  ];

  it('returns the row whose key equals the wanted one', () => {
    expect(findByNaturalKey(rows, (r) => r.key, 'B2')).toEqual({
      id: 'b',
      key: 'B2',
    });
  });

  it('returns undefined when no row matches', () => {
    expect(findByNaturalKey(rows, (r) => r.key, 'B3')).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(
      findByNaturalKey([], (r: { key: string }) => r.key, 'B1'),
    ).toBeUndefined();
  });
});

describe('describeUserDrift', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const desired: DevUser = {
    email: 'technician@sf-manager.example',
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: 'B99000001',
  };

  function userWith(
    role: User['role'],
    maintenanceCompanyId: string | null,
  ): User {
    return new User({
      id: 'u1',
      email: desired.email,
      passwordHash: 'hash',
      role,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      maintenanceCompanyId,
    });
  }

  it('returns null when role and company match', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', 'c1'),
        desired,
        'c1',
      ),
    ).toBeNull();
  });

  it('describes a different role', () => {
    expect(describeUserDrift(userWith('MANAGER', 'c1'), desired, 'c1')).toBe(
      'role is MANAGER, expected MAINTENANCE_TECHNICIAN',
    );
  });

  it('describes a different company', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', 'c9'),
        desired,
        'c1',
      ),
    ).toBe('company is c9, expected c1');
  });

  it('describes a missing company (the legacy dev technician has none)', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', null),
        desired,
        'c1',
      ),
    ).toBe('company is none, expected c1');
  });

  it('describes both differences together', () => {
    expect(describeUserDrift(userWith('MANAGER', null), desired, 'c1')).toBe(
      'role is MANAGER, expected MAINTENANCE_TECHNICIAN; company is none, expected c1',
    );
  });

  it('expects no company for a role without one', () => {
    const rep: DevUser = {
      email: desired.email,
      role: 'COMMUNITY_REPRESENTATIVE',
    };

    expect(
      describeUserDrift(userWith('COMMUNITY_REPRESENTATIVE', null), rep, null),
    ).toBeNull();
    expect(
      describeUserDrift(userWith('COMMUNITY_REPRESENTATIVE', 'c1'), rep, null),
    ).toBe('company is c1, expected none');
  });
});

describe('planTemplate', () => {
  const foreign = (
    status: 'draft' | 'active' | 'retired',
    id = 't-foreign',
  ) => ({
    id,
    status,
    name: 'Someone elses template',
  });
  const seeded = (status: 'draft' | 'active' | 'retired', id = 't-seed') => ({
    id,
    status,
    name: 'Dev Seed Extinguisher Monthly Check',
  });

  it('creates a new template for an empty lineage', () => {
    expect(planTemplate([], null)).toEqual({ kind: 'create' });
  });

  it('creates a new template when the lineage only holds retired versions', () => {
    expect(planTemplate([foreign('retired')], null)).toEqual({
      kind: 'create',
    });
  });

  it('uses an active template that has questions in its snapshot', () => {
    expect(planTemplate([seeded('active', 't-1')], 3)).toEqual({
      kind: 'use-active',
      id: 't-1',
    });
    expect(planTemplate([foreign('active', 't-2')], 1)).toEqual({
      kind: 'use-active',
      id: 't-2',
    });
  });

  it('prefers the active template over a draft', () => {
    expect(
      planTemplate([foreign('draft'), seeded('active', 't-1')], 2),
    ).toEqual({ kind: 'use-active', id: 't-1' });
  });

  it('flags an active template with an empty snapshot as unusable', () => {
    expect(planTemplate([foreign('active', 't-3')], 0)).toEqual({
      kind: 'skip-unusable-active',
      id: 't-3',
    });
  });

  it('finishes a draft that carries the seed marker', () => {
    expect(planTemplate([seeded('draft', 't-4')], null)).toEqual({
      kind: 'finish-draft',
      id: 't-4',
    });
  });

  it('leaves a draft without the marker alone', () => {
    expect(planTemplate([foreign('draft', 't-5')], null)).toEqual({
      kind: 'skip-foreign-draft',
      id: 't-5',
    });
  });
});

describe('isExpectedSessionError', () => {
  it.each(
    [
      new ReviewSessionNotFoundError(),
      new CommunityNotInScopeError(),
      new ActiveTemplateNotFoundError(),
      new InspectableElementNotFoundError(),
      new AnswersDoNotMatchTemplateError(),
      new ReviewSessionNotEditableError(),
      new UnreviewedElementsWithoutReasonError(['E1']),
      new OpenDraftAlreadyExistsError(),
    ].map((error) => [error.name, error] as const),
  )('is true for %s', (_name, error) => {
    expect(isExpectedSessionError(error)).toBe(true);
  });

  it('is false for a generic Error and for a non-error value', () => {
    expect(isExpectedSessionError(new Error('boom'))).toBe(false);
    expect(isExpectedSessionError('boom')).toBe(false);
  });
});

describe('planSession', () => {
  it('skips when a completed session exists in the community', () => {
    expect(
      planSession(
        'c1',
        [{ communityId: 'c1' }],
        [{ id: 's', communityId: 'c1' }],
      ),
    ).toEqual({ kind: 'skip' });
  });

  it('resumes the draft of the community when none is completed', () => {
    expect(
      planSession(
        'c1',
        [{ communityId: 'c2' }],
        [{ id: 's1', communityId: 'c1' }],
      ),
    ).toEqual({ kind: 'resume', sessionId: 's1' });
  });

  it('opens when the performer has no session in the community', () => {
    expect(
      planSession(
        'c1',
        [{ communityId: 'c2' }],
        [{ id: 's2', communityId: 'c2' }],
      ),
    ).toEqual({ kind: 'open' });
  });

  it('opens for a performer without any session', () => {
    expect(planSession('c1', [], [])).toEqual({ kind: 'open' });
  });
});
