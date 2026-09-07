import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { InMemoryCommunityTechnicianRepository } from '../../../community/application/use-cases/testing/in-memory-community-technician.repository';
import { InMemoryCommunityRepresentativeRepository } from '../../../community/application/use-cases/testing/in-memory-community-representative.repository';
import { CommunityTechnician } from '../../../community/domain/community-technician.entity';
import { CommunityRepresentative } from '../../../community/domain/community-representative.entity';
import { Community } from '../../../community/domain/community.entity';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { GetReviewScopeUseCase } from './get-review-scope.use-case';

// design.md Decision 5/7 + Data Flow "GET /review-scope": surfaces the
// actor's assigned communities (by resolving names via
// communityRepository.findById per assignment) and every currently active
// template across element types, so the web open-form can drive its
// community/template pickers.
describe('GetReviewScopeUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let technicianRepository: InMemoryCommunityTechnicianRepository;
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let useCase: GetReviewScopeUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    technicianRepository = new InMemoryCommunityTechnicianRepository();
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    useCase = new GetReviewScopeUseCase(
      technicianRepository,
      representativeRepository,
      communityRepository,
      templateRepository,
    );
  });

  it('resolves the assigned communities and active templates for a technician', async () => {
    communityRepository.seed(
      new Community({
        id: 'community-1',
        name: 'Building A',
        address: '1 Main St',
        locale: 'en',
        deletedAt: null,
      }),
    );
    technicianRepository.seed(
      new CommunityTechnician({
        id: 'assignment-1',
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      }),
    );
    templateRepository.seed(
      new ReviewTemplate({
        id: 'template-1',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Quarterly checks',
        version: 1,
        status: 'active',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );

    const result = await useCase.execute('user-1');

    expect(result.communities).toEqual([
      { id: 'community-1', name: 'Building A' },
    ]);
    expect(result.templates).toEqual([
      {
        id: 'template-1',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Quarterly checks',
      },
    ]);
  });

  it('merges technician and representative assignments without duplicating a community', async () => {
    communityRepository.seed(
      new Community({
        id: 'community-1',
        name: 'Building A',
        address: '1 Main St',
        locale: 'en',
        deletedAt: null,
      }),
    );
    technicianRepository.seed(
      new CommunityTechnician({
        id: 'assignment-1',
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      }),
    );
    representativeRepository.seed(
      new CommunityRepresentative({
        id: 'assignment-2',
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      }),
    );

    const result = await useCase.execute('user-1');

    expect(result.communities).toEqual([
      { id: 'community-1', name: 'Building A' },
    ]);
  });

  it('excludes deactivated assignments and returns an empty scope (triangulation)', async () => {
    communityRepository.seed(
      new Community({
        id: 'community-1',
        name: 'Building A',
        address: '1 Main St',
        locale: 'en',
        deletedAt: null,
      }),
    );
    technicianRepository.seed(
      new CommunityTechnician({
        id: 'assignment-1',
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    const result = await useCase.execute('user-1');

    expect(result.communities).toEqual([]);
  });
});
