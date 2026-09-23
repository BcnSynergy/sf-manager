import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { InMemoryOrganizationProfileRepository } from '../../../organization-profile/application/use-cases/testing/in-memory-organization-profile.repository';
import { OrganizationProfile } from '../../../organization-profile/domain/organization-profile.entity';
import { blankOrganizationProfileProps } from '../../../organization-profile/domain/organization-profile.fixture';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from './testing/fake-manager-capability.checker';
import { InMemoryUserDirectory } from './testing/in-memory-user-directory';
import { InMemoryReviewDocumentNameDirectory } from './testing/in-memory-review-document-name-directory';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ReadReviewDocumentUseCase } from './read-review-document.use-case';

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

// design.md Decision 1: the use case's first call is loadCompletedForActor
// (the single throw site) — tests assert lookups run only after a session
// is loaded, and only with identifiers carried by that session (spec.md
// "Inclusive Name Lookups Run Only Inside the Scope Gate"). design.md
// "Entry enrichment and order": entries are sorted by
// `compareDocumentEntries` and answers by the frozen template's
// `answerOrder`.
describe('ReadReviewDocumentUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let companyScopeChecker: FakeCompanyScopeChecker;
  let accessService: ReviewHistoryAccessService;
  let questionRepository: InMemoryChecklistQuestionRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let nameDirectory: InMemoryReviewDocumentNameDirectory;
  let userDirectory: InMemoryUserDirectory;
  let profileRepository: InMemoryOrganizationProfileRepository;
  let useCase: ReadReviewDocumentUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    accessService = new ReviewHistoryAccessService(
      sessionRepository,
      scopeChecker,
      companyScopeChecker,
      new FakeManagerCapabilityChecker(),
    );
    questionRepository = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      questionRepository,
    );
    nameDirectory = new InMemoryReviewDocumentNameDirectory();
    userDirectory = new InMemoryUserDirectory();
    profileRepository = new InMemoryOrganizationProfileRepository();
    useCase = new ReadReviewDocumentUseCase(
      accessService,
      templateRepository,
      nameDirectory,
      userDirectory,
      profileRepository,
    );
  });

  // spec.md "A rejected read issues no name lookup"
  it('a rejected read issues no template, name, email or profile lookup', async () => {
    const findFrozenSpy = jest.spyOn(
      templateRepository,
      'findFrozenWithSnapshot',
    );
    const communitySpy = jest.spyOn(nameDirectory, 'findCommunityName');
    const companySpy = jest.spyOn(nameDirectory, 'findMaintenanceCompanyName');
    const elementsSpy = jest.spyOn(nameDirectory, 'findElementsByIds');
    const emailsSpy = jest.spyOn(userDirectory, 'findEmailsByIds');
    const profileSpy = jest.spyOn(profileRepository, 'get');

    await expect(
      useCase.execute('nonexistent', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);

    expect(findFrozenSpy).not.toHaveBeenCalled();
    expect(communitySpy).not.toHaveBeenCalled();
    expect(companySpy).not.toHaveBeenCalled();
    expect(elementsSpy).not.toHaveBeenCalled();
    expect(emailsSpy).not.toHaveBeenCalled();
    expect(profileSpy).not.toHaveBeenCalled();
  });

  // spec.md "Lookups use only identifiers from the loaded session"
  it('lookups use only identifiers carried by the loaded session', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const entry = ElementReviewEntry.reviewed({
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
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      performedByCompanyId: 'company-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const communitySpy = jest.spyOn(nameDirectory, 'findCommunityName');
    const companySpy = jest.spyOn(nameDirectory, 'findMaintenanceCompanyName');
    const elementsSpy = jest.spyOn(nameDirectory, 'findElementsByIds');

    await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(communitySpy).toHaveBeenCalledWith('community-1');
    expect(companySpy).toHaveBeenCalledWith('company-1');
    expect(elementsSpy).toHaveBeenCalledWith(['element-1']);
  });

  // spec.md "The document carries all four parts", "A session without an
  // attributed company has no company", "The document exposes only the
  // letterhead fields", "A session completed before this change is signed
  // by its performer"
  it('carries labels, an empty-string fallback, a null company, the performer as signer and only six letterhead keys', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    nameDirectory.seedCommunity('community-1', 'Sunset Towers');
    nameDirectory.seedElement('element-1', {
      code: 'EXT-001',
      name: 'Extinguisher',
      location: 'Ground floor',
    });
    // Deliberately no seedElement for 'element-unknown' — resolves absent.
    userDirectory.seedEmail('user-1', 'user-1@example.com');
    profileRepository.seed(
      new OrganizationProfile({
        ...blankOrganizationProfileProps,
        name: 'ACME Maintenance',
        legalName: 'ACME Maintenance S.L.',
        taxId: 'B12345678',
        address: 'Calle Falsa 123',
        phone: '+34 600 000 000',
        email: 'contact@acme.example',
      }),
    );

    const reviewedEntry = ElementReviewEntry.reviewed({
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
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const unreviewedEntry = ElementReviewEntry.unreviewed({
      id: 'entry-2',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-unknown',
      observations: 'Inaccessible',
      recordedAt: new Date('2026-01-02T00:01:00.000Z'),
    });
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      // No performedByCompanyId — session without an attributed company.
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [reviewedEntry, unreviewedEntry],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.communityName).toBe('Sunset Towers');
    expect(result.maintenanceCompanyName).toBeNull();
    expect(result.performedById).toBe('user-1');
    expect(result.performedByEmail).toBe('user-1@example.com');
    expect(result.completedAt).toEqual(session.completedAt);
    expect(result.status).toBe('completed');
    expect(result.template).toEqual({
      name: 'Template',
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      version: 1,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      inspectableElementId: 'element-1',
      elementCode: 'EXT-001',
      elementName: 'Extinguisher',
      elementLocation: 'Ground floor',
      reviewed: true,
    });
    expect(result.entries[1]).toMatchObject({
      inspectableElementId: 'element-unknown',
      elementCode: null,
      elementName: null,
      elementLocation: null,
      reviewed: false,
      observations: 'Inaccessible',
    });

    expect(result.letterhead).toEqual({
      name: 'ACME Maintenance',
      legalName: 'ACME Maintenance S.L.',
      taxId: 'B12345678',
      address: 'Calle Falsa 123',
      phone: '+34 600 000 000',
      email: 'contact@acme.example',
    });
    expect(Object.keys(result.letterhead).sort()).toEqual([
      'address',
      'email',
      'legalName',
      'name',
      'phone',
      'taxId',
    ]);
  });

  // spec.md "A blank profile does not block the document"
  it('a blank organization profile renders all six letterhead fields as empty strings', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.letterhead).toEqual({
      name: '',
      legalName: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
    });
    expect(result.entries).toEqual([]);
  });

  // spec.md "Deleted context still labels the document" (company half): a
  // recorded company id that resolves no row renders '' (fallback owned by
  // the use case, never the port — design.md "Fallbacks and letterhead").
  it('a recorded company id with no row renders an empty-string company name', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      performedByCompanyId: 'company-missing',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [],
    });
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');
    // Deliberately no nameDirectory.seedMaintenanceCompany() call.

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.maintenanceCompanyName).toBe('');
  });

  // spec.md "Entries and answers are returned in a deterministic order":
  // element code ascending, code-less last, ties broken by recordedAt then
  // entry id; each entry's answers ordered by the frozen template's
  // question order.
  it('orders entries by element code ascending, code-less last, and answers by the frozen question order', async () => {
    const template = buildTemplate();
    templateRepository.seed(template, [
      { questionId: 'question-2', order: 2, text: 'Is it charged?' },
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    nameDirectory.seedElement('element-b', {
      code: 'EXT-002',
      name: 'Extinguisher B',
      location: 'First floor',
    });
    nameDirectory.seedElement('element-a', {
      code: 'EXT-001',
      name: 'Extinguisher A',
      location: 'Ground floor',
    });
    // 'element-unresolved' is deliberately never seeded — code-less, sorts
    // last regardless of insertion order below.

    const entryB = ElementReviewEntry.reviewed({
      id: 'entry-b',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-b',
      answers: [
        new QuestionAnswer({
          id: 'answer-b-2',
          elementReviewEntryId: 'entry-b',
          questionId: 'question-2',
          answer: 'YES',
        }),
        new QuestionAnswer({
          id: 'answer-b-1',
          elementReviewEntryId: 'entry-b',
          questionId: 'question-1',
          answer: 'NO',
        }),
      ],
      recordedAt: new Date('2026-01-02T00:01:00.000Z'),
    });
    const entryUnresolved = ElementReviewEntry.unreviewed({
      id: 'entry-unresolved',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-unresolved',
      observations: 'Inaccessible',
      recordedAt: new Date('2026-01-02T00:02:00.000Z'),
    });
    const entryA = ElementReviewEntry.reviewed({
      id: 'entry-a',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-a',
      answers: [
        new QuestionAnswer({
          id: 'answer-a-1',
          elementReviewEntryId: 'entry-a',
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    // Session entries are given in a deliberately arbitrary order — the
    // use case must produce a deterministic order regardless of input.
    const session = new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: template.id,
      performedById: 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      entries: [entryUnresolved, entryB, entryA],
    });
    const originalEntriesOrder = [...session.entries];
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.entries.map((entry) => entry.inspectableElementId)).toEqual([
      'element-a',
      'element-b',
      'element-unresolved',
    ]);
    const entryBResult = result.entries.find(
      (entry) => entry.inspectableElementId === 'element-b',
    );
    expect(entryBResult?.answers.map((answer) => answer.questionId)).toEqual([
      'question-1',
      'question-2',
    ]);
    // The use case must sort a COPY — the aggregate's own entries array is
    // never reordered in place.
    expect(session.entries).toEqual(originalEntriesOrder);
  });

  it('propagates ReviewSessionNotFoundError for an out-of-scope session', async () => {
    await expect(
      useCase.execute('nonexistent', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});
