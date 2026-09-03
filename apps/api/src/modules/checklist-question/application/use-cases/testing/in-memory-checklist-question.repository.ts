import { ChecklistQuestion } from '../../../domain/checklist-question.entity';
import { ReviewFrequency } from '../../../domain/review-frequency';
import { ChecklistQuestionRepository } from '../../ports/checklist-question.repository.port';

// Test double for ChecklistQuestionRepository (design.md Testing Strategy:
// in-memory fakes for use-case unit specs, mirroring
// InMemoryInspectableElementRepository). Shared across the four use-case
// unit specs (tasks.md 3.2-3.5).
//
// Global pool, no parent scope — findById/findAll operate over the whole
// map, filtered only by ADR-010's deletedAt IS NULL rule where the port
// requires it.
export class InMemoryChecklistQuestionRepository implements ChecklistQuestionRepository {
  private readonly questionsById = new Map<string, ChecklistQuestion>();

  seed(question: ChecklistQuestion): void {
    this.questionsById.set(question.id, question);
  }

  create(question: ChecklistQuestion): Promise<void> {
    this.questionsById.set(question.id, question);
    return Promise.resolve();
  }

  findById(id: string): Promise<ChecklistQuestion | null> {
    const question = this.questionsById.get(id);
    if (!question || question.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(question);
  }

  findAll(): Promise<ChecklistQuestion[]> {
    // Soft-deleted questions excluded (ADR-010), same filter parity as
    // every other in-memory fake's findAll.
    return Promise.resolve(
      [...this.questionsById.values()].filter(
        (question) => !question.isDeleted,
      ),
    );
  }

  updateById(
    id: string,
    changes: { text?: string; frequencies?: ReviewFrequency[] },
  ): Promise<void> {
    const existing = this.questionsById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.questionsById.set(
      id,
      new ChecklistQuestion({
        ...existing,
        text: changes.text ?? existing.text,
        frequencies: changes.frequencies ?? existing.frequencies,
      }),
    );
    return Promise.resolve();
  }

  softDeleteById(id: string): Promise<boolean> {
    const existing = this.questionsById.get(id);
    if (!existing || existing.isDeleted) {
      return Promise.resolve(false);
    }
    this.questionsById.set(
      id,
      new ChecklistQuestion({ ...existing, deletedAt: new Date() }),
    );
    return Promise.resolve(true);
  }
}
