import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { InMemoryUserDirectory } from './testing/in-memory-user-directory';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ReadReviewHistoryUseCase } from './read-review-history.use-case';

function buildTemplate(
  overrides: Partial<{ id: string }> = {},
): ReviewTemplate {
  return new ReviewTemplate({
    id: overrides.id ?? 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Template',
    status: 'active',
    version: 1,
    draftQuestionIds: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  });
}

function buildElement(
  overrides: Partial<{
    id: string;
    communityId: string;
    code: string;
    deactivatedAt: Date | null;
  }> = {},
): InspectableElement {
  return new InspectableElement({
    id: overrides.id ?? 'element-1',
    communityId: overrides.communityId ?? 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extinguisher',
    description: null,
    location: 'Ground floor',
    installedAt: new Date('2026-01-01T00:00:00.000Z'),
    serialNumber: null,
    deletedAt: null,
    code: overrides.code ?? 'EXT-001',
    deactivatedAt: overrides.deactivatedAt ?? null,
  });
}

// review-history design.md Decision 6, tasks.md 4.3/4.4: loadCompletedForActor
// -> findFrozenWithSnapshot (frozen wording) -> findActiveByCommunityAndType
// (live elementCode, nullable). A decommissioned/soft-deleted element yields
// `elementCode: null` on its entry rather than dropping the entry.
describe('ReadReviewHistoryUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let companyScopeChecker: FakeCompanyScopeChecker;
  let accessService: ReviewHistoryAccessService;
  let questionRepository: InMemoryChecklistQuestionRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let elementRepository: InMemoryInspectableElementRepository;
  let userDirectory: InMemoryUserDirectory;
  let useCase: ReadReviewHistoryUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    accessService = new ReviewHistoryAccessService(
      sessionRepository,
      scopeChecker,
      companyScopeChecker,
    );
    questionRepository = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      questionRepository,
    );
    elementRepository = new InMemoryInspectableElementRepository();
    userDirectory = new InMemoryUserDirectory();
    useCase = new ReadReviewHistoryUseCase(
      accessService,
      templateRepository,
      elementRepository,
      userDirectory,
    );
  });

  it('a performer reads back their own completed session with entries, questions, element codes and their own email', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const element = buildElement();
    elementRepository.seed(element);
    userDirectory.seedEmail('user-1', 'user-1@example.com');
    const entry = ElementReviewEntry.reviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: element.id,
      answers: [
        new QuestionAnswer({
          id: 'answer-1',
          elementReviewEntryId: 'entry-1',
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.id).toBe('session-1');
    expect(result.performedByEmail).toBe('user-1@example.com');
    expect(result.questions).toEqual([
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      inspectableElementId: element.id,
      elementCode: element.code,
      reviewed: true,
    });
  });

  // tasks.md 3.15: unresolvable performedByEmail renders as '' at the
  // use-case boundary, not an error.
  it('an unresolvable performer renders performedByEmail as an empty string', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const element = buildElement();
    elementRepository.seed(element);
    // Deliberately no userDirectory.seedEmail() call.
    const entry = ElementReviewEntry.reviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: element.id,
      answers: [
        new QuestionAnswer({
          id: 'answer-1',
          elementReviewEntryId: 'entry-1',
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.performedByEmail).toBe('');
  });

  it('a decommissioned element yields elementCode: null rather than dropping the entry', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const decommissioned = buildElement({
      id: 'element-decommissioned',
      deactivatedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    elementRepository.seed(decommissioned);
    const entry = ElementReviewEntry.reviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: decommissioned.id,
      answers: [
        new QuestionAnswer({
          id: 'answer-1',
          elementReviewEntryId: 'entry-1',
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      inspectableElementId: decommissioned.id,
      elementCode: null,
    });
  });

  it('propagates ReviewSessionNotFoundError for an out-of-scope session', async () => {
    await expect(
      useCase.execute('nonexistent', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it('an unreviewed entry still carries answers as an empty array and its reason as observations', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const element = buildElement();
    elementRepository.seed(element);
    const entry = ElementReviewEntry.unreviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: element.id,
      observations: 'Element inaccessible',
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.entries[0]).toMatchObject({
      reviewed: false,
      observations: 'Element inaccessible',
      answers: [],
    });
  });
});
