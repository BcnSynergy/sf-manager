import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import {
  openReviewSessionSchema,
  recordEntryRequestSchema,
  type RecordEntryRequest,
} from '@sf-manager/validation';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { InspectableElementNotFoundError } from '../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ActiveTemplateNotFoundError } from '../domain/errors/active-template-not-found.error';
import { AnswersDoNotMatchTemplateError } from '../domain/errors/answers-do-not-match-template.error';
import { CommunityNotInScopeError } from '../domain/errors/community-not-in-scope.error';
import { MissingAnswersError } from '../domain/errors/missing-answers.error';
import { MissingObservationsError } from '../domain/errors/missing-observations.error';
import { OpenDraftAlreadyExistsError } from '../domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotEditableError } from '../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../domain/errors/review-session-not-found.error';
import { DiscardReviewSessionUseCase } from '../application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from '../application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from '../application/use-cases/list-own-review-sessions.use-case';
import { OpenReviewSessionUseCase } from '../application/use-cases/open-review-session.use-case';
import { ReadReviewSessionUseCase } from '../application/use-cases/read-review-session.use-case';
import { ResolveElementByCodeUseCase } from '../application/use-cases/resolve-element-by-code.use-case';
import {
  RecordEntryUseCase,
  type RecordEntryInput,
} from '../application/use-cases/record-entry.use-case';
import type { OpenReviewSessionRequestDto } from './dto/open-review-session-request.dto';
import { ReviewScopeResponseDto } from './dto/review-scope-response.dto';
import { ReviewSessionResponseDto } from './dto/review-session-response.dto';
import { ReviewSessionDetailResponseDto } from './dto/review-session-detail-response.dto';
import { ResolveElementResponseDto } from './dto/resolve-element-response.dto';
import { RecordEntryResponseDto } from './dto/record-entry-response.dto';

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
    private readonly resolveElementByCodeUseCase: ResolveElementByCodeUseCase,
    private readonly recordEntryUseCase: RecordEntryUseCase,
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

  @Get('review-sessions/:sessionId/elements/:code')
  @RequirePermission('reviewSession:perform')
  @ApiOkResponse({ type: ResolveElementResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session (code: REVIEW_SESSION_NOT_FOUND), ' +
      'or a code that does not resolve within the session scope — unknown, ' +
      'foreign community, wrong element type, decommissioned and soft-' +
      'deleted are all indistinguishable (code: ELEMENT_NOT_FOUND).',
  })
  async resolveElement(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
    @Param('code') code: string,
  ): Promise<ResolveElementResponseDto> {
    try {
      return await this.resolveElementByCodeUseCase.execute(sessionId, code, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Put('review-sessions/:sessionId/entries/:elementId')
  @RequirePermission('reviewSession:perform')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['answers'],
          properties: {
            answers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  questionId: { type: 'string' },
                  value: {
                    type: 'string',
                    enum: ['YES', 'NO', 'NOT_APPLICABLE'],
                  },
                },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['observations'],
          properties: { observations: { type: 'string' } },
        },
      ],
    },
  })
  @ApiOkResponse({ type: RecordEntryResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiBadRequestResponse({
    description:
      'Body carries neither/both of answers and observations, an empty ' +
      'answers array, a blank observations reason, or an out-of-range ' +
      'answer value.',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session. Body carries code: ' +
      'REVIEW_SESSION_NOT_FOUND.',
  })
  @ApiConflictResponse({
    description:
      'Session is not a draft. Body carries code: REVIEW_SESSION_NOT_EDITABLE.',
  })
  async recordEntry(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(recordEntryRequestSchema))
    body: RecordEntryRequest,
  ): Promise<RecordEntryResponseDto> {
    const input: RecordEntryInput =
      'answers' in body
        ? { kind: 'reviewed', answers: body.answers }
        : { kind: 'unreviewed', observations: body.observations };

    try {
      return await this.recordEntryUseCase.execute(
        sessionId,
        elementId,
        input,
        { userId: user.sub, role: user.role },
      );
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
    if (error instanceof InspectableElementNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'ELEMENT_NOT_FOUND',
      );
    }
    if (error instanceof AnswersDoNotMatchTemplateError) {
      return buildCodedError(
        HttpStatus.BAD_REQUEST,
        error.message,
        'ANSWERS_DO_NOT_MATCH_TEMPLATE',
      );
    }
    if (error instanceof MissingObservationsError) {
      return buildCodedError(
        HttpStatus.BAD_REQUEST,
        error.message,
        'MISSING_OBSERVATIONS',
      );
    }
    if (error instanceof MissingAnswersError) {
      return buildCodedError(
        HttpStatus.BAD_REQUEST,
        error.message,
        'MISSING_ANSWERS',
      );
    }
    return error;
  }
}
