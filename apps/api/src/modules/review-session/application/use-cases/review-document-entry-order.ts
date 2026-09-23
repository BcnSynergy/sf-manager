import type { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import type { ReviewDocumentElementIdentity } from '../ports/review-document-name-directory.port';

// design.md "Entry enrichment and order" / spec.md "Entries and answers
// are returned in a deterministic order": entries are ordered by element
// code ascending (ordinal — plain string comparison, no locale collation),
// with code-less entries (no matching row in `elements`) sorted last;
// ties — including among code-less entries — are broken by `recordedAt`,
// then by the entry's own `id`. Operates on the RAW domain entries, not
// the mapped `ReadReviewHistoryEntry` shape, because `id` is not part of
// that mapped output (review-history-entries.ts).
export function compareDocumentEntries(
  elements: ReadonlyMap<string, ReviewDocumentElementIdentity>,
): (a: ElementReviewEntry, b: ElementReviewEntry) => number {
  return (a, b) => {
    const codeA = elements.get(a.inspectableElementId)?.code ?? null;
    const codeB = elements.get(b.inspectableElementId)?.code ?? null;

    if (codeA !== codeB) {
      if (codeA === null) return 1;
      if (codeB === null) return -1;
      return codeA < codeB ? -1 : 1;
    }

    const recordedAtDiff = a.recordedAt.getTime() - b.recordedAt.getTime();
    if (recordedAtDiff !== 0) {
      return recordedAtDiff;
    }

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
