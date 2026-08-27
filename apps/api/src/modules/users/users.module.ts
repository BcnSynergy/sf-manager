import { Module } from '@nestjs/common';
import { MAINTENANCE_COMPANY_LOOKUP } from './application/ports/maintenance-company-lookup.port';
import { USER_REPOSITORY } from './application/ports/user.repository.port';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { PrismaMaintenanceCompanyLookup } from './infrastructure/persistence/prisma-maintenance-company-lookup.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UsersController } from './presentation/users.controller';

// design.md Decision 1 note (PR 3): this module now also registers the
// admin-only /users CRUD surface (PR 6) — controller + the 4 use cases
// built in PR 5. USER_REPOSITORY stays exported for `auth` (LoginUseCase).
//
// maintenance-company design.md Decision 4: MAINTENANCE_COMPANY_LOOKUP is
// bound here, to an adapter that reads PrismaService directly (the
// `@Global()` PrismaModule) — this module imports NOTHING from
// `maintenance-company`. `MaintenanceCompanyModule` is the one that imports
// `UsersModule` (for USER_REPOSITORY), never the other way around; that
// asymmetry is what keeps the Nest DI graph acyclic without `forwardRef()`.
@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: MAINTENANCE_COMPANY_LOOKUP,
      useClass: PrismaMaintenanceCompanyLookup,
    },
    CreateUserUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    DeactivateUserUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
