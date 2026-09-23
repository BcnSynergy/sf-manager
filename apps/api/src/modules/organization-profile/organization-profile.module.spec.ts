import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../shared/infrastructure/persistence/prisma.module';
import {
  ORGANIZATION_PROFILE_READER,
  OrganizationProfileReader,
} from './application/ports/organization-profile.reader.port';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  OrganizationProfileRepository,
} from './application/ports/organization-profile.repository.port';
import { OrganizationProfileModule } from './organization-profile.module';

// review-export/design.md Decision 3, tasks.md 3.1/3.3: ORGANIZATION_PROFILE_READER
// is bound via `useExisting: ORGANIZATION_PROFILE_REPOSITORY`, not a second
// adapter instance. This is worth a dedicated DI test because `useExisting`
// is a factory ALIAS in Nest, not a copy — an e2e override of
// ORGANIZATION_PROFILE_REPOSITORY (buildApp, PR 7) reaches
// ORGANIZATION_PROFILE_READER too, with no override of its own needed. If a
// future edit switched this to `useClass`/`useFactory` returning a new
// instance, that guarantee would silently break; asserting "one instance"
// is the only way to pin it down.
//
// Only .compile() is called (provider instantiation/DI resolution), never
// .init(), so this never reaches PrismaService.onModuleInit()'s $connect()
// and needs no real database connection — mirroring app.module.spec.ts.
describe('OrganizationProfileModule (DI)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolves ORGANIZATION_PROFILE_READER and ORGANIZATION_PROFILE_REPOSITORY to one instance', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, OrganizationProfileModule],
    }).compile();

    const reader = moduleRef.get<OrganizationProfileReader>(
      ORGANIZATION_PROFILE_READER,
    );
    const repository = moduleRef.get<OrganizationProfileRepository>(
      ORGANIZATION_PROFILE_REPOSITORY,
    );

    expect(reader).toBe(repository);
  });
});
