import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ReviewSession } from '../../domain/review-session.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { SessionAccessService } from '../services/session-access.service';
import { ResolveElementByCodeUseCase } from './resolve-element-by-code.use-case';

function draftSession(): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: 'draft',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
  });
}

function frozenTemplate(): ReviewTemplate {
  return new ReviewTemplate({
    id: 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly checks',
    version: 1,
    status: 'active',
    draftQuestionIds: [],
    createdAt: new Date(),
    deletedAt: null,
  });
}

function element(
  overrides: Partial<InspectableElement> = {},
): InspectableElement {
  return new InspectableElement({
    id: 'element-1',
    communityId: 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extinguisher #1',
    description: null,
    location: 'Lobby',
    installedAt: new Date('2026-01-15'),
    serialNumber: null,
    deletedAt: null,
    code: 'X1',
    deactivatedAt: null,
    ...overrides,
  });
}

// spec.md "Resolve an Element by Code Within the Session's Scope" +
// "Rejected Codes Are Indistinguishable". design.md Decision 6: the ONE
// by-code method's collapsing WHERE means the use case cannot tell WHY a
// code failed to resolve, so it always throws the same
// InspectableElementNotFoundError.
describe('ResolveElementByCodeUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let elementRepository: InMemoryInspectableElementRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let useCase: ResolveElementByCodeUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    elementRepository = new InMemoryInspectableElementRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    useCase = new ResolveElementByCodeUseCase(
      sessionAccess,
      elementRepository,
      templateRepository,
    );
  });

  const actor = { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' as const };

  it('resolves a valid in-scope code and presents the frozen questions', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    elementRepository.seed(element());

    const result = await useCase.execute('session-1', 'X1', actor);

    expect(result.element.id).toBe('element-1');
    expect(result.questions).toEqual([
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    expect(result.entry).toBeNull();
  });

  it('rejects an unknown code with InspectableElementNotFoundError', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());

    await expect(
      useCase.execute('session-1', 'UNKNOWN', actor),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('rejects a foreign-community code with the SAME error as an unknown code', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element({ communityId: 'community-2' }));

    await expect(useCase.execute('session-1', 'X1', actor)).rejects.toThrow(
      InspectableElementNotFoundError,
    );
  });

  // "Wrong element type" (spec.md scenario) is not unit-constructible in
  // this slice — `ElementType` currently declares only `EXTINGUISHER`
  // (inspectable-element/design.md Decision 1: "only one value in v1"), so
  // no second value exists to build a cross-type fixture with. The query
  // predicate collapsing this case is identical to the community/status
  // predicates covered above; Phase 6's E2E suite is the right place to
  // revisit this once/if a second element type ships.

  it('rejects a decommissioned element code with the SAME error', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element({ deactivatedAt: new Date() }));

    await expect(useCase.execute('session-1', 'X1', actor)).rejects.toThrow(
      InspectableElementNotFoundError,
    );
  });

  it('rejects a soft-deleted element code with the SAME error', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element({ deletedAt: new Date() }));

    await expect(useCase.execute('session-1', 'X1', actor)).rejects.toThrow(
      InspectableElementNotFoundError,
    );
  });

  it('returns the previously recorded entry when the element was already reviewed', async () => {
    const session = draftSession();
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    elementRepository.seed(element());

    session.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    sessionRepository.seed(session);

    const result = await useCase.execute('session-1', 'X1', actor);

    expect(result.entry).not.toBeNull();
    expect(result.entry?.reviewed).toBe(true);
  });

  it('rejects with ReviewSessionNotFoundError when the session is out of the actor scope', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element());
    // Deliberately no scopeChecker.assign() call.

    await expect(useCase.execute('session-1', 'X1', actor)).rejects.toThrow(
      ReviewSessionNotFoundError,
    );
  });
});
