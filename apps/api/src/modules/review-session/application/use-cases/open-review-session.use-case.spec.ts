import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { Community } from '../../../community/domain/community.entity';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import { CommunityNotInScopeError } from '../../domain/errors/community-not-in-scope.error';
import { OpenDraftAlreadyExistsError } from '../../domain/errors/open-draft-already-exists.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { OpenReviewSessionUseCase } from './open-review-session.use-case';

function activeTemplate(overrides: Partial<ReviewTemplate> = {}): ReviewTemplate {
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
    ...overrides,
  });
}

function community(overrides: Partial<Community> = {}): Community {
  return new Community({
    id: 'community-1',
    name: 'Building A',
    address: '123 Main St',
    locale: 'en',
    deletedAt: null,
    ...overrides,
  });
}

// spec.md "Open a Review Session Against a Community and a Specific
// Template" + "At Most One Open Draft Per Community, Template and User".
// design.md Decision 4 (corrected 2026-09-07, BINDING): the community
// existence/soft-delete check MUST run before isAssignedTo and MUST
// collapse to the same CommunityNotInScopeError as an unassigned actor.
describe('OpenReviewSessionUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let communityRepository: InMemoryCommunityRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: OpenReviewSessionUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    communityRepository = new InMemoryCommunityRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    scopeChecker = new FakeCommunityScopeChecker();
    idGenerator = { generate: jest.fn() };
    useCase = new OpenReviewSessionUseCase(
      sessionRepository,
      communityRepository,
      templateRepository,
      scopeChecker,
      idGenerator,
    );
  });

  it('opens a draft session for an assigned actor and an active template', async () => {
    communityRepository.seed(community());
    templateRepository.seed(activeTemplate());
    scopeChecker.assign('user-1', 'community-1');
    idGenerator.generate.mockReturnValue('session-1');

    const result = await useCase.execute({
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.id).toBe('session-1');
    expect(result.status).toBe('draft');
    const stored = await sessionRepository.findByIdForPerformer(
      'session-1',
      'user-1',
    );
    expect(stored?.communityId).toBe('community-1');
    expect(stored?.templateId).toBe('template-1');
  });

  it('rejects with COMMUNITY_NOT_IN_SCOPE when the actor is not assigned to an existing community', async () => {
    communityRepository.seed(community());
    templateRepository.seed(activeTemplate());
    // Deliberately no scopeChecker.assign() call.

    await expect(
      useCase.execute({
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(CommunityNotInScopeError);
  });

  // BINDING (design.md Decision 4, corrected 2026-09-07): the fresh-context
  // review on PR2 found isAssignedTo returns true for an assignment active
  // in a soft-deleted community. This use case must add its own
  // communityRepository.findById check BEFORE consulting isAssignedTo, and
  // the resulting 403 MUST be indistinguishable from the unassigned-actor
  // case above (same error, same message).
  it('rejects with the SAME CommunityNotInScopeError for a soft-deleted community even when the assignment is still active', async () => {
    communityRepository.seed(community({ deletedAt: new Date() }));
    templateRepository.seed(activeTemplate());
    // The actor still holds an active assignment row — isAssignedTo alone
    // would say true. The community-existence check must run first.
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(CommunityNotInScopeError);
  });

  it('rejects with COMMUNITY_NOT_IN_SCOPE for a nonexistent community — indistinguishable from unassigned', async () => {
    templateRepository.seed(activeTemplate());
    scopeChecker.assign('user-1', 'community-missing');

    await expect(
      useCase.execute({
        communityId: 'community-missing',
        templateId: 'template-1',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(CommunityNotInScopeError);
  });

  it('rejects with ACTIVE_TEMPLATE_NOT_FOUND when the template is a draft, not active', async () => {
    communityRepository.seed(community());
    templateRepository.seed(activeTemplate({ status: 'draft', version: null }));
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ActiveTemplateNotFoundError);
  });

  it('rejects with ACTIVE_TEMPLATE_NOT_FOUND for an unknown templateId', async () => {
    communityRepository.seed(community());
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        templateId: 'missing-template',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ActiveTemplateNotFoundError);
  });

  it('rejects a second open draft for the same (community, template, performer) triple', async () => {
    communityRepository.seed(community());
    templateRepository.seed(activeTemplate());
    scopeChecker.assign('user-1', 'community-1');
    idGenerator.generate.mockReturnValueOnce('session-1');

    await useCase.execute({
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    idGenerator.generate.mockReturnValueOnce('session-2');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(OpenDraftAlreadyExistsError);
  });
});
