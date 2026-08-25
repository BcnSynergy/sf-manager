import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { Community } from '../../domain/community.entity';
import { PrismaCommunityRepository } from './prisma-community.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring prisma-user.repository.integration.spec.ts.
// Assumes DATABASE_URL points at a database already migrated with the
// community migration from PR 1 (20260825120000_add_community_and_assignments).
describe('PrismaCommunityRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaCommunityRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCommunityRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueName = (label: string) => `${label}-${randomUUID()}`;

  it('creates a community and finds it by id', async () => {
    const id = idGenerator.generate();
    const name = uniqueName('create-find');

    await repository.create(
      new Community({
        id,
        name,
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );

    const found = await repository.findById(id);

    expect(found).not.toBeNull();
    expect(found?.name).toBe(name);
    expect(found?.address).toBe('Carrer Major 1, Girona');
    expect(found?.locale).toBe('ca');
  });

  // tasks.md 5.2: findById excludes soft-deleted rows (ADR-010 default
  // filter), same pattern as PrismaUserRepository.findByEmail.
  it('excludes a soft-deleted community from findById (ADR-010 default filter)', async () => {
    const id = idGenerator.generate();

    await repository.create(
      new Community({
        id,
        name: uniqueName('soft-deleted'),
        address: 'Avinguda Diagonal 200, Barcelona',
        locale: 'es',
        deletedAt: new Date(),
      }),
    );

    const found = await repository.findById(id);

    expect(found).toBeNull();
  });

  // tasks.md 5.2: findAll excludes soft-deleted rows by default.
  it('findAll() excludes soft-deleted communities', async () => {
    const activeId = idGenerator.generate();
    const deletedId = idGenerator.generate();
    const activeName = uniqueName('find-all-active');
    const deletedName = uniqueName('find-all-deleted');

    await repository.create(
      new Community({
        id: activeId,
        name: activeName,
        address: 'Plaça Nova 3, Girona',
        locale: 'en',
        deletedAt: null,
      }),
    );
    await repository.create(
      new Community({
        id: deletedId,
        name: deletedName,
        address: 'Plaça Nova 4, Girona',
        locale: 'en',
        deletedAt: new Date(),
      }),
    );

    const found = await repository.findAll();
    const foundIds = found.map((community) => community.id);

    expect(foundIds).toContain(activeId);
    expect(found.some((community) => community.name === deletedName)).toBe(
      false,
    );
  });

  it('updateById() partially updates name/address/locale', async () => {
    const id = idGenerator.generate();

    await repository.create(
      new Community({
        id,
        name: uniqueName('update-by-id'),
        address: 'Carrer Vell 10, Figueres',
        locale: 'es',
        deletedAt: null,
      }),
    );

    const newAddress = 'Carrer Nou 20, Figueres';
    await repository.updateById(id, { address: newAddress });

    const updated = await repository.findById(id);
    expect(updated?.address).toBe(newAddress);
    // name/locale untouched by the partial update.
    expect(updated?.locale).toBe('es');
  });

  it('softDeleteById() sets deletedAt so the community is excluded from findById()', async () => {
    const id = idGenerator.generate();

    await repository.create(
      new Community({
        id,
        name: uniqueName('soft-delete-by-id'),
        address: 'Carrer Ample 5, Olot',
        locale: 'ca',
        deletedAt: null,
      }),
    );

    await repository.softDeleteById(id);

    expect(await repository.findById(id)).toBeNull();
  });
});
