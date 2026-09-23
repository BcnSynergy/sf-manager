import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import type { ReviewDocumentElementIdentity } from '../ports/review-document-name-directory.port';
import { compareDocumentEntries } from './review-document-entry-order';

// spec.md "Entries and answers are returned in a deterministic order":
// element code ascending, code-less entries last, ties (including among
// code-less entries) broken by recordedAt then entry id.
describe('compareDocumentEntries', () => {
  function buildEntry(
    id: string,
    elementId: string,
    recordedAt = new Date('2026-01-02T00:00:00.000Z'),
  ): ElementReviewEntry {
    return ElementReviewEntry.reviewed({
      id,
      reviewSessionId: 'session-1',
      inspectableElementId: elementId,
      answers: [
        new QuestionAnswer({
          id: `answer-${id}`,
          elementReviewEntryId: id,
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt,
    });
  }

  function identity(code: string): ReviewDocumentElementIdentity {
    return { code, name: 'Name', location: 'Location' };
  }

  it('orders entries by element code ascending', () => {
    const entryZ = buildEntry('entry-z', 'element-z');
    const entryA = buildEntry('entry-a', 'element-a');
    const elements = new Map([
      ['element-z', identity('EXT-002')],
      ['element-a', identity('EXT-001')],
    ]);

    const result = [entryZ, entryA].sort(compareDocumentEntries(elements));

    expect(result.map((entry) => entry.id)).toEqual(['entry-a', 'entry-z']);
  });

  it('sorts code-less entries (no matching row) after every coded entry', () => {
    const coded = buildEntry('entry-coded', 'element-coded');
    const codeless = buildEntry('entry-codeless', 'element-missing');
    const elements = new Map([['element-coded', identity('EXT-001')]]);

    const result = [codeless, coded].sort(compareDocumentEntries(elements));

    expect(result.map((entry) => entry.id)).toEqual([
      'entry-coded',
      'entry-codeless',
    ]);
  });

  it('breaks a same-code tie by recordedAt ascending', () => {
    const later = buildEntry(
      'entry-later',
      'element-a',
      new Date('2026-01-02T00:02:00.000Z'),
    );
    const earlier = buildEntry(
      'entry-earlier',
      'element-a',
      new Date('2026-01-02T00:01:00.000Z'),
    );
    const elements = new Map([['element-a', identity('EXT-001')]]);

    const result = [later, earlier].sort(compareDocumentEntries(elements));

    expect(result.map((entry) => entry.id)).toEqual([
      'entry-earlier',
      'entry-later',
    ]);
  });

  it('breaks a same-code, same-recordedAt tie by entry id ascending', () => {
    const recordedAt = new Date('2026-01-02T00:00:00.000Z');
    const entryB = buildEntry('entry-b', 'element-a', recordedAt);
    const entryA = buildEntry('entry-a', 'element-a', recordedAt);
    const elements = new Map([['element-a', identity('EXT-001')]]);

    const result = [entryB, entryA].sort(compareDocumentEntries(elements));

    expect(result.map((entry) => entry.id)).toEqual(['entry-a', 'entry-b']);
  });

  it('breaks a tie among code-less entries by recordedAt then id', () => {
    const recordedAt = new Date('2026-01-02T00:00:00.000Z');
    const later = buildEntry(
      'entry-later',
      'element-missing-1',
      new Date('2026-01-02T00:05:00.000Z'),
    );
    const earlierB = buildEntry(
      'entry-earlier-b',
      'element-missing-2',
      recordedAt,
    );
    const earlierA = buildEntry(
      'entry-earlier-a',
      'element-missing-3',
      recordedAt,
    );
    const elements = new Map<string, ReviewDocumentElementIdentity>();

    const result = [later, earlierB, earlierA].sort(
      compareDocumentEntries(elements),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      'entry-earlier-a',
      'entry-earlier-b',
      'entry-later',
    ]);
  });
});
