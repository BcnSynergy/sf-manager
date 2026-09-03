import { Prisma, ReviewTemplate as PrismaReviewTemplate } from '@prisma/client';
import { ReviewTemplate } from '../../domain/review-template.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityRepresentativeMapper /
// ChecklistQuestionMapper. Direct assignment (no cast, no switch) for
// `elementType`/`frequency`/`status` is one of design.md Decision 1's
// compile-time gates on the three-way seams: structural assignability
// already fails the build in BOTH directions if a value is ever added to
// one side and not the other.
export class ReviewTemplateMapper {
  static toDomain(record: PrismaReviewTemplate): ReviewTemplate {
    return new ReviewTemplate({
      id: record.id,
      elementType: record.elementType,
      frequency: record.frequency,
      name: record.name,
      version: record.version,
      status: record.status,
      draftQuestionIds: record.draftQuestionIds,
      createdAt: record.createdAt,
      deletedAt: record.deletedAt,
    });
  }

  static toPersistence(
    template: ReviewTemplate,
  ): Prisma.ReviewTemplateCreateInput {
    return {
      id: template.id,
      elementType: template.elementType,
      frequency: template.frequency,
      name: template.name,
      version: template.version,
      status: template.status,
      draftQuestionIds: template.draftQuestionIds,
      createdAt: template.createdAt,
      deletedAt: template.deletedAt,
    };
  }
}
