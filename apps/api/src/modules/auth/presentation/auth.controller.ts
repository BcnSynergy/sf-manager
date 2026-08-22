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
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { loginRequestSchema } from '@sf-manager/validation';
import type { Response } from 'express';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';
import type { VerifiedAccessToken } from '../application/ports/token-issuer.port';
import {
  AUTH_CONFIG,
  type AuthConfig,
} from '../infrastructure/config/auth.config';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserResponseDto } from './dto/auth-user-response.dto';
import type { LoginRequestDto } from './dto/login-request.dto';
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
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  @Public()
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
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    try {
      const { user, accessToken } = await this.loginUseCase.execute(
        body.email,
        body.password,
      );

      response.cookie(this.authConfig.cookie.name, accessToken, {
        httpOnly: this.authConfig.cookie.httpOnly,
        path: this.authConfig.cookie.path,
        secure: this.authConfig.cookie.secure,
        sameSite: this.authConfig.cookie.sameSite,
        maxAge: this.authConfig.cookie.maxAge,
      });

      return user;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    // Re-reads the raw cookie and re-verifies it inside LogoutUseCase
    // instead of trusting @CurrentUser()/req.user like getMe() does — see
    // LogoutUseCase's own comment for why (the guard's verify already
    // gated this handler; this second verify only differs in the narrow
    // window where the token expires in between).
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = request.cookies?.[this.authConfig.cookie.name] ?? '';

    try {
      await this.logoutUseCase.execute(token);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    // MUST match the login Set-Cookie call's httpOnly/path/sameSite/secure
    // attributes for the current environment, otherwise some browsers
    // silently fail to clear the cookie (design.md Data Flow).
    response.clearCookie(this.authConfig.cookie.name, {
      httpOnly: this.authConfig.cookie.httpOnly,
      path: this.authConfig.cookie.path,
      secure: this.authConfig.cookie.secure,
      sameSite: this.authConfig.cookie.sameSite,
    });
  }

  @Get('me')
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  getMe(@CurrentUser() user: VerifiedAccessToken): AuthUserResponseDto {
    return this.getCurrentUserUseCase.execute(user);
  }
}
