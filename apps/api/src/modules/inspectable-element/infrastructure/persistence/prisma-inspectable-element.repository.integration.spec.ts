import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { ELEMENT_CODE_ALPHABET } from '../../domain/element-code';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { Community } from '../../../community/domain/community.entity';
import { PrismaCommunityRepository } from '../../../community/infrastructure/persistence/prisma-community.repository';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../domain/errors/inspectable-element-not-found.error';
import { ElementCodeAlreadyExistsError } from '../../domain/errors/element-code-already-exists.error';
import { PrismaInspectableElementRepository } from './prisma-inspectable-element.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring prisma-maintenance-company.repository
// .integration.spec.ts. Reuses the app's own dev database (no dedicated
// test-database mechanism in this repo yet).
describe('PrismaInspectableElementRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaInspectableElementRepository;
  let communityRepository: PrismaCommunityRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaInspectableElementRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueLabel = (label: string) => `${label}-${randomUUID()}`;

  const uniqueCode = (): string => {
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += ELEMENT_CODE_ALPHABET[randomInt(0, ELEMENT_CODE_ALPHABET.length)];
    }
    return code;
  };

  const makeCommunity = (): Community =>
    new Community({
      id: idGenerator.generate(),
      name: uniqueLabel('community'),
      address: '1 Test St',
      locale: 'en',
      deletedAt: null,
    });

  const makeElement = (
    communityId: string,
    code?: string,
  ): InspectableElement =>
    new InspectableElement({
      id: idGenerator.generate(),
      communityId,
      elementType: 'EXTINGUISHER',
      name: uniqueLabel('element'),
      description: null,
      location: 'Lobby',
      installedAt: new Date('2026-01-15'),
      serialNumber: null,
      deletedAt: null,
      code: code ?? uniqueCode(),
    });

  // PR6 review: updateById()/softDeleteById()'s `where` includes the
  // deletedAt: null default filter, so a concurrent delete landing between
  // the use case's own findByIdInCommunity check and this write must not
  // silently no-op or throw a raw Prisma error — it must surface as the same
  // domain 404 the use case's own check would have thrown a moment later
  // (mirrors prisma-maintenance-company.repository.integration.spec.ts's
  // "PR8 review" regression test).
  it('updateById() throws InspectableElementNotFoundError for an already soft-deleted element', async () => {
    const community = makeCommunity();
    await communityRepository.create(community);
    const element = makeElement(community.id);
    await repository.create(element);
    await repository.softDeleteById(element.id);

    await expect(
      repository.updateById(element.id, { name: 'New Name' }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('softDeleteById() throws InspectableElementNotFoundError for an already soft-deleted element', async () => {
    const community = makeCommunity();
    await communityRepository.create(community);
    const element = makeElement(community.id);
    await repository.create(element);
    await repository.softDeleteById(element.id);

    await expect(repository.softDeleteById(element.id)).rejects.toThrow(
      InspectableElementNotFoundError,
    );
  });

  it('updateById() throws InspectableElementNotFoundError for a non-existent element id', async () => {
    await expect(
      repository.updateById(idGenerator.generate(), { name: 'New Name' }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  // Fresh-context review CRITICAL finding (PR3): under Prisma 7 with the
  // @prisma/adapter-pg driver adapter, a real P2002's `error.meta` has no
  // `target` field at all — the old `isCodeUniqueViolation()` implementation
  // that checked `error.meta.target` always returned false against a real
  // duplicate insert, so this domain mapping never actually fired outside
  // unit tests using a fake error shape. This test exercises the REAL
  // `InspectableElement_code_key` unique constraint against real Postgres
  // (design.md Testing Strategy: "Integration (api) | Prisma adapter | Real
  // duplicate insert -> ElementCodeAlreadyExistsError, not a raw P2002").
  it('create() throws ElementCodeAlreadyExistsError for a real duplicate code collision', async () => {
    const community = makeCommunity();
    await communityRepository.create(community);
    const sharedCode = uniqueCode();
    await repository.create(makeElement(community.id, sharedCode));

    await expect(
      repository.create(makeElement(community.id, sharedCode)),
    ).rejects.toThrow(ElementCodeAlreadyExistsError);
  });
});
