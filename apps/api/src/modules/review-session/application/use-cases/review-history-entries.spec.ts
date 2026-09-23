import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { buildHistoryEntries } from './review-history-entries';

// design.md Decision 2: buildHistoryEntries is the one mapping shared by
// read-review-history (no answerOrder) and read-review-document
// (answerOrder from the frozen template). It maps entries in the order
// given — the caller decides ordering — and sorts each entry's own
// answers by answerOrder only when that argument is passed.
describe('buildHistoryEntries', () => {
  function buildReviewedEntry(
    id: string,
    elementId: string,
    answers: QuestionAnswer[],
    recordedAt = new Date('2026-01-02T00:00:00.000Z'),
  ): ElementReviewEntry {
    return ElementReviewEntry.reviewed({
      id,
      reviewSessionId: 'session-1',
      inspectableElementId: elementId,
      answers,
      recordedAt,
    });
  }

  it('maps entries in the order given, not resorted by the helper', () => {
    const entryA = buildReviewedEntry('entry-a', 'element-a', [
      new QuestionAnswer({
        id: 'answer-a',
        elementReviewEntryId: 'entry-a',
        questionId: 'question-1',
        answer: 'YES',
      }),
    ]);
    const entryB = buildReviewedEntry('entry-b', 'element-b', [
      new QuestionAnswer({
        id: 'answer-b',
        elementReviewEntryId: 'entry-b',
        questionId: 'question-1',
        answer: 'NO',
      }),
    ]);
    const codeByElementId = new Map([
      ['element-a', 'EXT-001'],
      ['element-b', 'EXT-002'],
    ]);

    const result = buildHistoryEntries([entryB, entryA], codeByElementId);

    expect(result.map((entry) => entry.inspectableElementId)).toEqual([
      'element-b',
      'element-a',
    ]);
  });

  it('resolves elementCode from the map, null when the element has no row', () => {
    const entry = buildReviewedEntry('entry-1', 'element-unresolved', [
      new QuestionAnswer({
        id: 'answer-1',
        elementReviewEntryId: 'entry-1',
        questionId: 'question-1',
        answer: 'YES',
      }),
    ]);

    const result = buildHistoryEntries([entry], new Map());

    expect(result[0]).toMatchObject({
      inspectableElementId: 'element-unresolved',
      elementCode: null,
    });
  });

  it('leaves answers in their given order when answerOrder is not passed', () => {
    const entry = buildReviewedEntry('entry-1', 'element-1', [
      new QuestionAnswer({
        id: 'answer-2',
        elementReviewEntryId: 'entry-1',
        questionId: 'question-2',
        answer: 'NO',
      }),
      new QuestionAnswer({
        id: 'answer-1',
        elementReviewEntryId: 'entry-1',
        questionId: 'question-1',
        answer: 'YES',
      }),
    ]);

    const result = buildHistoryEntries(
      [entry],
      new Map([['element-1', 'EXT-001']]),
    );

    expect(result[0].answers.map((answer) => answer.questionId)).toEqual([
      'question-2',
      'question-1',
    ]);
  });

  it("sorts each entry's answers by answerOrder when it is passed", () => {
    const entry = buildReviewedEntry('entry-1', 'element-1', [
      new QuestionAnswer({
        id: 'answer-2',
        elementReviewEntryId: 'entry-1',
        questionId: 'question-2',
        answer: 'NO',
      }),
      new QuestionAnswer({
        id: 'answer-1',
        elementReviewEntryId: 'entry-1',
        questionId: 'question-1',
        answer: 'YES',
      }),
    ]);
    const answerOrder = new Map([
      ['question-1', 1],
      ['question-2', 2],
    ]);

    const result = buildHistoryEntries(
      [entry],
      new Map([['element-1', 'EXT-001']]),
      answerOrder,
    );

    expect(result[0].answers.map((answer) => answer.questionId)).toEqual([
      'question-1',
      'question-2',
    ]);
  });

  it('maps reviewed and unreviewed flags, observations and recordedAt unchanged', () => {
    const recordedAt = new Date('2026-01-03T00:00:00.000Z');
    const unreviewed = ElementReviewEntry.unreviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      observations: 'Inaccessible',
      recordedAt,
    });

    const result = buildHistoryEntries([unreviewed], new Map());

    expect(result[0]).toMatchObject({
      reviewed: false,
      observations: 'Inaccessible',
      answers: [],
      recordedAt,
    });
  });
});
