import { Global, Module } from '@nestjs/common';
import { PASSWORD_HASHER } from '../../application/ports/password-hasher.port';
import { Argon2PasswordHasher } from './argon2-password.hasher';

// design.md Decision 7: mirrors the IdGeneratorModule precedent —
// PasswordHasher moved here (from `auth`) because `users` (CreateUserUseCase,
// PR 5) needs it too, and `auth` already imports `UsersModule`, so wiring it
// the other way would create a module cycle. @Global() means any module can
// inject PASSWORD_HASHER without importing this module directly, as long as
// it's instantiated once in the app's module graph (auth.module.ts does
// that). The injection token is unchanged — only its home moved.
@Global()
@Module({
  providers: [{ provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }],
  exports: [PASSWORD_HASHER],
})
export class HashingModule {}
