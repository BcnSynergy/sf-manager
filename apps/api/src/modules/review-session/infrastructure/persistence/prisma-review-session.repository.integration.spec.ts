import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { PrismaCommunityRepository } from '../../../community/infrastructure/persistence/prisma-community.repository';
import { Community } from '../../../community/domain/community.entity';
import { PrismaReviewTemplateRepository } from '../../../review-template/infrastructure/persistence/prisma-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { PrismaInspectableElementRepository } from '../../../inspectable-element/infrastructure/persistence/prisma-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { RandomElementCodeGenerator } from '../../../inspectable-element/infrastructure/code/random-element-code.generator';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { OpenDraftAlreadyExistsError } from '../../domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { PrismaReviewSessionRepository } from './prisma-review-session.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres instance (design.md Testing
// Strategy: "Open-draft race" — two connections racing to create the SAME
// open draft), mirroring
// prisma-review-template-activation.integration.spec.ts's two-connection
// concurrency shape. spec.md "At Most One Open Draft Per Community,
// Template and User".
describe('PrismaReviewSessionRepository.create() (integration, open-draft race)', () => {
  let prisma1: PrismaService;
  let prisma2: PrismaService;
  let repository1: PrismaReviewSessionRepository;
  let repository2: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;

  beforeAll(async () => {
    // Two INDEPENDENT PrismaService instances -> two independent Postgres
    // connections, so the two create() calls below genuinely overlap.
    prisma1 = new PrismaService();
    prisma2 = new PrismaService();
    await prisma1.$connect();
    await prisma2.$connect();
    repository1 = new PrismaReviewSessionRepository(prisma1);
    repository2 = new PrismaReviewSessionRepository(prisma2);
    communityRepository = new PrismaCommunityRepository(prisma1);
    templateRepository = new PrismaReviewTemplateRepository(prisma1);
    userRepository = new PrismaUserRepository(prisma1);
  });

  afterAll(async () => {
    await prisma1.$disconnect();
    await prisma2.$disconnect();
  });

  const uniqueName = (label: string) => `${label}-${randomUUID()}`;

  const createCommunity = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await communityRepository.create(
      new Community({
        id,
        name: uniqueName(label),
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await userRepository.create(
      new User({
        id,
        email: `${uniqueName(label)}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    return id;
  };

  const createActiveTemplate = async (label: string): Promise<string> => {
    // This suite reuses the app's own dev database with no per-test
    // isolation (same caveat as
    // prisma-review-template-activation.integration.spec.ts) — a prior run
    // that failed before reaching the activation step below could leave a
    // stray `draft` row for this lineage, which would collide with the
    // partial unique index `ReviewTemplate_one_draft_per_lineage`. Clear it
    // first; safe because a draft never has ReviewTemplateQuestion snapshot
    // rows (those only exist once activated).
    await prisma1.reviewTemplate.deleteMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        status: 'draft',
      },
    });

    const id = idGenerator.generate();
    await templateRepository.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: uniqueName(label),
        version: null,
        status: 'draft',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    // Activating an empty-selection draft rejects (ReviewTemplateEmptyError)
    // — flip the row directly, this test only needs an `active` FK target,
    // not a real question snapshot. Retire any pre-existing active row for
    // the same (EXTINGUISHER, QUARTERLY) lineage first — this suite reuses
    // the app's own dev database with no per-test isolation (same caveat as
    // prisma-review-template-activation.integration.spec.ts), so an earlier
    // test run's active row would otherwise collide with the partial
    // unique index `ReviewTemplate_one_active_per_lineage`.
    await prisma1.reviewTemplate.updateMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma1.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        version: { not: null },
      },
      select: { version: true },
    });
    const nextVersion =
      Math.max(0, ...priorVersions.map((row) => row.version ?? 0)) + 1;
    await prisma1.reviewTemplate.update({
      where: { id },
      data: { status: 'active', version: nextVersion },
    });
    return id;
  };

  // spec.md "At Most One Open Draft Per Community, Template and User" —
  // two connections race to create() a draft for the exact SAME
  // (community, template, performer) triple. Postgres's hand-written
  // partial unique index `ReviewSession_open_draft_key` resolves the race:
  // exactly one INSERT commits, the other's P2002 is mapped to
  // OpenDraftAlreadyExistsError, and exactly one draft row exists
  // afterwards for the triple.
  it('two concurrent create() calls for the same (community, template, performer): exactly one succeeds, the other rejects with OpenDraftAlreadyExistsError', async () => {
    const communityId = await createCommunity('open-draft-race');
    const templateId = await createActiveTemplate('open-draft-race');
    const performedById = await createUser('open-draft-race');

    const session1 = new ReviewSession({
      id: idGenerator.generate(),
      communityId,
      templateId,
      performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
    });
    const session2 = new ReviewSession({
      id: idGenerator.generate(),
      communityId,
      templateId,
      performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
    });

    const results = await Promise.allSettled([
      repository1.create(session1),
      repository2.create(session2),
    ]);

    const isFulfilled = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseFulfilledResult<T> => result.status === 'fulfilled';
    const isRejected = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseRejectedResult => result.status === 'rejected';

    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(OpenDraftAlreadyExistsError);

    const draftRows = await prisma1.reviewSession.findMany({
      where: { communityId, templateId, performedById, status: 'draft' },
    });
    expect(draftRows).toHaveLength(1);
  });
});

// Fresh-context review on PR4, finding #C: the port's `upsertEntry` took a
// separate `answers` parameter alongside `entry`, which already carries
// `entry.answers` — the domain invariant's only construction paths
// (ElementReviewEntry.reviewed()/.unreviewed(), design.md Decision 1)
// always populate it. `entry.answers` is the single source of truth, so
// the redundant parameter is gone; this suite proves the real adapter (1)
// persists `entry.answers` with full-replace semantics against Postgres,
// and (2) throws ReviewSessionNotFoundError for an unknown sessionId
// instead of surfacing a raw FK-violation error — matching
// InMemoryReviewSessionRepository's behaviour (in-memory-review-session
// .repository.spec.ts) so Phase 5's tests against the fake reflect this.
describe('PrismaReviewSessionRepository.upsertEntry() (integration, review finding #C)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;
  let elementRepository: PrismaInspectableElementRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    templateRepository = new PrismaReviewTemplateRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    elementRepository = new PrismaInspectableElementRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueName = (label: string) => `${label}-${randomUUID()}`;

  const createCommunity = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await communityRepository.create(
      new Community({
        id,
        name: uniqueName(label),
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await userRepository.create(
      new User({
        id,
        email: `${uniqueName(label)}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    return id;
  };

  const createActiveTemplate = async (label: string): Promise<string> => {
    await prisma.reviewTemplate.deleteMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'MONTHLY',
        status: 'draft',
      },
    });

    const id = idGenerator.generate();
    await templateRepository.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'MONTHLY',
        name: uniqueName(label),
        version: null,
        status: 'draft',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    await prisma.reviewTemplate.updateMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'MONTHLY',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'MONTHLY',
        version: { not: null },
      },
      select: { version: true },
    });
    const nextVersion =
      Math.max(0, ...priorVersions.map((row) => row.version ?? 0)) + 1;
    await prisma.reviewTemplate.update({
      where: { id },
      data: { status: 'active', version: nextVersion },
    });
    return id;
  };

  const codeGenerator = new RandomElementCodeGenerator();

  const createElement = async (
    communityId: string,
    label: string,
  ): Promise<string> => {
    const id = idGenerator.generate();
    // inspectable-element-migration.integration.spec.ts asserts EVERY row
    // in the table matches the app's code alphabet
    // (/^[2-9A-HJKMNP-Z]{10}$/) — reuse the real generator, not an
    // arbitrary hex string, so this suite's rows never violate that guard.
    const code = codeGenerator.generate();
    await elementRepository.create(
      new InspectableElement({
        id,
        communityId,
        elementType: 'EXTINGUISHER',
        name: uniqueName(label),
        description: null,
        location: 'Ground floor',
        installedAt: new Date(),
        serialNumber: null,
        deletedAt: null,
        code,
        deactivatedAt: null,
      }),
    );
    return id;
  };

  const createDraftSession = async (): Promise<{
    sessionId: string;
    communityId: string;
    templateId: string;
    performedById: string;
    inspectableElementId: string;
  }> => {
    const communityId = await createCommunity('upsert-entry');
    const templateId = await createActiveTemplate('upsert-entry');
    const performedById = await createUser('upsert-entry');
    const inspectableElementId = await createElement(
      communityId,
      'upsert-entry',
    );
    const sessionId = idGenerator.generate();
    await repository.create(
      new ReviewSession({
        id: sessionId,
        communityId,
        templateId,
        performedById,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );
    return {
      sessionId,
      communityId,
      templateId,
      performedById,
      inspectableElementId,
    };
  };

  it('persists entry.answers with full-replace semantics — there is no separate answers argument', async () => {
    const { sessionId, inspectableElementId } = await createDraftSession();

    const entry = ElementReviewEntry.reviewed({
      id: idGenerator.generate(),
      reviewSessionId: sessionId,
      inspectableElementId,
      answers: [
        new QuestionAnswer({
          id: idGenerator.generate(),
          elementReviewEntryId: 'placeholder',
          questionId: idGenerator.generate(),
          answer: 'YES',
        }),
      ],
      recordedAt: new Date(),
    });

    await repository.upsertEntry(sessionId, entry);

    const stored = await repository.findByIdForPerformer(
      sessionId,
      (
        await prisma.reviewSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).performedById,
    );
    expect(stored?.entries[0].answers).toHaveLength(1);
    expect(stored?.entries[0].answers[0].answer).toBe('YES');

    // A second upsertEntry with a DIFFERENT answer set fully replaces the
    // first, not merges with it (design.md "Full-replace semantics").
    const replacement = ElementReviewEntry.unreviewed({
      id: entry.id,
      reviewSessionId: sessionId,
      inspectableElementId: entry.inspectableElementId,
      observations: 'Not accessible this cycle',
      recordedAt: new Date(),
    });
    await repository.upsertEntry(sessionId, replacement);

    const replaced = await repository.findByIdForPerformer(
      sessionId,
      (
        await prisma.reviewSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).performedById,
    );
    expect(replaced?.entries[0].answers).toHaveLength(0);
    expect(replaced?.entries[0].observations).toBe('Not accessible this cycle');
  });

  it('rejects with ReviewSessionNotFoundError for an unknown sessionId instead of a raw FK-violation error', async () => {
    // A real (community, element) pair isolates this failure to the
    // reviewSessionId FK specifically — this test is about the missing
    // SESSION, not an incidentally-invalid element.
    const communityId = await createCommunity('upsert-entry-missing-session');
    const inspectableElementId = await createElement(
      communityId,
      'upsert-entry-missing-session',
    );

    // A well-formed UUID that simply has no ReviewSession row — the
    // column is @db.Uuid, so a non-UUID string like 'does-not-exist'
    // fails at the Postgres type-parsing layer (22P02), not the FK
    // constraint; that would be a different (and uninteresting) failure
    // mode than the one this test targets.
    const unknownSessionId = idGenerator.generate();
    const entry = ElementReviewEntry.unreviewed({
      id: idGenerator.generate(),
      reviewSessionId: unknownSessionId,
      inspectableElementId,
      observations: 'Not accessible this cycle',
      recordedAt: new Date(),
    });

    await expect(
      repository.upsertEntry(unknownSessionId, entry),
    ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
  });
});
