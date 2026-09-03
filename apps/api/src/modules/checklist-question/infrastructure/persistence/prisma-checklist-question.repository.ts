import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { ChecklistQuestionRepository } from '../../application/ports/checklist-question.repository.port';
import { ChecklistQuestion } from '../../domain/checklist-question.entity';
import { ReviewFrequency } from '../../domain/review-frequency';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import { ChecklistQuestionMapper } from './checklist-question.mapper';

// Mirrors PrismaInspectableElementRepository/PrismaMaintenanceCompanyRepository:
// updateById()'s `where` includes the deletedAt: null default filter, so a
// concurrent delete landing between UpdateChecklistQuestionUseCase's own
// findById check and this write makes Prisma's update() match zero rows and
// throw P2025 instead of silently writing onto an already-deleted row —
// mapped below to ChecklistQuestionNotFoundError, the same 404 the use
// case's own check would have thrown had it run a moment later.
const RECORD_NOT_FOUND = 'P2025';

// Prisma adapter for the ChecklistQuestionRepository port (ADR-013).
// Extends SoftDeletableRepository so the ADR-010 `deletedAt: null` default
// filter is enforced by construction. No transactional() (design.md
// Interfaces): this module has no multi-statement invariant a single-
// repository transaction could protect. Global pool, no parent scope
// (spec.md) — unlike InspectableElement this adapter has no community-
// scoped lookup.
@Injectable()
export class PrismaChecklistQuestionRepository
  extends SoftDeletableRepository
  implements ChecklistQuestionRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Plain insert — no uniqueness on any field (spec.md "Duplicate text is
  // allowed").
  async create(question: ChecklistQuestion): Promise<void> {
    await this.prisma.checklistQuestion.create({
      data: ChecklistQuestionMapper.toPersistence(question),
    });
  }

  // Default `deletedAt: null` filter (ADR-010) — unknown id and
  // soft-deleted id both resolve to null, one indistinguishable 404.
  async findById(id: string): Promise<ChecklistQuestion | null> {
    const record = await this.prisma.checklistQuestion.findFirst({
      where: this.withDefaultFilter({ id }),
    });

    return record ? ChecklistQuestionMapper.toDomain(record) : null;
  }

  // Soft-deleted questions excluded by default (ADR-010; spec.md "Soft-
  // deleted questions excluded"). Empty pool is a valid result (spec.md
  // "The Pool Ships Empty").
  async findAll(): Promise<ChecklistQuestion[]> {
    const records = await this.prisma.checklistQuestion.findMany({
      where: this.withDefaultFilter({}),
    });

    return records.map((record) => ChecklistQuestionMapper.toDomain(record));
  }

  // elementType is never part of `changes` (spec.md "Update Checklist
  // Question": "elementType is NOT updatable") — the use case's typed input
  // already excludes it, this adapter has no additional guard to apply.
  async updateById(
    id: string,
    changes: { text?: string; frequencies?: ReviewFrequency[] },
  ): Promise<void> {
    try {
      await this.prisma.checklistQuestion.update({
        where: this.withDefaultFilter({ id }),
        data: changes,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Sets deletedAt (ADR-010). Unlike CommunityRepository/
  // MaintenanceCompanyRepository, no cross-table NOT EXISTS guard — deletion
  // is NEVER blocked by references (spec.md "Soft-Delete Checklist Question
  // Is Never Blocked", design.md Decision 6). A plain updateMany against the
  // default-filtered `where` is therefore sufficient: the affected-row count
  // is the sole source of `wasDeleted`, mirroring
  // SoftDeleteCommunityUseCase's gating contract.
  async softDeleteById(id: string): Promise<boolean> {
    const result = await this.prisma.checklistQuestion.updateMany({
      where: this.withDefaultFilter({ id }),
      data: { deletedAt: new Date() },
    });

    return result.count > 0;
  }

  private mapMutationError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return new ChecklistQuestionNotFoundError();
    }
    return error;
  }
}
