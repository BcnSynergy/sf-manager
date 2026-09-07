import { ChecklistQuestionRepository } from '../../../../checklist-question/application/ports/checklist-question.repository.port';
import { InMemoryChecklistQuestionRepository } from '../../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplate } from '../../../domain/review-template.entity';
import { InMemoryReviewTemplateRepository } from './in-memory-review-template.repository';

function template(overrides: Partial<ReviewTemplate>): ReviewTemplate {
  return new ReviewTemplate({
    id: 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly checks',
    version: null,
    status: 'draft',
    draftQuestionIds: [],
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

// review-session/design.md Decision 7 (Phase 4, task 4.1): only `active`
// templates for the requested element type are eligible to back a new
// review session. Mirrors community/in-memory-community-technician
// .repository.spec.ts's findActiveByUser() triangulation shape.
describe('InMemoryReviewTemplateRepository — findActiveByElementType', () => {
  let questionPool: ChecklistQuestionRepository;
  let repository: InMemoryReviewTemplateRepository;

  beforeEach(() => {
    questionPool = new InMemoryChecklistQuestionRepository();
    repository = new InMemoryReviewTemplateRepository(questionPool);
  });

  it('returns only active templates for the requested element type', async () => {
    repository.seed(template({ id: 'active-1', status: 'active', version: 1 }));
    repository.seed(template({ id: 'draft-1', status: 'draft' }));
    repository.seed(
      template({ id: 'retired-1', status: 'retired', version: 1 }),
    );

    const result = await repository.findActiveByElementType('EXTINGUISHER');

    expect(result.map((t) => t.id)).toEqual(['active-1']);
  });

  it('returns one active row per (elementType, frequency) lineage', async () => {
    repository.seed(
      template({
        id: 'active-quarterly',
        status: 'active',
        version: 1,
        frequency: 'QUARTERLY',
      }),
    );
    repository.seed(
      template({
        id: 'active-annual',
        status: 'active',
        version: 1,
        frequency: 'ANNUAL',
      }),
    );

    const result = await repository.findActiveByElementType('EXTINGUISHER');

    expect(result.map((t) => t.id).sort()).toEqual([
      'active-annual',
      'active-quarterly',
    ]);
  });

  it('returns an empty list when no active template exists (triangulation)', async () => {
    repository.seed(template({ id: 'draft-1', status: 'draft' }));

    expect(await repository.findActiveByElementType('EXTINGUISHER')).toEqual(
      [],
    );
  });
});
