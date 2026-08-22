import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './application/ports/user.repository.port';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UsersController } from './presentation/users.controller';

// design.md Decision 1 note (PR 3): this module now also registers the
// admin-only /users CRUD surface (PR 6) — controller + the 4 use cases
// built in PR 5. USER_REPOSITORY stays exported for `auth` (LoginUseCase).
@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    CreateUserUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    DeactivateUserUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
