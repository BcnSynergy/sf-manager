import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiNoContentResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  type PasswordResetConfirm,
  type PasswordResetRequest,
} from '@sf-manager/validation';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { WeakPasswordError } from '../../users/domain/errors/weak-password.error';
import { ConfirmPasswordResetUseCase } from '../application/use-cases/confirm-password-reset.use-case';
import { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.use-case';
import { InvalidResetTokenError } from '../domain/invalid-reset-token.error';
import { PasswordResetEmailThrottlerGuard } from './guards/password-reset-email-throttler.guard';
import { PasswordResetThrottlerGuard } from './guards/password-reset-throttler.guard';

// Machine-readable cause of the one 400 the confirm endpoint adds to the
// standard validation errors. Unknown, expired, used, replaced and
// soft-deleted-user tokens all carry it, so it reveals nothing about which.
export type PasswordResetErrorCode = 'INVALID_RESET_TOKEN';

// password-reset S1, S3-S6: both endpoints are public (the user has no
// session) and rate-limited per client key; the request endpoint also per
// email. Lives apart from AuthController so session handling stays as it was.
@ApiTags('auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly confirmPasswordReset: ConfirmPasswordResetUseCase,
  ) {}

  // S3: the same 202 whatever the email is; the work runs after the answer.
  @Public()
  @UseGuards(PasswordResetThrottlerGuard, PasswordResetEmailThrottlerGuard)
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        locale: { type: 'string', enum: ['en', 'es', 'ca'], default: 'en' },
      },
    },
  })
  @ApiAcceptedResponse({
    description:
      'Always, for a valid body: an email goes out only if the address belongs to an active user.',
  })
  @ApiBadRequestResponse({ description: 'Invalid email or locale.' })
  @ApiTooManyRequestsResponse({
    description:
      'Too many requests from this client or for this email; see Retry-After.',
  })
  request(
    @Body(new ZodValidationPipe(passwordResetRequestSchema))
    body: PasswordResetRequest,
  ): void {
    this.requestPasswordReset.execute(body);
  }

  @Public()
  @UseGuards(PasswordResetThrottlerGuard)
  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'password'],
      properties: {
        token: { type: 'string' },
        password: { type: 'string' },
      },
    },
  })
  @ApiNoContentResponse({
    description: 'Password changed; every session of the user ended.',
  })
  @ApiBadRequestResponse({
    description:
      'Weak password, or code INVALID_RESET_TOKEN for an invalid, expired or used link.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many attempts from this client; see Retry-After.',
  })
  async confirm(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema))
    body: PasswordResetConfirm,
  ): Promise<void> {
    try {
      await this.confirmPasswordReset.execute(body);
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        throw buildCodedError<PasswordResetErrorCode>(
          HttpStatus.BAD_REQUEST,
          error.message,
          'INVALID_RESET_TOKEN',
        );
      }
      if (error instanceof WeakPasswordError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
