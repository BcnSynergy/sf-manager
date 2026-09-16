import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { PrismaCommunityRepository } from '../../../community/infrastructure/persistence/prisma-community.repository';
import { Community } from '../../../community/domain/community.entity';
import { PrismaMaintenanceCompanyRepository } from '../../../maintenance-company/infrastructure/persistence/prisma-maintenance-company.repository';
import { MaintenanceCompany } from '../../../maintenance-company/domain/maintenance-company.entity';
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
//
// Phase 5 follow-up: `upsertEntry` also dropped its separate `sessionId`
// parameter — `entry.reviewSessionId` is now the sole source of truth,
// closing the identical redundancy PR4 carried forward as a known item.
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

    await repository.upsertEntry(entry);

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
    await repository.upsertEntry(replacement);

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

  // Fresh-context review finding M1: complete()/discardDraft() both guard
  // their write with `WHERE status='draft'` and treat 0 affected rows as
  // "no longer editable" — upsertEntry() had no such guard, so a concurrent
  // complete() that commits between RecordEntryUseCase's load of the
  // aggregate (still draft) and this write could silently land on an
  // already-completed session, breaking the immutability invariant. This
  // is the real, sequential proof against Postgres: complete the session
  // first (as if a concurrent request already committed it), THEN attempt
  // upsertEntry() — it must report the loss (return `false`) and must NOT
  // write an ElementReviewEntry row for the now-completed session.
  it('returns false and writes no entry when the session was completed before upsertEntry reaches the database (concurrency backstop)', async () => {
    const { sessionId, inspectableElementId } = await createDraftSession();

    const completed = await repository.complete(sessionId, new Date());
    expect(completed).toBe(true);

    const entry = ElementReviewEntry.unreviewed({
      id: idGenerator.generate(),
      reviewSessionId: sessionId,
      inspectableElementId,
      observations: 'race window — session completed before this write',
      recordedAt: new Date(),
    });

    const result = await repository.upsertEntry(entry);
    expect(result).toBe(false);

    const rows = await prisma.elementReviewEntry.findMany({
      where: { reviewSessionId: sessionId },
    });
    expect(rows).toHaveLength(0);
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

    await expect(repository.upsertEntry(entry)).rejects.toBeInstanceOf(
      ReviewSessionNotFoundError,
    );
  });
});

// review-history design.md Decision 3, tasks.md 2.4/2.5/2.6: the four
// `findCompleted…InCommunities` methods against a real Postgres instance —
// the fail-closed empty-scope case (`communityIds = []`), the port-surface
// guard (no unscoped read anywhere on the port), and ordering parity
// between the two list methods.
describe('PrismaReviewSessionRepository — findCompleted…InCommunities() (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    templateRepository = new PrismaReviewTemplateRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
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
        frequency: 'ANNUAL',
        status: 'draft',
      },
    });

    const id = idGenerator.generate();
    await templateRepository.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'ANNUAL',
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
        frequency: 'ANNUAL',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'ANNUAL',
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

  const createSession = async (
    communityId: string,
    templateId: string,
    performedById: string,
    status: 'draft' | 'completed',
    completedAt: Date | null,
  ): Promise<string> => {
    const id = idGenerator.generate();
    await repository.create(
      new ReviewSession({
        id,
        communityId,
        templateId,
        performedById,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );
    if (status === 'completed') {
      const completed = await repository.complete(
        id,
        completedAt ?? new Date(),
      );
      expect(completed).toBe(true);
    }
    return id;
  };

  it('communityIds = [] resolves to an empty list / null for all four methods — the fail-closed empty-scope case', async () => {
    const communityId = await createCommunity('empty-scope');
    const templateId = await createActiveTemplate('empty-scope');
    const performedById = await createUser('empty-scope');
    const sessionId = await createSession(
      communityId,
      templateId,
      performedById,
      'completed',
      new Date(),
    );

    await expect(repository.findCompletedInCommunities([])).resolves.toEqual(
      [],
    );
    await expect(
      repository.findCompletedByIdInCommunities(sessionId, []),
    ).resolves.toBeNull();
    // performedByCompanyId is `@db.Uuid` — a non-UUID-shaped placeholder
    // would fail at the Postgres type level (a malformed string never
    // reaches this method in production either: CompanyScopeChecker only
    // ever returns a real company UUID or null, short-circuited before any
    // repository call), so the "no match" case uses a syntactically valid
    // but nonexistent UUID, matching this codebase's established
    // nonexistent-id convention (e.g. review-history.e2e-spec.ts).
    await expect(
      repository.findCompletedByIdForCompany(
        sessionId,
        '00000000-0000-7000-8000-000000000000',
      ),
    ).resolves.toBeNull();
  });

  it('findCompletedInCommunities includes every performer in scope, excluding drafts', async () => {
    const communityId = await createCommunity('scoped-lists');
    const templateId = await createActiveTemplate('scoped-lists');
    const performerU = await createUser('scoped-lists-u');
    const performerW = await createUser('scoped-lists-w');

    const completedByU = await createSession(
      communityId,
      templateId,
      performerU,
      'completed',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const completedByW = await createSession(
      communityId,
      templateId,
      performerW,
      'completed',
      new Date('2026-01-02T00:00:00.000Z'),
    );
    await createSession(communityId, templateId, performerU, 'draft', null);

    const communityHistory = await repository.findCompletedInCommunities([
      communityId,
    ]);
    const communityHistoryIds = communityHistory.map((s) => s.id);
    expect(communityHistoryIds).toContain(completedByU);
    expect(communityHistoryIds).toContain(completedByW);
    expect(communityHistoryIds).toHaveLength(2);
  });

  it('findCompletedInCommunities orders completedAt DESC, id DESC — deterministic direction', async () => {
    const communityId = await createCommunity('ordering-parity');
    const templateId = await createActiveTemplate('ordering-parity');
    const performedById = await createUser('ordering-parity');

    const earlier = await createSession(
      communityId,
      templateId,
      performedById,
      'completed',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const later = await createSession(
      communityId,
      templateId,
      performedById,
      'completed',
      new Date('2026-01-02T00:00:00.000Z'),
    );

    const communityHistory = await repository.findCompletedInCommunities([
      communityId,
    ]);

    expect(communityHistory.map((s) => s.id)).toEqual([later, earlier]);
  });

  // review-history-company-scope/tasks.md 3.6: updated for the reversal —
  // `findCompletedForPerformerInCommunities`/
  // `findCompletedByIdForPerformerInCommunities` are DELETED from the port
  // (design.md Decision 6/7), replaced by the technician's unconditional
  // `findCompletedForPerformer`/`findCompletedByIdForPerformer` pair. No
  // orphaned methods survive on this port past this PR.
  it('no repository port method returns a session or a list from an identifier alone — spec: "No unscoped session read exists"', () => {
    const methodNames = Object.getOwnPropertyNames(
      PrismaReviewSessionRepository.prototype,
    ).filter((name) => name !== 'constructor' && !name.startsWith('_'));

    // Every by-id/list read method's own first (or only identifying)
    // parameter set MUST carry a performer, community or company scope
    // alongside any bare identifier — asserted here by enumeration rather
    // than by type inspection, mirroring the spec scenario's own wording.
    //
    // review-history-per-element/tasks.md 1.6: grows by exactly the 4 new
    // `findCompletedEntriesForElement*` methods (design.md Decision 1/2).
    // The private join helper `joinCompletedEntriesForElement` is
    // deliberately named WITHOUT a `find` prefix so it never enters this
    // list in the first place.
    const readMethods = methodNames.filter((name) => name.startsWith('find'));
    expect(readMethods.sort()).toEqual(
      [
        'findByIdForPerformer',
        'findDraftsByPerformer',
        'findCompletedInCommunities',
        'findCompletedByIdInCommunities',
        'findCompletedForPerformer',
        'findCompletedByIdForPerformer',
        'findCompletedForCompany',
        'findCompletedByIdForCompany',
        'findCompletedAcrossInstallation',
        'findCompletedByIdAcrossInstallation',
        'findCompletedEntriesForElementForPerformer',
        'findCompletedEntriesForElementInCommunities',
        'findCompletedEntriesForElementForCompany',
        'findCompletedEntriesForElementAcrossInstallation',
      ].sort(),
    );
    expect(readMethods).not.toContain('findById');
  });

  // review-history-admin-scope design.md Decision 2, mechanism 2, tasks.md
  // 1.10: a second production caller of the unscoped pair must fail the
  // build. Scan `apps/api/src/**/*.ts`, excluding `*.spec.ts` and
  // `**/testing/**` (test doubles are not production callers — this is a
  // textual scan, so InMemoryReviewSessionRepository would otherwise match
  // as a false positive purely for IMPLEMENTING the port, the same reason
  // *.spec.ts files are excluded), for both new method names. Precedent for
  // reading source from a test: review-session-migration.integration.spec.ts.
  //
  // THIS GUARD VERIFIES EXACTLY 3 PRODUCTION CALL SITES (see
  // `expectedSuffixes` below) — the port, the Prisma adapter and the
  // service. It does NOT, and structurally cannot, cover
  // `in-memory-review-session.repository.ts`: that file lives under
  // `**/testing/**`, which this scan deliberately excludes (test doubles
  // are not production callers — the same reason `*.spec.ts` is excluded —
  // and without the exclusion the in-memory adapter would match as a false
  // positive purely for IMPLEMENTING the port). The in-memory adapter's own
  // correct implementation of the pair is proven separately, by task 1.8's
  // unit tests, not by this guard.
  //
  // NOTE (deviation from design.md's literal wording — reported to
  // orchestrator per apply-progress): design.md Decision 2 mechanism 2 and
  // tasks.md 1.10 both describe the expected match set as "the port, BOTH
  // adapters and review-history-access.service.ts" (4 files). That wording
  // and the "exclude `**/testing/**`" instruction are mutually exclusive
  // given where the in-memory adapter lives, so they cannot both be
  // followed literally. This test follows the exclusion (matching every
  // other guard test's `**/testing/**` convention) and the 3-file count
  // above is what it actually asserts.
  it('findCompletedAcrossInstallation/findCompletedByIdAcrossInstallation appear only in the port, the Prisma adapter and the service — no other production file', () => {
    const srcRoot = join(__dirname, '..', '..', '..', '..');
    const entries = readdirSync(srcRoot, {
      recursive: true,
      withFileTypes: true,
    });

    const candidateFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .filter((entry) => !entry.name.endsWith('.spec.ts'))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
      .filter((filePath) => !filePath.split(sep).includes('testing'));

    const methodNamePattern =
      /findCompletedAcrossInstallation|findCompletedByIdAcrossInstallation/;

    const matchingFiles = candidateFiles
      .filter((filePath) =>
        methodNamePattern.test(readFileSync(filePath, 'utf8')),
      )
      .map((filePath) => filePath.split(sep).join('/'));

    const expectedSuffixes = [
      'application/ports/review-session.repository.port.ts',
      'infrastructure/persistence/prisma-review-session.repository.ts',
      'application/services/review-history-access.service.ts',
    ];

    expect(matchingFiles).toHaveLength(expectedSuffixes.length);
    for (const suffix of expectedSuffixes) {
      expect(matchingFiles.some((f) => f.endsWith(suffix))).toBe(true);
    }
  });
});

// review-history-company-scope/design.md Decision 3/4/6/9, tasks.md
// 2.9/2.11/2.12: the manager's company-scoped pair against real Postgres.
describe('PrismaReviewSessionRepository — findCompletedForCompany/findCompletedByIdForCompany (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;
  let maintenanceCompanyRepository: PrismaMaintenanceCompanyRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    templateRepository = new PrismaReviewTemplateRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    maintenanceCompanyRepository = new PrismaMaintenanceCompanyRepository(
      prisma,
    );
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

  const createCompany = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await maintenanceCompanyRepository.create(
      new MaintenanceCompany({
        id,
        name: uniqueName(label),
        taxId: uniqueName('tax'),
        contactInfo: 'contact@example.com',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (
    label: string,
    maintenanceCompanyId: string | null,
  ): Promise<string> => {
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
        maintenanceCompanyId,
      }),
    );
    return id;
  };

  const createActiveTemplate = async (label: string): Promise<string> => {
    await prisma.reviewTemplate.deleteMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
        status: 'draft',
      },
    });

    const id = idGenerator.generate();
    await templateRepository.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
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
        frequency: 'SEMIANNUAL',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
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

  // create() takes a domain ReviewSession — performedByCompanyId is a plain
  // constructor field (design.md Decision 1), so tests can set it directly
  // without going through OpenReviewSessionUseCase.
  const createSession = async (params: {
    communityId: string;
    templateId: string;
    performedById: string;
    performedByCompanyId: string | null;
    status: 'draft' | 'completed';
    completedAt?: Date;
  }): Promise<string> => {
    const id = idGenerator.generate();
    await repository.create(
      new ReviewSession({
        id,
        communityId: params.communityId,
        templateId: params.templateId,
        performedById: params.performedById,
        performedByCompanyId: params.performedByCompanyId,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );
    if (params.status === 'completed') {
      const completed = await repository.complete(
        id,
        params.completedAt ?? new Date(),
      );
      expect(completed).toBe(true);
      // complete() never writes performedByCompanyId — reassert directly on
      // the row for this test fixture, mirroring the migration backfill's
      // own direct-SQL pattern (design.md Decision 1: no write path other
      // than create() ever sets this column).
      await prisma.reviewSession.update({
        where: { id },
        data: { performedByCompanyId: params.performedByCompanyId },
      });
    }
    return id;
  };

  it('findCompletedForCompany/findCompletedByIdForCompany never return another company\'s or a null-company row — spec: "Another company\'s sessions never appear" / "A session with no attributed company appears nowhere"', async () => {
    const communityId = await createCommunity('company-scope');
    const templateId = await createActiveTemplate('company-scope');
    const companyA = await createCompany('company-scope-a');
    const companyB = await createCompany('company-scope-b');
    const performerA = await createUser('company-scope-performer-a', companyA);
    const performerB = await createUser('company-scope-performer-b', companyB);
    const performerNone = await createUser(
      'company-scope-performer-none',
      null,
    );

    const sessionA = await createSession({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: companyA,
      status: 'completed',
    });
    const sessionB = await createSession({
      communityId,
      templateId,
      performedById: performerB,
      performedByCompanyId: companyB,
      status: 'completed',
    });
    const sessionNoCompany = await createSession({
      communityId,
      templateId,
      performedById: performerNone,
      performedByCompanyId: null,
      status: 'completed',
    });

    const listForA = await repository.findCompletedForCompany(companyA);
    expect(listForA.map((s) => s.id)).toEqual([sessionA]);
    expect(listForA.map((s) => s.id)).not.toContain(sessionB);
    expect(listForA.map((s) => s.id)).not.toContain(sessionNoCompany);

    await expect(
      repository.findCompletedByIdForCompany(sessionB, companyA),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedByIdForCompany(sessionNoCompany, companyA),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedByIdForCompany(sessionA, companyA),
    ).resolves.not.toBeNull();
  });

  it('findCompletedForCompany orders completedAt DESC, id DESC — identical direction to the other list methods', async () => {
    const communityId = await createCommunity('company-scope-ordering');
    const templateId = await createActiveTemplate('company-scope-ordering');
    const companyId = await createCompany('company-scope-ordering');
    const performedById = await createUser('company-scope-ordering', companyId);

    const earlier = await createSession({
      communityId,
      templateId,
      performedById,
      performedByCompanyId: companyId,
      status: 'completed',
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const later = await createSession({
      communityId,
      templateId,
      performedById,
      performedByCompanyId: companyId,
      status: 'completed',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await repository.findCompletedForCompany(companyId);

    expect(result.map((s) => s.id)).toEqual([later, earlier]);
  });

  // spec: "The company scope never joins to the performer's current
  // company" (design.md Decision 9) — a performer transferred to a
  // DIFFERENT company after the session completed must still surface under
  // the session's OWN frozen `performedByCompanyId`, never the performer's
  // now-current one.
  it("matches the session's own performedByCompanyId only — never a join through performedById -> User.maintenanceCompanyId", async () => {
    const communityId = await createCommunity('company-scope-frozen');
    const templateId = await createActiveTemplate('company-scope-frozen');
    const originalCompany = await createCompany('company-scope-frozen-orig');
    const newCompany = await createCompany('company-scope-frozen-new');
    const performerId = await createUser(
      'company-scope-frozen',
      originalCompany,
    );

    const sessionId = await createSession({
      communityId,
      templateId,
      performedById: performerId,
      performedByCompanyId: originalCompany,
      status: 'completed',
    });

    // Transfer the performer to a different company AFTER completion.
    await prisma.user.update({
      where: { id: performerId },
      data: { maintenanceCompanyId: newCompany },
    });

    const staysWithOriginal =
      await repository.findCompletedForCompany(originalCompany);
    expect(staysWithOriginal.map((s) => s.id)).toContain(sessionId);

    const notWithNew = await repository.findCompletedForCompany(newCompany);
    expect(notWithNew.map((s) => s.id)).not.toContain(sessionId);

    await expect(
      repository.findCompletedByIdForCompany(sessionId, originalCompany),
    ).resolves.not.toBeNull();
    await expect(
      repository.findCompletedByIdForCompany(sessionId, newCompany),
    ).resolves.toBeNull();
  });
});

// review-history-admin-scope design.md Decision 1/2, tasks.md 1.11/1.12:
// the SYSTEM_ADMIN's unscoped pair against real Postgres — rows across
// several companies and communities, including deactivated/soft-deleted
// context (which MUST NOT hide the row, unlike every other scope), and the
// empty-installation case.
describe('PrismaReviewSessionRepository — findCompletedAcrossInstallation/findCompletedByIdAcrossInstallation (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;
  let maintenanceCompanyRepository: PrismaMaintenanceCompanyRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    templateRepository = new PrismaReviewTemplateRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    maintenanceCompanyRepository = new PrismaMaintenanceCompanyRepository(
      prisma,
    );
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

  const createCompany = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await maintenanceCompanyRepository.create(
      new MaintenanceCompany({
        id,
        name: uniqueName(label),
        taxId: uniqueName('tax'),
        contactInfo: 'contact@example.com',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (
    label: string,
    maintenanceCompanyId: string | null = null,
  ): Promise<string> => {
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
        maintenanceCompanyId,
      }),
    );
    return id;
  };

  const createActiveTemplate = async (label: string): Promise<string> => {
    await prisma.reviewTemplate.deleteMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
        status: 'draft',
      },
    });

    const id = idGenerator.generate();
    await templateRepository.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
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
        frequency: 'SEMIANNUAL',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
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

  const createSession = async (params: {
    communityId: string;
    templateId: string;
    performedById: string;
    performedByCompanyId: string | null;
    status: 'draft' | 'completed';
    completedAt?: Date;
  }): Promise<string> => {
    const id = idGenerator.generate();
    await repository.create(
      new ReviewSession({
        id,
        communityId: params.communityId,
        templateId: params.templateId,
        performedById: params.performedById,
        performedByCompanyId: params.performedByCompanyId,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );
    if (params.status === 'completed') {
      const completed = await repository.complete(
        id,
        params.completedAt ?? new Date(),
      );
      expect(completed).toBe(true);
      await prisma.reviewSession.update({
        where: { id },
        data: { performedByCompanyId: params.performedByCompanyId },
      });
    }
    return id;
  };

  // tasks.md 1.11: rows across ≥2 companies and ≥2 communities, including
  // one whose community is deactivated/soft-deleted and one whose
  // maintenance company is soft-deleted — never a draft; completedAt DESC,
  // id DESC.
  it('returns every completed session across ≥2 companies and ≥2 communities, including deactivated/soft-deleted context, never a draft', async () => {
    const communityX = await createCommunity('admin-scope-x');
    const communityY = await createCommunity('admin-scope-y');
    const templateId = await createActiveTemplate('admin-scope');
    const companyA = await createCompany('admin-scope-a');
    const companyB = await createCompany('admin-scope-b');
    const performerA = await createUser('admin-scope-performer-a', companyA);
    const performerB = await createUser('admin-scope-performer-b', companyB);

    const sessionOnX = await createSession({
      communityId: communityX,
      templateId,
      performedById: performerA,
      performedByCompanyId: companyA,
      status: 'completed',
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const sessionOnY = await createSession({
      communityId: communityY,
      templateId,
      performedById: performerB,
      performedByCompanyId: companyB,
      status: 'completed',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    await createSession({
      communityId: communityX,
      templateId,
      performedById: performerA,
      performedByCompanyId: companyA,
      status: 'draft',
    });

    // Deactivate community Y, soft-delete performer A's user (so company A
    // carries no active user and can itself be soft-deleted next), then
    // soft-delete company A — all AFTER their sessions completed. Spec:
    // "Visibility MUST NOT be reduced by deleted or deactivated context —
    // the one scope with no exceptions".
    const communityYDeleted =
      await communityRepository.softDeleteById(communityY);
    expect(communityYDeleted).toBe(true);
    await userRepository.softDeleteById(performerA);
    const companyASoftDeleted =
      await maintenanceCompanyRepository.softDeleteById(companyA);
    expect(companyASoftDeleted).toBe(true);

    // This suite reuses the app's own dev database with no per-test
    // isolation (same caveat as the other describe blocks in this file) —
    // findCompletedAcrossInstallation is, BY DESIGN, unscoped, so it also
    // returns every OTHER completed session created by sibling tests in
    // this same run. Assertions below use `toContain`/relative-order
    // checks on the two ids this test created, never exact length or
    // full-array equality.
    const result = await repository.findCompletedAcrossInstallation();
    const resultIds = result.map((s) => s.id);

    expect(resultIds).toContain(sessionOnX);
    expect(resultIds).toContain(sessionOnY);
    expect(resultIds.indexOf(sessionOnY)).toBeLessThan(
      resultIds.indexOf(sessionOnX),
    );

    // The by-id read must also survive the deactivation/soft-deletion.
    await expect(
      repository.findCompletedByIdAcrossInstallation(sessionOnX),
    ).resolves.not.toBeNull();
    await expect(
      repository.findCompletedByIdAcrossInstallation(sessionOnY),
    ).resolves.not.toBeNull();
  });

  // tasks.md 1.12: this suite reuses the app's own dev database with no
  // per-test isolation, so a strictly-empty installation can never be
  // observed here — other describe blocks in the same run routinely leave
  // behind completed sessions. `expect.any(Array)` against that shared
  // state is NOT a true empty-list assertion (it would pass whether the
  // installation is empty or not) — this test verifies only that the call
  // resolves rather than rejects against real Postgres, i.e. the query
  // itself is well-formed. The actual empty-list contract ("no seeded
  // completed sessions -> []") is covered where it CAN be asserted
  // honestly: `in-memory-review-session.repository.spec.ts`'s "a draft
  // never surfaces in the list or the by-id read" test, which seeds zero
  // completed sessions and asserts `resolves.toEqual([])`.
  it('resolves without throwing against real Postgres (true empty-list contract covered by the in-memory unit test)', async () => {
    await expect(repository.findCompletedAcrossInstallation()).resolves.toEqual(
      expect.any(Array),
    );
  });
});

// review-history-per-element/design.md Decision 1/2, tasks.md 1.7: the four
// `findCompletedEntriesForElement*` methods against real Postgres — the
// entry-first two-query join, a draft session and a sibling element's entry
// both excluded, and the fail-closed empty-scope case.
describe('PrismaReviewSessionRepository — findCompletedEntriesForElement* (integration, review-history-per-element)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let templateRepository: PrismaReviewTemplateRepository;
  let userRepository: PrismaUserRepository;
  let maintenanceCompanyRepository: PrismaMaintenanceCompanyRepository;
  let elementRepository: PrismaInspectableElementRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    templateRepository = new PrismaReviewTemplateRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    maintenanceCompanyRepository = new PrismaMaintenanceCompanyRepository(
      prisma,
    );
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

  const createCompany = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await maintenanceCompanyRepository.create(
      new MaintenanceCompany({
        id,
        name: uniqueName(label),
        taxId: uniqueName('tax'),
        contactInfo: 'contact@example.com',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (
    label: string,
    maintenanceCompanyId: string | null = null,
  ): Promise<string> => {
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
        maintenanceCompanyId,
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

  // Creates a session (draft or completed) with one recorded entry for
  // `inspectableElementId`. Mirrors the upsertEntry describe block's own
  // draft-then-complete sequence — upsertEntry() only accepts a draft
  // session (design.md Decision 8's `WHERE status='draft'` guard).
  const createSessionWithEntry = async (params: {
    communityId: string;
    templateId: string;
    performedById: string;
    performedByCompanyId: string | null;
    inspectableElementId: string;
    status: 'draft' | 'completed';
    recordedAt?: Date;
    reviewed?: boolean;
  }): Promise<{ sessionId: string; entryId: string }> => {
    const sessionId = idGenerator.generate();
    await repository.create(
      new ReviewSession({
        id: sessionId,
        communityId: params.communityId,
        templateId: params.templateId,
        performedById: params.performedById,
        performedByCompanyId: params.performedByCompanyId,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );

    const entryId = idGenerator.generate();
    const reviewed = params.reviewed ?? true;
    const entry = reviewed
      ? ElementReviewEntry.reviewed({
          id: entryId,
          reviewSessionId: sessionId,
          inspectableElementId: params.inspectableElementId,
          answers: [
            new QuestionAnswer({
              id: idGenerator.generate(),
              elementReviewEntryId: 'placeholder',
              questionId: idGenerator.generate(),
              answer: 'YES',
            }),
          ],
          recordedAt: params.recordedAt ?? new Date(),
        })
      : ElementReviewEntry.unreviewed({
          id: entryId,
          reviewSessionId: sessionId,
          inspectableElementId: params.inspectableElementId,
          observations: 'Not accessible this cycle',
          recordedAt: params.recordedAt ?? new Date(),
        });
    await repository.upsertEntry(entry);

    if (params.status === 'completed') {
      const completed = await repository.complete(sessionId, new Date());
      expect(completed).toBe(true);
      await prisma.reviewSession.update({
        where: { id: sessionId },
        data: { performedByCompanyId: params.performedByCompanyId },
      });
    }

    return { sessionId, entryId };
  };

  it("findCompletedEntriesForElementForPerformer returns exactly the caller's own completed entries for this element — excludes the other performer, a draft and a sibling element", async () => {
    const communityId = await createCommunity('element-history-performer');
    const templateId = await createActiveTemplate('element-history-performer');
    const performerA = await createUser('element-history-performer-a');
    const performerB = await createUser('element-history-performer-b');
    const elementId = await createElement(
      communityId,
      'element-history-performer',
    );
    const siblingElementId = await createElement(
      communityId,
      'element-history-performer-sibling',
    );

    const { entryId: entryA } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'completed',
    });
    await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerB,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'completed',
    });
    // Draft by performer A on the SAME element — must never surface.
    await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'draft',
    });
    // Performer A's entry for a DIFFERENT element — must never surface.
    await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: siblingElementId,
      status: 'completed',
    });

    const rows = await repository.findCompletedEntriesForElementForPerformer(
      elementId,
      performerA,
    );

    expect(rows.map((r) => r.entryId)).toEqual([entryA]);
  });

  it('findCompletedEntriesForElementInCommunities returns entries from every performer in an in-scope community — excludes an out-of-scope community', async () => {
    const communityInScope = await createCommunity(
      'element-history-community-in',
    );
    const communityOutOfScope = await createCommunity(
      'element-history-community-out',
    );
    const templateId = await createActiveTemplate('element-history-community');
    const performerA = await createUser('element-history-community-a');
    const performerB = await createUser('element-history-community-b');
    const elementId = await createElement(
      communityInScope,
      'element-history-community',
    );
    const outOfScopeElementId = await createElement(
      communityOutOfScope,
      'element-history-community-out',
    );

    const { entryId: entryA } = await createSessionWithEntry({
      communityId: communityInScope,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'completed',
    });
    const { entryId: entryB } = await createSessionWithEntry({
      communityId: communityInScope,
      templateId,
      performedById: performerB,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'completed',
    });
    await createSessionWithEntry({
      communityId: communityOutOfScope,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: outOfScopeElementId,
      status: 'completed',
    });

    const rows = await repository.findCompletedEntriesForElementInCommunities(
      elementId,
      [communityInScope],
    );

    expect(rows.map((r) => r.entryId).sort()).toEqual([entryA, entryB].sort());
  });

  it('communityIds = [] resolves to an empty list — the fail-closed empty-scope case', async () => {
    const communityId = await createCommunity('element-history-empty-scope');
    const templateId = await createActiveTemplate(
      'element-history-empty-scope',
    );
    const performerA = await createUser('element-history-empty-scope-a');
    const elementId = await createElement(
      communityId,
      'element-history-empty-scope',
    );
    await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: elementId,
      status: 'completed',
    });

    await expect(
      repository.findCompletedEntriesForElementInCommunities(elementId, []),
    ).resolves.toEqual([]);
  });

  it("findCompletedEntriesForElementForCompany returns only the caller's own company's entries", async () => {
    const communityId = await createCommunity('element-history-company');
    const templateId = await createActiveTemplate('element-history-company');
    const companyA = await createCompany('element-history-company-a');
    const companyB = await createCompany('element-history-company-b');
    const performerA = await createUser(
      'element-history-company-performer-a',
      companyA,
    );
    const performerB = await createUser(
      'element-history-company-performer-b',
      companyB,
    );
    const elementId = await createElement(
      communityId,
      'element-history-company',
    );

    const { entryId: entryA } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: companyA,
      inspectableElementId: elementId,
      status: 'completed',
    });
    await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerB,
      performedByCompanyId: companyB,
      inspectableElementId: elementId,
      status: 'completed',
    });

    const rows = await repository.findCompletedEntriesForElementForCompany(
      elementId,
      companyA,
    );

    expect(rows.map((r) => r.entryId)).toEqual([entryA]);
  });

  it('findCompletedEntriesForElementAcrossInstallation returns entries across every performer and company', async () => {
    const communityId = await createCommunity('element-history-admin');
    const templateId = await createActiveTemplate('element-history-admin');
    const companyA = await createCompany('element-history-admin-a');
    const companyB = await createCompany('element-history-admin-b');
    const performerA = await createUser(
      'element-history-admin-performer-a',
      companyA,
    );
    const performerB = await createUser(
      'element-history-admin-performer-b',
      companyB,
    );
    const elementId = await createElement(communityId, 'element-history-admin');

    const { entryId: entryA } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: companyA,
      inspectableElementId: elementId,
      status: 'completed',
    });
    const { entryId: entryB } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerB,
      performedByCompanyId: companyB,
      inspectableElementId: elementId,
      status: 'completed',
    });

    const rows =
      await repository.findCompletedEntriesForElementAcrossInstallation(
        elementId,
      );

    expect(rows.map((r) => r.entryId).sort()).toEqual([entryA, entryB].sort());
  });

  // design.md Decision 5 step 4: the application layer derives `reviewed`
  // as `observations === null` — this integration test proves that
  // derivation agrees with the domain invariant (`answers.length > 0`) for
  // both a reviewed and an unreviewed entry, against real Postgres rows.
  it('reviewed derivation (observations === null) agrees with answers.length > 0 for a reviewed and an unreviewed entry', async () => {
    const communityId = await createCommunity('element-history-reviewed');
    const templateId = await createActiveTemplate('element-history-reviewed');
    const performerA = await createUser('element-history-reviewed-a');
    const reviewedElementId = await createElement(
      communityId,
      'element-history-reviewed',
    );
    const unreviewedElementId = await createElement(
      communityId,
      'element-history-reviewed-unreviewed',
    );

    const { entryId: reviewedEntryId } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: reviewedElementId,
      status: 'completed',
      reviewed: true,
    });
    const { entryId: unreviewedEntryId } = await createSessionWithEntry({
      communityId,
      templateId,
      performedById: performerA,
      performedByCompanyId: null,
      inspectableElementId: unreviewedElementId,
      status: 'completed',
      reviewed: false,
    });

    const reviewedRows =
      await repository.findCompletedEntriesForElementForPerformer(
        reviewedElementId,
        performerA,
      );
    const unreviewedRows =
      await repository.findCompletedEntriesForElementForPerformer(
        unreviewedElementId,
        performerA,
      );
    const reviewedRow = reviewedRows.find((r) => r.entryId === reviewedEntryId);
    const unreviewedRow = unreviewedRows.find(
      (r) => r.entryId === unreviewedEntryId,
    );
    expect(reviewedRow).toBeDefined();
    expect(unreviewedRow).toBeDefined();

    const reviewedAnswerCount = await prisma.questionAnswer.count({
      where: { elementReviewEntryId: reviewedEntryId },
    });
    const unreviewedAnswerCount = await prisma.questionAnswer.count({
      where: { elementReviewEntryId: unreviewedEntryId },
    });

    expect(reviewedRow!.observations === null).toBe(reviewedAnswerCount > 0);
    expect(unreviewedRow!.observations === null).toBe(
      unreviewedAnswerCount > 0,
    );
  });
});

// review-history-per-element/design.md Decision 3, tasks.md 1.2/1.7: the
// hand-written additive index migration against real Postgres — presence,
// the pre-existing objects it must not disturb, and a complete DROP INDEX
// rollback simulated inside a transaction that always rolls back (same
// pattern as review-session-migration.integration.spec.ts's
// performedByCompanyId down-migration test).
describe('ElementReviewEntry_inspectableElementId_idx migration (integration, review-history-per-element)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('the new index, the pre-existing @@unique index, the hand-written CHECK and both hand-written FKs are all intact', async () => {
    const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'ElementReviewEntry'
        AND indexname IN (
          'ElementReviewEntry_inspectableElementId_idx',
          'ElementReviewEntry_reviewSessionId_inspectableElementId_key'
        )
    `;
    expect(indexRows.map((r) => r.indexname).sort()).toEqual(
      [
        'ElementReviewEntry_inspectableElementId_idx',
        'ElementReviewEntry_reviewSessionId_inspectableElementId_key',
      ].sort(),
    );

    const checkRows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname = 'ElementReviewEntry_observations_not_blank'
    `;
    expect(checkRows).toHaveLength(1);

    const fkRows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'ElementReviewEntry_reviewSessionId_fkey',
        'ElementReviewEntry_inspectableElementId_fkey'
      )
    `;
    expect(fkRows.map((r) => r.conname).sort()).toEqual(
      [
        'ElementReviewEntry_reviewSessionId_fkey',
        'ElementReviewEntry_inspectableElementId_fkey',
      ].sort(),
    );
  });

  it('DROP INDEX is a complete, independent rollback — pre-migration state simulated inside a transaction that always rolls back', async () => {
    class RollbackSentinel extends Error {}

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`DROP INDEX "ElementReviewEntry_inspectableElementId_idx"`;

        const droppedRows = await tx.$queryRaw<Array<{ indexname: string }>>`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'ElementReviewEntry'
            AND indexname = 'ElementReviewEntry_inspectableElementId_idx'
        `;
        expect(droppedRows).toHaveLength(0);

        // The pre-existing @@unique index shares no definition with the
        // dropped one and must survive untouched.
        const uniqueIndexRows = await tx.$queryRaw<
          Array<{ indexname: string }>
        >`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'ElementReviewEntry'
            AND indexname = 'ElementReviewEntry_reviewSessionId_inspectableElementId_key'
        `;
        expect(uniqueIndexRows).toHaveLength(1);

        throw new RollbackSentinel();
      }),
    ).rejects.toThrow(RollbackSentinel);

    // The transaction above never committed — the index is exactly as it
    // was before this test ran, whether the in-transaction assertion
    // passed or failed.
    const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'ElementReviewEntry'
        AND indexname = 'ElementReviewEntry_inspectableElementId_idx'
    `;
    expect(indexRows).toHaveLength(1);
  });
});
