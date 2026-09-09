import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { PrismaCommunityRepository } from '../../../community/infrastructure/persistence/prisma-community.repository';
import { Community } from '../../../community/domain/community.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { PrismaReviewSessionRepository } from './prisma-review-session.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres instance (design.md Decision 1 —
// "no repository method, use case or route ever writes it again"). tasks.md
// 1.13: enumerates the write paths reachable on ReviewSessionRepository
// (complete, discardDraft) and asserts NEITHER changes, clears or writes
// performedByCompanyId on a session, including a completed one.
describe('ReviewSession.performedByCompanyId — no write path beyond create() ever touches it (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewSessionRepository;
  let communityRepository: PrismaCommunityRepository;
  let userRepository: PrismaUserRepository;
  let companyId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewSessionRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);

    companyId = idGenerator.generate();
    await prisma.maintenanceCompany.create({
      data: {
        id: companyId,
        name: `Attribution write-path co ${randomUUID()}`,
        taxId: `tax-${randomUUID()}`,
        contactInfo: 'ops@example.com',
        deletedAt: null,
      },
    });
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
        maintenanceCompanyId: companyId,
      }),
    );
    return id;
  };

  // This suite only needs a ReviewTemplate row to exist as a valid FK
  // target for ReviewSession.templateId — not a real activation flow. A raw
  // `create()` with status 'retired' (unconstrained by either of the
  // partial-unique "one active/draft per lineage" indexes) and a randomized
  // version sidesteps the shared-lineage contention other integration spec
  // files in this same suite already accept as a known limitation (their
  // own "no per-test isolation" comments) — deliberately NOT reusing the
  // EXTINGUISHER lineage/frequency combinations those files already own.
  const createTemplate = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.reviewTemplate.create({
      data: {
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'SEMIANNUAL',
        name: uniqueName(label),
        version: Math.floor(Math.random() * 1_000_000_000),
        status: 'retired',
        draftQuestionIds: [],
        deletedAt: null,
      },
    });
    return id;
  };

  it('complete() leaves the attributed company unchanged on the row', async () => {
    const communityId = await createCommunity('complete-preserves-attribution');
    const templateId = await createTemplate('complete-preserves-attribution');
    const performedById = await createUser('complete-preserves-attribution');

    const session = new ReviewSession({
      id: idGenerator.generate(),
      communityId,
      templateId,
      performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
      performedByCompanyId: companyId,
    });
    await repository.create(session);

    const completed = await repository.complete(session.id, new Date());
    expect(completed).toBe(true);

    const row = await prisma.reviewSession.findUnique({
      where: { id: session.id },
      select: { performedByCompanyId: true, status: true },
    });
    expect(row?.status).toBe('completed');
    expect(row?.performedByCompanyId).toBe(companyId);
  });

  it('discardDraft() removes the row entirely — no residual attribution write is even possible', async () => {
    const communityId = await createCommunity('discard-no-attribution-write');
    const templateId = await createTemplate('discard-no-attribution-write');
    const performedById = await createUser('discard-no-attribution-write');

    const session = new ReviewSession({
      id: idGenerator.generate(),
      communityId,
      templateId,
      performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
      performedByCompanyId: companyId,
    });
    await repository.create(session);

    const discarded = await repository.discardDraft(session.id);
    expect(discarded).toBe(true);

    const row = await prisma.reviewSession.findUnique({
      where: { id: session.id },
    });
    expect(row).toBeNull();
  });

  // spec.md "A performer with no company yields an absent attribution" +
  // Decision 1: create() itself, the only write path, still needs to accept
  // an explicit null without error.
  it('create() persists an explicit null attribution for a performer with no company', async () => {
    const communityId = await createCommunity('null-attribution-create');
    const templateId = await createTemplate('null-attribution-create');
    const performedById = idGenerator.generate();
    await userRepository.create(
      new User({
        id: performedById,
        email: `${uniqueName('null-attribution-create')}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'COMMUNITY_REPRESENTATIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        maintenanceCompanyId: null,
      }),
    );

    const session = new ReviewSession({
      id: idGenerator.generate(),
      communityId,
      templateId,
      performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
      performedByCompanyId: null,
    });
    await repository.create(session);

    const row = await prisma.reviewSession.findUnique({
      where: { id: session.id },
      select: { performedByCompanyId: true },
    });
    expect(row?.performedByCompanyId).toBeNull();
  });
});
