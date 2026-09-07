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
import { ReviewSession } from '../../domain/review-session.entity';
import { OpenDraftAlreadyExistsError } from '../../domain/errors/open-draft-already-exists.error';
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
