import { computeUncoveredElements } from './completion-coverage';

// design.md Decision 2: "an unreviewed element is a stored entry, and
// completion requires total entry coverage" — the required set is
// "elements that are deletedAt IS NULL AND deactivatedAt IS NULL in the
// session's community with the session's elementType", minus the elements
// that already have an entry (any entry — reviewed OR unreviewed both
// count as coverage; only presence matters, per Decision 2's "coverage of
// ENTRIES" reading). Pure function, no I/O — this is what
// CompleteReviewSessionUseCase (Phase 6) calls; the caller is responsible
// for having already filtered the candidate list to active,
// non-soft-deleted elements (spec.md "Decommissioned and soft-deleted
// elements do not block completion").
describe('computeUncoveredElements', () => {
  // spec.md "An unexplained gap blocks completion": an active element with
  // no entry at all must be reported as uncovered.
  it('reports an active element with no entry as uncovered', () => {
    const activeElements = [{ id: 'element-1', code: 'CODE0000A1' }];
    const entries: Array<{ inspectableElementId: string }> = [];

    const result = computeUncoveredElements(activeElements, entries);

    expect(result).toEqual([{ id: 'element-1', code: 'CODE0000A1' }]);
  });

  // spec.md "Decommissioned and soft-deleted elements do not block
  // completion": an element that has since dropped out of the active set
  // (the caller passes only currently-active elements) is not required —
  // proven here by simply never appearing in `activeElements`.
  it('does not require an element that is no longer in the active set (decommissioned mid-walk)', () => {
    const activeElements: Array<{ id: string; code: string }> = [];
    const entries: Array<{ inspectableElementId: string }> = [];

    const result = computeUncoveredElements(activeElements, entries);

    expect(result).toEqual([]);
  });

  // design.md Decision 2: coverage is of ENTRIES, not answers — an entry
  // with only `observations` (an unreviewed element with a reason) counts
  // as covering the element, exactly like a fully-answered one.
  it('accepts an element covered only by an unreviewed entry (observations, no answers)', () => {
    const activeElements = [{ id: 'element-1', code: 'CODE0000A1' }];
    const entries = [{ inspectableElementId: 'element-1' }];

    const result = computeUncoveredElements(activeElements, entries);

    expect(result).toEqual([]);
  });

  // spec.md "A partial session with explained gaps completes" /
  // "A fully reviewed session completes": mixed coverage — some active
  // elements have entries, one does not.
  it('reports only the elements that remain without any entry', () => {
    const activeElements = [
      { id: 'element-1', code: 'CODE0000A1' },
      { id: 'element-2', code: 'CODE0000A2' },
      { id: 'element-3', code: 'CODE0000A3' },
    ];
    const entries = [
      { inspectableElementId: 'element-1' },
      { inspectableElementId: 'element-3' },
    ];

    const result = computeUncoveredElements(activeElements, entries);

    expect(result).toEqual([{ id: 'element-2', code: 'CODE0000A2' }]);
  });
});
