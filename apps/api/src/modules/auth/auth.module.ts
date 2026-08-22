import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { HashingModule } from '../../shared/infrastructure/hashing/hashing.module';
import { UsersModule } from '../users/users.module';
import { TOKEN_DENYLIST } from './application/ports/token-denylist.port';
import { TOKEN_ISSUER } from './application/ports/token-issuer.port';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import {
  AUTH_CONFIG,
  getAuthConfig,
} from './infrastructure/config/auth.config';
import { PrismaTokenDenylistAdapter } from './infrastructure/persistence/prisma-token-denylist.adapter';
import { JwtTokenIssuer } from './infrastructure/token/jwt-token.issuer';
import { AuthController } from './presentation/auth.controller';
import { AuthenticatedGuard } from './presentation/guards/authenticated.guard';

// design.md Decision 4: this module registers its own APP_GUARD — a Nest
// module can provide APP_GUARD without being imported elsewhere. Wiring
// AuthModule itself into AppModule is explicitly PR 4's task (see
// tasks.md 7.2); nothing here builds a running app on its own.
//
// getAuthConfig() (auth.config.ts) is only actually invoked once this
// module is instantiated by Nest's DI container — which doesn't happen
// until AppModule imports it (PR 4). No PR 3 test builds AuthModule
// through Nest's container, so this call site exists but never executes
// yet.
@Module({
  imports: [
    UsersModule,
    // design.md Decision 7: HashingModule is @Global(), imported here (not
    // app.module.ts) so PASSWORD_HASHER becomes available app-wide as soon
    // as AuthModule is instantiated — mirrors the IdGeneratorModule
    // precedent (app.module.ts), just registered from this module instead.
    HashingModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const config = getAuthConfig();
        return {
          secret: config.jwtSecret,
          // `jwtExpiresIn` is validated by getAuthConfig()'s own
          // parseDurationMs() (e.g. "2h", "30m") — @nestjs/jwt's stricter
          // `StringValue` type from `ms` can't be inferred from a plain
          // `string` at the type level, even though the runtime value is
          // always compatible.
          signOptions: { expiresIn: config.jwtExpiresIn as StringValue },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    { provide: AUTH_CONFIG, useFactory: getAuthConfig },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
    { provide: TOKEN_DENYLIST, useClass: PrismaTokenDenylistAdapter },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
  ],
})
export class AuthModule {}
