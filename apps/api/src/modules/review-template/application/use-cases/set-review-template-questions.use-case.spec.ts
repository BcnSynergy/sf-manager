import { ChecklistQuestion } from '../../../checklist-question/domain/checklist-question.entity';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ChecklistQuestionNotFoundError } from '../../../checklist-question/domain/errors/checklist-question-not-found.error';
import { ReviewTemplateNotEditableError } from '../../domain/errors/review-template-not-editable.error';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { SetReviewTemplateQuestionsUseCase } from './set-review-template-questions.use-case';
import { InMemoryReviewTemplateRepository } from './testing/in-memory-review-template.repository';

function draftTemplate(
  overrides: Partial<ReviewTemplate> = {},
): ReviewTemplate {
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

function question(
  id: string,
  overrides: Partial<ChecklistQuestion> = {},
): ChecklistQuestion {
  return new ChecklistQuestion({
    id,
    elementType: 'EXTINGUISHER',
    frequencies: ['QUARTERLY'],
    text: `Question ${id}`,
    deletedAt: null,
    ...overrides,
  });
}

// spec.md "Replace a Draft's Ordered Question Selection": full replace, not
// merge; the submitted order is preserved; unknown/soft-deleted ids reject
// with 404; a frozen template rejects with 409; cross-frequency selection
// is explicitly ALLOWED (no guard against it, per design.md open question
// resolution).
describe('SetReviewTemplateQuestionsUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let questionPool: InMemoryChecklistQuestionRepository;
  let useCase: SetReviewTemplateQuestionsUseCase;

  beforeEach(() => {
    questionPool = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(questionPool);
    useCase = new SetReviewTemplateQuestionsUseCase(
      templateRepository,
      questionPool,
    );
  });

  it('replaces the whole selection, preserving submitted order', async () => {
    templateRepository.seed(draftTemplate());
    questionPool.seed(question('q1'));
    questionPool.seed(question('q2'));

    await useCase.execute({
      templateId: 'template-1',
      questionIds: ['q2', 'q1'],
    });

    const stored = await templateRepository.findById('template-1');
    expect(stored?.draftQuestionIds).toEqual(['q2', 'q1']);
  });

  it('is a full replace, not a merge — a later submission drops ids omitted from it', async () => {
    templateRepository.seed(
      draftTemplate({ draftQuestionIds: ['q1', 'q2', 'q3'] }),
    );
    questionPool.seed(question('q2'));

    await useCase.execute({ templateId: 'template-1', questionIds: ['q2'] });

    const stored = await templateRepository.findById('template-1');
    expect(stored?.draftQuestionIds).toEqual(['q2']);
  });

  it('allows a cross-frequency question with no guard against it', async () => {
    templateRepository.seed(
      draftTemplate({ id: 'template-annual', frequency: 'ANNUAL' }),
    );
    questionPool.seed(question('q1', { frequencies: ['QUARTERLY'] }));

    await useCase.execute({
      templateId: 'template-annual',
      questionIds: ['q1'],
    });

    const stored = await templateRepository.findById('template-annual');
    expect(stored?.draftQuestionIds).toEqual(['q1']);
  });

  it('rejects an unknown question id with 404, leaving the selection unchanged', async () => {
    templateRepository.seed(draftTemplate({ draftQuestionIds: ['q1'] }));
    questionPool.seed(question('q1'));

    await expect(
      useCase.execute({
        templateId: 'template-1',
        questionIds: ['does-not-exist'],
      }),
    ).rejects.toThrow(ChecklistQuestionNotFoundError);

    const stored = await templateRepository.findById('template-1');
    expect(stored?.draftQuestionIds).toEqual(['q1']);
  });

  it('rejects a soft-deleted question id with 404', async () => {
    templateRepository.seed(draftTemplate());
    questionPool.seed(question('q1', { deletedAt: new Date() }));

    await expect(
      useCase.execute({ templateId: 'template-1', questionIds: ['q1'] }),
    ).rejects.toThrow(ChecklistQuestionNotFoundError);
  });

  it('rejects setting questions on an active template with 409', async () => {
    templateRepository.seed(draftTemplate({ status: 'active', version: 1 }));
    questionPool.seed(question('q1'));

    await expect(
      useCase.execute({ templateId: 'template-1', questionIds: ['q1'] }),
    ).rejects.toThrow(ReviewTemplateNotEditableError);
  });

  it('rejects setting questions on a retired template with 409', async () => {
    templateRepository.seed(draftTemplate({ status: 'retired', version: 1 }));
    questionPool.seed(question('q1'));

    await expect(
      useCase.execute({ templateId: 'template-1', questionIds: ['q1'] }),
    ).rejects.toThrow(ReviewTemplateNotEditableError);
  });

  it('rejects an unknown template id with 404', async () => {
    await expect(
      useCase.execute({ templateId: 'missing', questionIds: [] }),
    ).rejects.toThrow(ReviewTemplateNotFoundError);
  });
});
