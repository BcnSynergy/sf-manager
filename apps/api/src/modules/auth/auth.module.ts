import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { StringValue } from 'ms';
import { HashingModule } from '../../shared/infrastructure/hashing/hashing.module';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { UsersModule } from '../users/users.module';
import { LOGIN_FAILURE_LIMITER } from './application/ports/login-failure-limiter.port';
import { OPAQUE_TOKEN_GENERATOR } from './application/ports/opaque-token-generator.port';
import { PERMISSION_CHECKER } from './application/ports/permission-checker.port';
import { REFRESH_TOKEN_STORE } from './application/ports/refresh-token-store.port';
import { TOKEN_DENYLIST } from './application/ports/token-denylist.port';
import { TOKEN_ISSUER } from './application/ports/token-issuer.port';
import { REFRESH_TOKEN_POLICY } from './application/services/refresh-token-policy';
import { RefreshSessionsService } from './application/services/refresh-sessions.service';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RolePermissionChecker } from './infrastructure/authorization/role-permission.checker';
import {
  AUTH_CONFIG,
  type AuthConfig,
  getAuthConfig,
} from './infrastructure/config/auth.config';
import {
  getRefreshRateLimitConfig,
  REFRESH_RATE_LIMIT_CONFIG,
} from './infrastructure/config/refresh-rate-limit.config';
import {
  getLoginEmailRateLimitConfig,
  getLoginRateLimitConfig,
} from './infrastructure/config/login-rate-limit.config';
import { PrismaLoginFailureLimiter } from './infrastructure/persistence/prisma-login-failure-limiter.adapter';
import { PrismaRefreshTokenStore } from './infrastructure/persistence/prisma-refresh-token-store.adapter';
import { PrismaThrottlerStorage } from './infrastructure/persistence/prisma-throttler-storage.adapter';
import { PrismaTokenDenylistAdapter } from './infrastructure/persistence/prisma-token-denylist.adapter';
import { CryptoOpaqueTokenGenerator } from './infrastructure/token/crypto-opaque-token.generator';
import { JwtTokenIssuer } from './infrastructure/token/jwt-token.issuer';
import { AuthController } from './presentation/auth.controller';
import { AuthenticatedGuard } from './presentation/guards/authenticated.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

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
    // Only the login handler opts in (@UseGuards(LoginThrottlerGuard) in
    // AuthController); this module registers no APP_GUARD for it. The
    // throttler MUST stay named 'default': v6 suffixes headers of named
    // throttlers (Retry-After-login), and only 'default' emits a plain
    // Retry-After. forRootAsync so env is read at module initialisation.
    //
    // Counters live in Postgres (PrismaThrottlerStorage, TD-30) so they
    // survive restarts and are shared across API instances. PrismaModule is
    // @Global(), so PrismaService is injectable here. Fail closed: a storage
    // error refuses the login attempt (500). e2e suites that mock
    // PrismaService override ThrottlerStorage with the in-memory store.
    ThrottlerModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        const { maxAttempts, windowMs } = getLoginRateLimitConfig();
        return {
          throttlers: [{ name: 'default', ttl: windowMs, limit: maxAttempts }],
          storage: new PrismaThrottlerStorage(prisma),
        };
      },
    }),
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
    RefreshSessionUseCase,
    { provide: AUTH_CONFIG, useFactory: getAuthConfig },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
    { provide: TOKEN_DENYLIST, useClass: PrismaTokenDenylistAdapter },
    // TD-5: rotating refresh-token families (ADR-011 Decision 4).
    RefreshSessionsService,
    { provide: REFRESH_TOKEN_STORE, useClass: PrismaRefreshTokenStore },
    { provide: OPAQUE_TOKEN_GENERATOR, useClass: CryptoOpaqueTokenGenerator },
    // Read at boot: an invalid REFRESH_RATE_LIMIT_* stops startup.
    {
      provide: REFRESH_RATE_LIMIT_CONFIG,
      useFactory: getRefreshRateLimitConfig,
    },
    {
      provide: REFRESH_TOKEN_POLICY,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => config.refreshToken,
    },
    // Per-email failed-login limit (login-account-lockout, TD-31). Counters
    // live in Postgres next to the per-client-key ones. Fail closed: a
    // storage error on the block check or the failure record refuses the
    // login (500). e2e suites that mock PrismaService override this token
    // with InMemoryLoginFailureLimiter. The factory runs at module compile,
    // so tests that set the env before compile() see their values.
    {
      provide: LOGIN_FAILURE_LIMITER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new PrismaLoginFailureLimiter(prisma, getLoginEmailRateLimitConfig()),
    },
    { provide: PERMISSION_CHECKER, useClass: RolePermissionChecker },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    // design.md Decision 1: registration order matters — Nest runs APP_GUARD
    // providers in the order they appear in this array, so PermissionsGuard
    // MUST come immediately after AuthenticatedGuard to rely on
    // AuthenticatedGuard having already attached `request.user`.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
