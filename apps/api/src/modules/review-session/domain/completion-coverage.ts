// design.md Decision 2: "an unreviewed element is a stored entry, and
// completion requires total entry coverage." Pure function, no I/O — the
// caller (CompleteReviewSessionUseCase, Phase 6) is responsible for
// resolving `activeElements` to only the currently active, non-soft-deleted
// elements of the session's community and element type (spec.md
// "Decommissioned and soft-deleted elements do not block completion" — an
// element that dropped out of the active set mid-walk simply never appears
// here). Coverage is of ENTRIES, not answers: any entry — reviewed or
// unreviewed — counts, so an element covered only by `observations` is
// treated identically to a fully-answered one.
export function computeUncoveredElements<
  TElement extends { id: string },
  TEntry extends { inspectableElementId: string },
>(activeElements: TElement[], entries: TEntry[]): TElement[] {
  const coveredElementIds = new Set(
    entries.map((entry) => entry.inspectableElementId),
  );

  return activeElements.filter(
    (element) => !coveredElementIds.has(element.id),
  );
}
