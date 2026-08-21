import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './application/ports/user.repository.port';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

// design.md Decision 1: this module gets NO controller and NO use case in
// this slice — it exists purely to be imported by the `auth` module (PR 3),
// which depends on USER_REPOSITORY for LoginUseCase.
@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
