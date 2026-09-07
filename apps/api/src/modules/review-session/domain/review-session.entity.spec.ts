import { ReviewSession, ReviewSessionProps } from './review-session.entity';
import { ReviewSessionNotEditableError } from './errors/review-session-not-editable.error';
import { ElementReviewEntry } from './element-review-entry.entity';
import { ReviewSessionStatus } from './review-session-status';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `ReviewSession` model (design.md
// Interfaces/Contracts). design.md Decision 9: plain fields, no Value
// Objects — the real behaviour is the immutability guard (Decision 8), a
// pure function with no I/O, mirroring
// `review-template/domain/review-template.entity.ts`'s `assertEditable`
// shape.
const makeSession = (
  overrides: Partial<ReviewSessionProps> = {},
): ReviewSession =>
  new ReviewSession({
    id: '01930000-0000-7000-8000-000000000701',
    communityId: '01930000-0000-7000-8000-000000000101',
    templateId: '01930000-0000-7000-8000-000000000501',
    performedById: '01930000-0000-7000-8000-000000000001',
    status: 'draft',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  });

const makeReviewedEntry = () =>
  ElementReviewEntry.reviewed({
    id: 'entry-1',
    reviewSessionId: '01930000-0000-7000-8000-000000000701',
    inspectableElementId: 'element-1',
    answers: [],
    recordedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const makeUnreviewedEntry = () =>
  ElementReviewEntry.unreviewed({
    id: 'entry-2',
    reviewSessionId: '01930000-0000-7000-8000-000000000701',
    inspectableElementId: 'element-2',
    observations: 'sealed room, no access',
    recordedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

describe('ReviewSession', () => {
  it('constructs a draft session with the given identity and fields', () => {
    const session = makeSession();

    expect(session.id).toBe('01930000-0000-7000-8000-000000000701');
    expect(session.communityId).toBe('01930000-0000-7000-8000-000000000101');
    expect(session.templateId).toBe('01930000-0000-7000-8000-000000000501');
    expect(session.performedById).toBe('01930000-0000-7000-8000-000000000001');
    expect(session.status).toBe('draft');
    expect(session.completedAt).toBeNull();
    expect(session.entries).toEqual([]);
  });

  // design.md Interfaces/Contracts: `@@unique([reviewSessionId,
  // inspectableElementId])` — at most one entry per element. recordEntry
  // applies the same upsert semantics locally: re-recording an element
  // replaces its entry rather than duplicating it (spec.md's "re-recording
  // an element corrects rather than duplicates" assumption).
  it('recordEntry replaces an existing entry for the same element rather than duplicating it', () => {
    const session = makeSession();
    const firstAttempt = makeReviewedEntry();

    session.recordEntry(firstAttempt);
    session.recordEntry(makeUnreviewedEntry());
    const secondAttempt = ElementReviewEntry.unreviewed({
      id: 'entry-1-corrected',
      reviewSessionId: '01930000-0000-7000-8000-000000000701',
      inspectableElementId: firstAttempt.inspectableElementId,
      observations: 'corrected: found the key',
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    session.markUnreviewed(secondAttempt);

    expect(session.entries).toHaveLength(2);
    const correctedEntry = session.entries.find(
      (entry) =>
        entry.inspectableElementId === firstAttempt.inspectableElementId,
    );
    expect(correctedEntry?.observations).toBe('corrected: found the key');
  });

  // spec.md "Completed Sessions Are Immutable": "This MUST be enforced by
  // the domain layer, so that it holds regardless of which route, use case
  // or repository method is used to reach the session" — "Immutability
  // holds below the controller: the domain layer is exercised directly,
  // bypassing routes and guards".
  describe('when the session is draft', () => {
    it.each<[string, (session: ReviewSession) => void]>([
      ['recordEntry', (s) => s.recordEntry(makeReviewedEntry())],
      ['markUnreviewed', (s) => s.markUnreviewed(makeUnreviewedEntry())],
      ['complete', (s) => s.complete()],
      ['discard', (s) => s.discard()],
    ])('%s does not throw', (_name, action) => {
      const session = makeSession({ status: 'draft' });

      expect(() => action(session)).not.toThrow();
    });
  });

  describe('when the session is completed', () => {
    it.each<[string, (session: ReviewSession) => void]>([
      ['recordEntry', (s) => s.recordEntry(makeReviewedEntry())],
      ['markUnreviewed', (s) => s.markUnreviewed(makeUnreviewedEntry())],
      ['complete', (s) => s.complete()],
      ['discard', (s) => s.discard()],
    ])('%s throws ReviewSessionNotEditableError', (_name, action) => {
      const session = makeSession({
        status: 'completed' satisfies ReviewSessionStatus,
      });

      expect(() => action(session)).toThrow(ReviewSessionNotEditableError);
    });
  });
});
