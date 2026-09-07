import { ElementReviewEntry } from './element-review-entry.entity';
import { QuestionAnswer } from './question-answer.entity';
import { MissingObservationsError } from './errors/missing-observations.error';

// design.md Decision 1 (BLOCKING, resolved): `observations` lives on
// ElementReviewEntry, nullable, and is the entry's skip reason. An entry is
// valid iff EXACTLY ONE of: `answers.length > 0 && observations === null`
// (reviewed), or `answers.length === 0 && observations !== null`
// (unreviewed). No public constructor — `.reviewed()`/`.unreviewed()` are
// the only ways to build one, so the illegal state is unconstructible.
const makeAnswer = (questionId: string) =>
  new QuestionAnswer({
    id: `answer-${questionId}`,
    elementReviewEntryId: 'entry-1',
    questionId,
    answer: 'YES',
  });

describe('ElementReviewEntry', () => {
  describe('reviewed', () => {
    // spec.md "Record an Element's Answers" (Phase 5) — the reviewed path
    // carries the recorded answers and leaves observations null.
    it('constructs a reviewed entry with observations === null', () => {
      const entry = ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [makeAnswer('question-1'), makeAnswer('question-2')],
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(entry.observations).toBeNull();
      expect(entry.answers).toHaveLength(2);
      expect(entry.answers.map((a) => a.questionId)).toEqual([
        'question-1',
        'question-2',
      ]);
    });
  });

  describe('unreviewed', () => {
    // spec.md "An Unreviewed Element Requires a Recorded Reason": "An
    // element is left unreviewed with a reason" — the response reports E as
    // unreviewed together with that reason.
    it('constructs an unreviewed entry carrying the given reason and no answers', () => {
      const entry = ElementReviewEntry.unreviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        observations: 'sealed room, no access',
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(entry.observations).toBe('sealed room, no access');
      expect(entry.answers).toEqual([]);
    });

    // spec.md "An empty or missing reason is rejected" — a request to leave
    // an element unreviewed without a reason MUST be rejected and MUST
    // persist nothing. The domain-layer backstop makes the empty-string
    // case unconstructible, not merely application-layer-guarded.
    it('throws MissingObservationsError for an empty reason', () => {
      expect(() =>
        ElementReviewEntry.unreviewed({
          id: 'entry-1',
          reviewSessionId: 'session-1',
          inspectableElementId: 'element-1',
          observations: '',
          recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ).toThrow(MissingObservationsError);
    });

    // Triangulation: a whitespace-only reason is exactly as invalid as an
    // empty one — the CHECK constraint's own `btrim(...) <> ''` phrasing
    // (design.md Decision 1) draws this same line.
    it('throws MissingObservationsError for a whitespace-only reason', () => {
      expect(() =>
        ElementReviewEntry.unreviewed({
          id: 'entry-1',
          reviewSessionId: 'session-1',
          inspectableElementId: 'element-1',
          observations: '   ',
          recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ).toThrow(MissingObservationsError);
    });
  });
});
