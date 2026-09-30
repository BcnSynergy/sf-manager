import { ChecklistQuestionNotFoundError } from '../../modules/checklist-question/domain/errors/checklist-question-not-found.error';
import { InspectableElementNotFoundError } from '../../modules/inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ActiveTemplateNotFoundError } from '../../modules/review-session/domain/errors/active-template-not-found.error';
import { AnswersDoNotMatchTemplateError } from '../../modules/review-session/domain/errors/answers-do-not-match-template.error';
import { CommunityNotInScopeError } from '../../modules/review-session/domain/errors/community-not-in-scope.error';
import { OpenDraftAlreadyExistsError } from '../../modules/review-session/domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotEditableError } from '../../modules/review-session/domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../../modules/review-session/domain/errors/review-session-not-found.error';
import { UnreviewedElementsWithoutReasonError } from '../../modules/review-session/domain/errors/unreviewed-elements-without-reason.error';
import type { ReviewSession } from '../../modules/review-session/domain/review-session.entity';
import type { User } from '../../modules/users/domain/user.entity';
import { ReviewTemplateEmptyError } from '../../modules/review-template/domain/errors/review-template-empty.error';
import { ReviewTemplateNotEditableError } from '../../modules/review-template/domain/errors/review-template-not-editable.error';
import { ReviewTemplateNotFoundError } from '../../modules/review-template/domain/errors/review-template-not-found.error';
import { TransactionConflictError } from '../../modules/review-template/domain/errors/transaction-conflict.error';
import type { ReviewTemplate } from '../../modules/review-template/domain/review-template.entity';
import { DEV_SEED_MARKER, type DevUser } from './dev-dataset';

// dev-seed-data design.md Decision 4: every seeded entity is looked up by a
// natural key a person recognizes (tax id, email, name), never by a fixed
// UUID. Pure so the skip-if-exists decision is unit-testable without ports.
export function findByNaturalKey<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  wanted: string,
): T | undefined {
  return rows.find((row) => keyOf(row) === wanted);
}

// design.md Decision 11: a user that already exists with a different role or
// company has drifted from the dataset. Returns a human-readable difference,
// or null when there is none. Drift detection deliberately covers role and
// company only (Accepted Limitations).
export function describeUserDrift(
  existing: User,
  desired: DevUser,
  desiredCompanyId: string | null,
): string | null {
  const differences: string[] = [];

  if (existing.role !== desired.role) {
    differences.push(`role is ${existing.role}, expected ${desired.role}`);
  }
  if (existing.maintenanceCompanyId !== desiredCompanyId) {
    differences.push(
      `company is ${existing.maintenanceCompanyId ?? 'none'}, expected ${desiredCompanyId ?? 'none'}`,
    );
  }

  return differences.length === 0 ? null : differences.join('; ');
}

export type TemplatePlan =
  | { kind: 'use-active'; id: string }
  | { kind: 'finish-draft'; id: string }
  | { kind: 'create' }
  | { kind: 'skip-foreign-draft'; id: string }
  | { kind: 'skip-unusable-active'; id: string };

// design.md Decision 5. `activeQuestionCount` is the frozen snapshot size of
// the lineage's active template (null when there is none): an empty one
// cannot be answered, so it is unusable rather than reused.
export function planTemplate(
  lineage: readonly Pick<ReviewTemplate, 'id' | 'status' | 'name'>[],
  activeQuestionCount: number | null,
): TemplatePlan {
  const active = lineage.find((t) => t.status === 'active');
  if (active) {
    return activeQuestionCount === 0
      ? { kind: 'skip-unusable-active', id: active.id }
      : { kind: 'use-active', id: active.id };
  }

  const draft = lineage.find((t) => t.status === 'draft');
  if (!draft) {
    return { kind: 'create' };
  }
  return draft.name.includes(DEV_SEED_MARKER)
    ? { kind: 'finish-draft', id: draft.id }
    : { kind: 'skip-foreign-draft', id: draft.id };
}

const EXPECTED_SESSION_ERRORS = [
  ReviewSessionNotFoundError,
  CommunityNotInScopeError,
  ActiveTemplateNotFoundError,
  InspectableElementNotFoundError,
  AnswersDoNotMatchTemplateError,
  ReviewSessionNotEditableError,
  UnreviewedElementsWithoutReasonError,
  OpenDraftAlreadyExistsError,
];

// design.md Decision 12: the domain errors a QA change can raise from the
// session use cases. Anything else is a real bug and must propagate.
export function isExpectedSessionError(error: unknown): boolean {
  return EXPECTED_SESSION_ERRORS.some(
    (ErrorClass) => error instanceof ErrorClass,
  );
}

const EXPECTED_TEMPLATE_ERRORS = [
  ReviewTemplateNotFoundError,
  ReviewTemplateNotEditableError,
  ReviewTemplateEmptyError,
  ChecklistQuestionNotFoundError,
  TransactionConflictError,
];

// The domain errors SetQuestions or Activate can raise while finishing a seed
// draft whose state changed under the seed (a question removed, the draft
// frozen or deleted, a concurrent activation). Anything else is a bug.
export function isExpectedTemplateError(error: unknown): boolean {
  return EXPECTED_TEMPLATE_ERRORS.some(
    (ErrorClass) => error instanceof ErrorClass,
  );
}

export type SessionPlan =
  { kind: 'skip' } | { kind: 'resume'; sessionId: string } | { kind: 'open' };

// design.md Decision 6: keyed on (performer, community) only. A completed
// session wins (a draft plan QA already finished is not reopened), then a
// draft is resumed, else a new one is opened.
export function planSession(
  communityId: string,
  completedOfPerformer: readonly Pick<ReviewSession, 'communityId'>[],
  draftsOfPerformer: readonly Pick<ReviewSession, 'id' | 'communityId'>[],
): SessionPlan {
  if (completedOfPerformer.some((s) => s.communityId === communityId)) {
    return { kind: 'skip' };
  }
  const draft = draftsOfPerformer.find((s) => s.communityId === communityId);
  return draft ? { kind: 'resume', sessionId: draft.id } : { kind: 'open' };
}
