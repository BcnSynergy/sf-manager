import { ChecklistQuestion } from '../../domain/checklist-question.entity';
import { ReviewFrequency } from '../../domain/review-frequency';

// Port (application layer, ADR-002/013): the `checklist-question`
// presentation/infrastructure layers (PR 4) depend on this interface, never
// on the Prisma adapter directly. See design.md Interfaces — the concrete
// adapter is PrismaChecklistQuestionRepository
// (infrastructure/persistence/prisma-checklist-question.repository.ts, PR
// 4), extending SoftDeletableRepository (ADR-010).
//
// Global pool, no parent scope (spec.md "Admin-only CRUD over the global
// ChecklistQuestion pool") — unlike InspectableElementRepository this port
// has no community-scoping method; findById/findAll operate over the whole
// pool.
export interface ChecklistQuestionRepository {
  // Plain insert — no uniqueness on any field (spec.md "Duplicate text is
  // allowed").
  create(question: ChecklistQuestion): Promise<void>;

  // Default deletedAt: null filter (ADR-010) — an unknown id and a
  // soft-deleted id both resolve to null, one indistinguishable 404.
  findById(id: string): Promise<ChecklistQuestion | null>;

  // Soft-deleted questions excluded by default (ADR-010; spec.md "Soft-
  // deleted questions excluded"). Empty pool is a valid result (spec.md
  // "The Pool Ships Empty").
  findAll(): Promise<ChecklistQuestion[]>;

  // elementType is NOT part of `changes` — immutable after creation
  // (spec.md "Update Checklist Question": "elementType is NOT updatable").
  updateById(
    id: string,
    changes: { text?: string; frequencies?: ReviewFrequency[] },
  ): Promise<void>;

  // Sets deletedAt (ADR-010). Returns whether the row was actually
  // transitioned (`wasDeleted`) so callers can gate a downstream effect on
  // an ACTUAL deletion having happened — mirrors
  // SoftDeleteCommunityUseCase's `wasDeleted === true` gate exactly. This
  // is the extension point Phase 7 wires a DraftSelectionCleaner call
  // into (design.md Decision 6) — deliberately NOT implemented here, this
  // PR only leaves the boolean return in place so that wiring is additive,
  // not a signature change.
  softDeleteById(id: string): Promise<boolean>;
}

export const CHECKLIST_QUESTION_REPOSITORY = Symbol(
  'CHECKLIST_QUESTION_REPOSITORY',
);
