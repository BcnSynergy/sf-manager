import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerException } from '@nestjs/throttler';
import { loginRequestSchema } from '@sf-manager/validation';
import type { Response } from 'express';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import type { IssuedRefreshToken } from '../application/services/refresh-sessions.service';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';
import { LoginBlockedError } from '../domain/login-blocked.error';
import type { VerifiedAccessToken } from '../application/ports/token-issuer.port';
import {
  AUTH_CONFIG,
  type AuthConfig,
} from '../infrastructure/config/auth.config';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserResponseDto } from './dto/auth-user-response.dto';
import type { LoginRequestDto } from './dto/login-request.dto';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { RefreshThrottlerGuard } from './guards/refresh-throttler.guard';
import { SameOriginGuard } from './guards/same-origin.guard';
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case';
import { RefreshRejectedError } from '../domain/refresh-rejected.error';
import type { AuthenticatedRequest } from './types';

// design.md Data Flow. Cookie name/httpOnly/path/secure/sameSite/maxAge all
// come from the injected AuthConfig (Decision 5) so login/logout stay in
// sync with a single source of truth.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  @ApiTooManyRequestsResponse({
    description:
      'Too many login attempts from this client or for this email; see Retry-After.',
  })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    try {
      const { user, accessToken, refreshToken } =
        await this.loginUseCase.execute(body.email, body.password);

      this.setAccessCookie(response, accessToken);
      this.setRefreshCookie(response, refreshToken);

      return user;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof LoginBlockedError) {
        // Same exception type the per-client-key guard throws, so the body
        // is identical and nothing reveals which limit fired (design.md
        // Decision 6). Nest keeps headers set before the exception.
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
        throw new ThrottlerException();
      }
      throw error;
    }
  }

  // TD-5 S3, S7: exchanges the refresh cookie for a new access cookie and
  // the next refresh cookie. Public, since the access token may have
  // expired; same-origin only (CSRF) and rate-limited per client key.
  @Public()
  @UseGuards(SameOriginGuard, RefreshThrottlerGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, unknown, expired, revoked or reused refresh token.',
  })
  @ApiForbiddenResponse({ description: 'Request from another origin.' })
  @ApiTooManyRequestsResponse({
    description: 'Too many refreshes from this client; see Retry-After.',
  })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    const presented = request.cookies?.[this.authConfig.refreshCookie.name];
    if (!presented) {
      throw new UnauthorizedException();
    }
    try {
      const { user, accessToken, refreshToken } =
        await this.refreshSessionUseCase.execute(presented);
      this.setAccessCookie(response, accessToken);
      this.setRefreshCookie(response, refreshToken);
      return user;
    } catch (error) {
      if (error instanceof RefreshRejectedError) {
        // A superseded token lost to another tab's concurrent refresh, whose
        // successor cookie the browser may already hold: keep it.
        if (error.reason !== 'superseded') {
          this.clearRefreshCookie(response);
        }
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  // TD-5 S6: public, because only the refresh cookie may be left once the
  // access cookie has expired; LogoutUseCase still answers 401 when there
  // is no session at all.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.logoutUseCase.execute({
        accessToken: request.cookies?.[this.authConfig.cookie.name],
        refreshToken: request.cookies?.[this.authConfig.refreshCookie.name],
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    const { name, httpOnly, path, secure, sameSite } = this.authConfig.cookie;
    response.clearCookie(name, { httpOnly, path, secure, sameSite });
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  getMe(@CurrentUser() user: VerifiedAccessToken): AuthUserResponseDto {
    return this.getCurrentUserUseCase.execute(user);
  }

  private setAccessCookie(response: Response, accessToken: string): void {
    const { name, httpOnly, path, secure, sameSite, maxAge } =
      this.authConfig.cookie;
    response.cookie(name, accessToken, {
      httpOnly,
      path,
      secure,
      sameSite,
      maxAge,
    });
  }

  private clearRefreshCookie(response: Response): void {
    const { name, httpOnly, path, secure, sameSite } =
      this.authConfig.refreshCookie;
    response.clearCookie(name, { httpOnly, path, secure, sameSite });
  }

  // TD-5 S2: the refresh cookie lives exactly as long as its token.
  private setRefreshCookie(
    response: Response,
    refreshToken: IssuedRefreshToken,
  ): void {
    const { name, httpOnly, path, secure, sameSite } =
      this.authConfig.refreshCookie;
    response.cookie(name, refreshToken.token, {
      httpOnly,
      path,
      secure,
      sameSite,
      expires: refreshToken.expiresAt,
    });
  }
}
