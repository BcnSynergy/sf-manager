import {
  ChecklistQuestion as PrismaChecklistQuestion,
  Prisma,
} from '@prisma/client';
import { ChecklistQuestion } from '../../domain/checklist-question.entity';

// design.md Decision 1: the mapper's direct assignment (no cast, no switch)
// for `elementType` and `frequencies` is one of the compile-time gates
// closing the `ElementType`/`ReviewFrequency` three-way seams — mirrors
// InspectableElementMapper verbatim. Structural assignability already fails
// the build in BOTH directions if a value is ever added to one side and not
// the other; an exhaustive switch would add a hand-maintained arm per value
// for no benefit.
export class ChecklistQuestionMapper {
  static toDomain(record: PrismaChecklistQuestion): ChecklistQuestion {
    return new ChecklistQuestion({
      id: record.id,
      elementType: record.elementType,
      frequencies: record.frequencies,
      text: record.text,
      deletedAt: record.deletedAt,
    });
  }

  static toPersistence(
    question: ChecklistQuestion,
  ): Prisma.ChecklistQuestionCreateInput {
    return {
      id: question.id,
      elementType: question.elementType,
      frequencies: question.frequencies,
      text: question.text,
      deletedAt: question.deletedAt,
    };
  }
}
