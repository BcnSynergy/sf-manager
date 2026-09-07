import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { openReviewSessionSchema } from '@sf-manager/validation';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ActiveTemplateNotFoundError } from '../domain/errors/active-template-not-found.error';
import { CommunityNotInScopeError } from '../domain/errors/community-not-in-scope.error';
import { OpenDraftAlreadyExistsError } from '../domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotEditableError } from '../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../domain/errors/review-session-not-found.error';
import { DiscardReviewSessionUseCase } from '../application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from '../application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from '../application/use-cases/list-own-review-sessions.use-case';
import { OpenReviewSessionUseCase } from '../application/use-cases/open-review-session.use-case';
import { ReadReviewSessionUseCase } from '../application/use-cases/read-review-session.use-case';
import type { OpenReviewSessionRequestDto } from './dto/open-review-session-request.dto';
import { ReviewScopeResponseDto } from './dto/review-scope-response.dto';
import { ReviewSessionResponseDto } from './dto/review-session-response.dto';
import { ReviewSessionDetailResponseDto } from './dto/review-session-detail-response.dto';

// design.md Decision 10: flat `/review-sessions` API + a separate top-level
// `/review-scope` path (Express matches in declaration order — a nested
// `/review-sessions/scope` would sit one reordering away from being
// swallowed by `@Get(':sessionId')`). Every route sits behind
// AuthenticatedGuard (401) then PermissionsGuard (403 unless the caller's
// role has the route's @RequirePermission), both wired globally by
// AuthModule — this controller only declares the required permission per
// route (authorization spec "Technician and Representative Become
// Operational"). Phase 5/6 extend this same controller with the by-code
// resolve/record-answer/complete routes.
@ApiTags('review-sessions')
@Controller()
export class ReviewSessionController {
  constructor(
    private readonly getReviewScopeUseCase: GetReviewScopeUseCase,
    private readonly openReviewSessionUseCase: OpenReviewSessionUseCase,
    private readonly listOwnReviewSessionsUseCase: ListOwnReviewSessionsUseCase,
    private readonly readReviewSessionUseCase: ReadReviewSessionUseCase,
    private readonly discardReviewSessionUseCase: DiscardReviewSessionUseCase,
  ) {}

  @Get('review-scope')
  @RequirePermission('reviewSession:create')
  @ApiOkResponse({ type: ReviewScopeResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:create.' })
  async getScope(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<ReviewScopeResponseDto> {
    return this.getReviewScopeUseCase.execute(user.sub);
  }

  @Post('review-sessions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('reviewSession:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['communityId', 'templateId'],
      properties: {
        communityId: { type: 'string' },
        templateId: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: ReviewSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description:
      'Caller lacks reviewSession:create, or the community does not ' +
      'exist / the actor is not actively assigned to it. Body carries ' +
      'code: COMMUNITY_NOT_IN_SCOPE.',
  })
  @ApiNotFoundResponse({
    description:
      'No active template for the requested id. Body carries code: ' +
      'ACTIVE_TEMPLATE_NOT_FOUND.',
  })
  @ApiConflictResponse({
    description:
      'An open draft already exists for this community, template and ' +
      'user. Body carries code: OPEN_DRAFT_ALREADY_EXISTS.',
  })
  async open(
    @CurrentUser() user: VerifiedAccessToken,
    @Body(new ZodValidationPipe(openReviewSessionSchema))
    body: OpenReviewSessionRequestDto,
  ): Promise<ReviewSessionResponseDto> {
    try {
      const result = await this.openReviewSessionUseCase.execute({
        communityId: body.communityId,
        templateId: body.templateId,
        performedById: user.sub,
        role: user.role,
      });
      return { ...result, completedAt: null };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get('review-sessions')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewSessionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  async listOwn(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<ReviewSessionResponseDto[]> {
    const sessions = await this.listOwnReviewSessionsUseCase.execute(user.sub);
    return sessions.map((session) => ({
      id: session.id,
      communityId: session.communityId,
      templateId: session.templateId,
      performedById: session.performedById,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    }));
  }

  @Get('review-sessions/:sessionId')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewSessionDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiNotFoundResponse({
    description:
      "Unknown session, another performer's session, or a since-" +
      'deactivated assignment — all indistinguishable. Body carries ' +
      'code: REVIEW_SESSION_NOT_FOUND.',
  })
  async read(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
  ): Promise<ReviewSessionDetailResponseDto> {
    try {
      return await this.readReviewSessionUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Delete('review-sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('reviewSession:discard')
  @ApiNoContentResponse({ description: 'Draft session discarded.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:discard.' })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session. Body carries code: ' +
      'REVIEW_SESSION_NOT_FOUND.',
  })
  @ApiConflictResponse({
    description:
      'Session is not a draft — only a draft may be discarded. Body ' +
      'carries code: REVIEW_SESSION_NOT_EDITABLE.',
  })
  async discard(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    try {
      await this.discardReviewSessionUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): unknown {
    if (error instanceof CommunityNotInScopeError) {
      return buildCodedError(
        HttpStatus.FORBIDDEN,
        error.message,
        'COMMUNITY_NOT_IN_SCOPE',
      );
    }
    if (error instanceof ActiveTemplateNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'ACTIVE_TEMPLATE_NOT_FOUND',
      );
    }
    if (error instanceof OpenDraftAlreadyExistsError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'OPEN_DRAFT_ALREADY_EXISTS',
      );
    }
    if (error instanceof ReviewSessionNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'REVIEW_SESSION_NOT_FOUND',
      );
    }
    if (error instanceof ReviewSessionNotEditableError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'REVIEW_SESSION_NOT_EDITABLE',
      );
    }
    return error;
  }
}
