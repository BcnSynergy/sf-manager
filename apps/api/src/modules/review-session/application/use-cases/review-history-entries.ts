import type { AnswerValue } from '../../domain/answer-value';
import type { ElementReviewEntry } from '../../domain/element-review-entry.entity';

// design.md Decision 2: the one mapping shared by read-review-history (no
// answerOrder — history order is untouched) and read-review-document
// (its own sorted copy of entries, plus answerOrder from the frozen
// template). Moved out of read-review-history.use-case.ts unchanged so
// both call sites share exactly one implementation.
export interface ReadReviewHistoryEntry {
  inspectableElementId: string;
  elementCode: string | null;
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: AnswerValue }>;
  recordedAt: Date;
}

// Maps `entries` in the order given — this function never sorts or
// mutates the entries array itself; the caller decides entry order
// (design.md "Entry enrichment and order"). Each entry's own `answers`
// are mapped in their given order and re-sorted by `answerOrder` only
// when that argument is passed; the history call site omits it, so its
// output stays byte-identical.
export function buildHistoryEntries(
  entries: readonly ElementReviewEntry[],
  codeByElementId: ReadonlyMap<string, string>,
  answerOrder?: ReadonlyMap<string, number>,
): ReadReviewHistoryEntry[] {
  return entries.map((entry) => {
    const answers = entry.answers.map((answer) => ({
      questionId: answer.questionId,
      answer: answer.answer,
    }));

    if (answerOrder) {
      // An answer whose question is missing from answerOrder sorts LAST
      // (design.md "Entry enrichment and order") — it is not part of the
      // frozen template's active question set, so `?? 0` would otherwise
      // sort it to the front, ahead of every ordered answer.
      answers.sort(
        (a, b) =>
          (answerOrder.get(a.questionId) ?? Number.MAX_SAFE_INTEGER) -
          (answerOrder.get(b.questionId) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    return {
      inspectableElementId: entry.inspectableElementId,
      elementCode: codeByElementId.get(entry.inspectableElementId) ?? null,
      reviewed: entry.answers.length > 0,
      observations: entry.observations,
      answers,
      recordedAt: entry.recordedAt,
    };
  });
}
