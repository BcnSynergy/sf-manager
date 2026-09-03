import { ChecklistQuestionRepository } from '../../../../checklist-question/application/ports/checklist-question.repository.port';
import { ReviewTemplateEmptyError } from '../../../domain/errors/review-template-empty.error';
import { ReviewTemplate } from '../../../domain/review-template.entity';
import {
  ActivationOutcome,
  ReviewTemplateRepository,
  TemplateQuestionEntry,
  TemplateWithQuestions,
} from '../../ports/review-template.repository.port';

// Test double for ReviewTemplateRepository (design.md Testing Strategy:
// in-memory fakes for use-case unit specs, mirroring
// InMemoryChecklistQuestionRepository). Shared across the review-template
// use-case unit specs (tasks.md 8.2-8.6).
//
// Reproduces BOTH read paths from design.md Decision 5:
// - findDraftWithLiveQuestions resolves text through the injected pool
//   fake, so a caller can assert the pool IS consulted for drafts.
// - findFrozenWithSnapshot reads ONLY the internally stored snapshot rows
//   and NEVER touches the pool — this is what lets a unit test assert the
//   pool port's findById is never invoked when reading a frozen template
//   (spec.md "Drafts Track the Live Pool").
//
// Also reproduces the version/gap numbering rule (design.md Decision 3):
// version is assigned only inside activate(), per lineage, starting at 1
// and never consumed by a discarded draft.
export class InMemoryReviewTemplateRepository implements ReviewTemplateRepository {
  private readonly templatesById = new Map<string, ReviewTemplate>();
  private readonly snapshotsByTemplateId = new Map<
    string,
    TemplateQuestionEntry[]
  >();

  constructor(private readonly questionPool: ChecklistQuestionRepository) {}

  seed(template: ReviewTemplate, snapshot?: TemplateQuestionEntry[]): void {
    this.templatesById.set(template.id, template);
    if (snapshot) {
      this.snapshotsByTemplateId.set(template.id, snapshot);
    }
  }

  create(template: ReviewTemplate): Promise<void> {
    this.templatesById.set(template.id, template);
    return Promise.resolve();
  }

  findById(id: string): Promise<ReviewTemplate | null> {
    const template = this.templatesById.get(id);
    if (!template || template.deletedAt) {
      return Promise.resolve(null);
    }
    return Promise.resolve(template);
  }

  findAll(): Promise<ReviewTemplate[]> {
    return Promise.resolve(
      [...this.templatesById.values()].filter(
        (template) => !template.deletedAt,
      ),
    );
  }

  async findDraftWithLiveQuestions(
    id: string,
  ): Promise<TemplateWithQuestions | null> {
    const template = this.templatesById.get(id);
    if (!template || template.deletedAt || template.status !== 'draft') {
      return null;
    }

    const questions: TemplateQuestionEntry[] = [];
    for (let index = 0; index < template.draftQuestionIds.length; index += 1) {
      // Decision 5 — draft path resolves LIVE text through the pool; a
      // concurrently soft-deleted question is silently dropped (ADR-010).
      const question = await this.questionPool.findById(
        template.draftQuestionIds[index],
      );
      if (!question) {
        continue;
      }
      questions.push({
        questionId: question.id,
        order: index + 1,
        text: question.text,
      });
    }

    return this.toTemplateWithQuestions(template, questions);
  }

  findFrozenWithSnapshot(id: string): Promise<TemplateWithQuestions | null> {
    const template = this.templatesById.get(id);
    if (!template || template.status === 'draft') {
      return Promise.resolve(null);
    }

    // Decision 5 — frozen path reads ONLY the persisted snapshot. This
    // method never calls `this.questionPool` — that is the guarantee under
    // test.
    const snapshot = this.snapshotsByTemplateId.get(id) ?? [];
    return Promise.resolve(this.toTemplateWithQuestions(template, snapshot));
  }

  replaceDraftQuestions(id: string, questionIds: string[]): Promise<boolean> {
    const template = this.templatesById.get(id);
    if (!template) {
      return Promise.resolve(false);
    }
    this.templatesById.set(
      id,
      new ReviewTemplate({ ...template, draftQuestionIds: [...questionIds] }),
    );
    return Promise.resolve(true);
  }

  async activate(id: string, rowIds: string[]): Promise<ActivationOutcome> {
    const template = this.templatesById.get(id);
    if (!template) {
      throw new ReviewTemplateEmptyError();
    }

    const snapshot: TemplateQuestionEntry[] = [];
    for (let index = 0; index < template.draftQuestionIds.length; index += 1) {
      const question = await this.questionPool.findById(
        template.draftQuestionIds[index],
      );
      if (!question) {
        continue;
      }
      snapshot.push({
        questionId: question.id,
        order: index + 1,
        text: question.text,
      });
    }

    if (snapshot.length === 0) {
      throw new ReviewTemplateEmptyError();
    }

    // Version/gap rule (design.md Decision 3): assigned only here, per
    // lineage, COALESCE(MAX(version),0)+1 — a discarded draft never
    // consumed one.
    const lineageVersions = [...this.templatesById.values()]
      .filter(
        (existing) =>
          existing.elementType === template.elementType &&
          existing.frequency === template.frequency &&
          existing.version !== null,
      )
      .map((existing) => existing.version as number);
    const version =
      (lineageVersions.length > 0 ? Math.max(...lineageVersions) : 0) + 1;

    // Retire predecessor before flipping this row to active (statement
    // order load-bearing per design.md Decision 3).
    for (const [otherId, other] of this.templatesById) {
      if (
        otherId !== id &&
        other.elementType === template.elementType &&
        other.frequency === template.frequency &&
        other.status === 'active'
      ) {
        this.templatesById.set(
          otherId,
          new ReviewTemplate({ ...other, status: 'retired' }),
        );
      }
    }

    const activated = new ReviewTemplate({
      ...template,
      status: 'active',
      version,
      draftQuestionIds: [],
    });
    this.templatesById.set(id, activated);
    this.snapshotsByTemplateId.set(id, snapshot);
    void rowIds; // app-generated row ids are opaque to this fake

    return { id: activated.id, status: activated.status, version };
  }

  softDeleteDraftById(id: string): Promise<boolean> {
    const template = this.templatesById.get(id);
    if (!template || template.deletedAt || template.status !== 'draft') {
      return Promise.resolve(false);
    }
    this.templatesById.set(
      id,
      new ReviewTemplate({ ...template, deletedAt: new Date() }),
    );
    return Promise.resolve(true);
  }

  private toTemplateWithQuestions(
    template: ReviewTemplate,
    questions: TemplateQuestionEntry[],
  ): TemplateWithQuestions {
    return {
      id: template.id,
      elementType: template.elementType,
      frequency: template.frequency,
      name: template.name,
      version: template.version,
      status: template.status,
      createdAt: template.createdAt,
      deletedAt: template.deletedAt,
      questions,
    };
  }
}
