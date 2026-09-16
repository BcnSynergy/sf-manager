import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { Community } from '../../../community/domain/community.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from './testing/fake-manager-capability.checker';
import { InMemoryUserDirectory } from './testing/in-memory-user-directory';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ReadElementReviewHistoryUseCase } from './read-element-review-history.use-case';

function buildElement(
  overrides: Partial<{
    id: string;
    communityId: string;
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
    code: 'EXT-001',
    deactivatedAt: overrides.deactivatedAt ?? null,
  });
}

function buildCommunity(
  overrides: Partial<{ id: string; name: string }> = {},
): Community {
  return new Community({
    id: overrides.id ?? 'community-1',
    name: overrides.name ?? 'Community One',
    address: 'Carrer Major 1',
    locale: 'ca',
    deletedAt: null,
  });
}

function reviewedEntry(
  overrides: Partial<{
    id: string;
    reviewSessionId: string;
    inspectableElementId: string;
    recordedAt: Date;
  }> = {},
): ElementReviewEntry {
  const entryId = overrides.id ?? 'entry-1';
  return ElementReviewEntry.reviewed({
    id: entryId,
    reviewSessionId: overrides.reviewSessionId ?? 'session-1',
    inspectableElementId: overrides.inspectableElementId ?? 'element-1',
    answers: [
      new QuestionAnswer({
        id: `${entryId}-answer`,
        elementReviewEntryId: entryId,
        questionId: 'question-1',
        answer: 'YES',
      }),
    ],
    recordedAt: overrides.recordedAt ?? new Date('2026-01-02T00:00:00.000Z'),
  });
}

function unreviewedEntry(
  overrides: Partial<{
    id: string;
    reviewSessionId: string;
    inspectableElementId: string;
    recordedAt: Date;
  }> = {},
): ElementReviewEntry {
  return ElementReviewEntry.unreviewed({
    id: overrides.id ?? 'entry-2',
    reviewSessionId: overrides.reviewSessionId ?? 'session-2',
    inspectableElementId: overrides.inspectableElementId ?? 'element-1',
    observations: 'Element inaccessible',
    recordedAt: overrides.recordedAt ?? new Date('2026-01-03T00:00:00.000Z'),
  });
}

function completedSession(
  overrides: Partial<{
    id: string;
    communityId: string;
    performedById: string;
    entries: ElementReviewEntry[];
  }> = {},
): ReviewSession {
  return new ReviewSession({
    id: overrides.id ?? 'session-1',
    communityId: overrides.communityId ?? 'community-1',
    templateId: 'template-1',
    performedById: overrides.performedById ?? 'user-1',
    status: 'completed',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
    entries: overrides.entries ?? [],
  });
}

// review-history-per-element/design.md Decision 5: element-first lookup,
// then scope resolution, ONE throw site. Header + community name + batched
// performer emails + reviewed derivation + the sort applied once, after the
// join.
describe('ReadElementReviewHistoryUseCase', () => {
  let elementRepository: InMemoryInspectableElementRepository;
  let communityRepository: InMemoryCommunityRepository;
  let sessionRepository: InMemoryReviewSessionRepository;
  let communityScopeChecker: FakeCommunityScopeChecker;
  let companyScopeChecker: FakeCompanyScopeChecker;
  let managerCapabilityChecker: FakeManagerCapabilityChecker;
  let accessService: ReviewHistoryAccessService;
  let userDirectory: InMemoryUserDirectory;
  let useCase: ReadElementReviewHistoryUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    sessionRepository = new InMemoryReviewSessionRepository();
    communityScopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    managerCapabilityChecker = new FakeManagerCapabilityChecker();
    accessService = new ReviewHistoryAccessService(
      sessionRepository,
      communityScopeChecker,
      companyScopeChecker,
      managerCapabilityChecker,
    );
    userDirectory = new InMemoryUserDirectory();
    useCase = new ReadElementReviewHistoryUseCase(
      elementRepository,
      accessService,
      communityRepository,
      userDirectory,
    );
  });

  it('the element lookup runs before the access service, in that order', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());
    const elementSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');
    const accessSpy = jest.spyOn(accessService, 'listElementHistoryForActor');

    await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(elementSpy).toHaveBeenCalledWith('community-1', 'element-1');
    expect(accessSpy).toHaveBeenCalledWith(element, {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });
    expect(elementSpy.mock.invocationCallOrder[0]).toBeLessThan(
      accessSpy.mock.invocationCallOrder[0],
    );
  });

  it('an unknown element rejects with InspectableElementNotFoundError and never calls the access service', async () => {
    const accessSpy = jest.spyOn(accessService, 'listElementHistoryForActor');

    await expect(
      useCase.execute('community-1', 'nonexistent', {
        userId: 'admin-1',
        role: 'SYSTEM_ADMIN',
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
    expect(accessSpy).not.toHaveBeenCalled();
  });

  it('an unreachable scope also collapses to InspectableElementNotFoundError, the SAME error', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());
    // No entries seeded and no scope granted — a technician with no
    // recorded entries on this element is unreachable (design.md Decision
    // 4/spec.md "Element Reachability Decides 404 Versus an Empty History").

    await expect(
      useCase.execute('community-1', 'element-1', {
        userId: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('assembles the header entirely from the element, with no second element query', async () => {
    const element = buildElement({
      id: 'element-1',
      communityId: 'community-1',
    });
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity({ name: 'Community One' }));
    const elementSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.element).toMatchObject({
      id: element.id,
      code: element.code,
      name: element.name,
      elementType: element.elementType,
      location: element.location,
      communityId: element.communityId,
      communityName: 'Community One',
      deactivatedAt: null,
    });
    expect(elementSpy).toHaveBeenCalledTimes(1);
  });

  it('an unresolvable community name falls back to an empty string', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    // Deliberately no communityRepository.seed() call.

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.element.communityName).toBe('');
  });

  it('derives reviewed from observations and resolves performedByEmail via one batched call', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());
    userDirectory.seedEmail('user-1', 'user-1@example.com');
    const reviewed = reviewedEntry({
      id: 'entry-reviewed',
      reviewSessionId: 'session-1',
    });
    const unreviewed = unreviewedEntry({
      id: 'entry-unreviewed',
      reviewSessionId: 'session-2',
    });
    sessionRepository.seed(
      completedSession({
        id: 'session-1',
        performedById: 'user-1',
        entries: [reviewed],
      }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-2',
        performedById: 'user-1',
        entries: [unreviewed],
      }),
    );

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    const reviewedRow = result.entries.find(
      (row) => row.reviewSessionId === 'session-1',
    );
    const unreviewedRow = result.entries.find(
      (row) => row.reviewSessionId === 'session-2',
    );
    expect(reviewedRow).toMatchObject({
      reviewed: true,
      observations: null,
      performedByEmail: 'user-1@example.com',
    });
    expect(unreviewedRow).toMatchObject({
      reviewed: false,
      observations: 'Element inaccessible',
      performedByEmail: 'user-1@example.com',
    });
  });

  it('an unresolvable performer renders performedByEmail as an empty string', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());
    // Deliberately no userDirectory.seedEmail() call.
    sessionRepository.seed(
      completedSession({
        id: 'session-1',
        performedById: 'user-1',
        entries: [reviewedEntry({ reviewSessionId: 'session-1' })],
      }),
    );

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.entries[0].performedByEmail).toBe('');
  });

  it('orders entries recordedAt DESC, with a deterministic entryId tiebreak on equal timestamps', async () => {
    const element = buildElement();
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());
    const sameInstant = new Date('2026-01-05T00:00:00.000Z');
    const earliest = reviewedEntry({
      id: 'entry-earliest',
      reviewSessionId: 'session-earliest',
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const tieA = reviewedEntry({
      id: 'entry-tie-a',
      reviewSessionId: 'session-tie-a',
      recordedAt: sameInstant,
    });
    const tieB = reviewedEntry({
      id: 'entry-tie-b',
      reviewSessionId: 'session-tie-b',
      recordedAt: sameInstant,
    });
    sessionRepository.seed(
      completedSession({
        id: 'session-earliest',
        entries: [earliest],
        performedById: 'user-1',
      }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-tie-a',
        entries: [tieA],
        performedById: 'user-1',
      }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-tie-b',
        entries: [tieB],
        performedById: 'user-1',
      }),
    );

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.entries.map((row) => row.reviewSessionId)).toEqual([
      'session-tie-b',
      'session-tie-a',
      'session-earliest',
    ]);
  });

  it('a decommissioned element still returns its header with deactivatedAt set', async () => {
    const element = buildElement({
      deactivatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    elementRepository.seed(element);
    communityRepository.seed(buildCommunity());

    const result = await useCase.execute('community-1', 'element-1', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.element.deactivatedAt).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    );
  });
});
