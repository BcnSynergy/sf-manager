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
  createDraftReviewTemplateSchema,
  setReviewTemplateQuestionsSchema,
} from '@sf-manager/validation';
import { ChecklistQuestionNotFoundError } from '../../checklist-question/domain/errors/checklist-question-not-found.error';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ActivateReviewTemplateUseCase } from '../application/use-cases/activate-review-template.use-case';
import { CreateDraftReviewTemplateUseCase } from '../application/use-cases/create-draft-review-template.use-case';
import { ListReviewTemplatesUseCase } from '../application/use-cases/list-review-templates.use-case';
import { ReadReviewTemplateUseCase } from '../application/use-cases/read-review-template.use-case';
import { SetReviewTemplateQuestionsUseCase } from '../application/use-cases/set-review-template-questions.use-case';
import { SoftDeleteDraftReviewTemplateUseCase } from '../application/use-cases/soft-delete-draft-review-template.use-case';
import { ReviewTemplateDraftExistsError } from '../domain/errors/review-template-draft-exists.error';
import { ReviewTemplateEmptyError } from '../domain/errors/review-template-empty.error';
import { ReviewTemplateNotEditableError } from '../domain/errors/review-template-not-editable.error';
import { ReviewTemplateNotFoundError } from '../domain/errors/review-template-not-found.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import type { CreateReviewTemplateRequestDto } from './dto/create-review-template-request.dto';
import type { SetReviewTemplateQuestionsRequestDto } from './dto/set-review-template-questions-request.dto';
import { ActivateReviewTemplateResponseDto } from './dto/activate-review-template-response.dto';
import { ReviewTemplateListItemResponseDto } from './dto/review-template-list-item-response.dto';
import { ReviewTemplateResponseDto } from './dto/review-template-response.dto';

// design.md Decision 8: flat routes, no community parent — global admin
// surface (spec.md "Create Draft Template" / "List and Read Templates").
// Every route sits behind AuthenticatedGuard (401) then PermissionsGuard
// (403 unless the caller's role has the route's @RequirePermission), both
// wired globally by AuthModule — this controller only declares the
// required permission per route (authorization spec "Permission Check on
// Review Template Endpoints"). Domain errors thrown by the use cases are
// mapped to HTTP responses here, never leaked as raw 500s (ADR-013:
// presentation never imports @prisma/client).
@ApiTags('review-templates')
@Controller('review-templates')
export class ReviewTemplateController {
  constructor(
    private readonly createDraftReviewTemplateUseCase: CreateDraftReviewTemplateUseCase,
    private readonly listReviewTemplatesUseCase: ListReviewTemplatesUseCase,
    private readonly readReviewTemplateUseCase: ReadReviewTemplateUseCase,
    private readonly setReviewTemplateQuestionsUseCase: SetReviewTemplateQuestionsUseCase,
    private readonly activateReviewTemplateUseCase: ActivateReviewTemplateUseCase,
    private readonly softDeleteDraftReviewTemplateUseCase: SoftDeleteDraftReviewTemplateUseCase,
  ) {}

  @Post()
  @RequirePermission('reviewTemplate:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['elementType', 'frequency', 'name'],
      properties: {
        elementType: { type: 'string', enum: ['EXTINGUISHER'] },
        frequency: {
          type: 'string',
          enum: ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'],
        },
        name: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: ReviewTemplateListItemResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewTemplate:create.' })
  @ApiConflictResponse({
    description:
      'A draft already exists for this element type and frequency. ' +
      'Body carries code: REVIEW_TEMPLATE_DRAFT_EXISTS.',
  })
  async create(
    @Body(new ZodValidationPipe(createDraftReviewTemplateSchema))
    body: CreateReviewTemplateRequestDto,
  ): Promise<ReviewTemplateListItemResponseDto> {
    try {
      return await this.createDraftReviewTemplateUseCase.execute(body);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get()
  @RequirePermission('reviewTemplate:read')
  @ApiOkResponse({ type: ReviewTemplateListItemResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewTemplate:read.' })
  async list(): Promise<ReviewTemplateListItemResponseDto[]> {
    return this.listReviewTemplatesUseCase.execute();
  }

  @Get(':id')
  @RequirePermission('reviewTemplate:read')
  @ApiOkResponse({ type: ReviewTemplateResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewTemplate:read.' })
  @ApiNotFoundResponse({
    description:
      'Template not found or soft-deleted. Body carries code: ' +
      'REVIEW_TEMPLATE_NOT_FOUND.',
  })
  async read(@Param('id') id: string): Promise<ReviewTemplateResponseDto> {
    try {
      return await this.readReviewTemplateUseCase.execute(id);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // spec.md "Replace a Draft's Ordered Question Selection": full-replace
  // semantics — the submitted array's order becomes each entry's `order`.
  @Put(':id/questions')
  @RequirePermission('reviewTemplate:update')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['questionIds'],
      properties: {
        questionIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiOkResponse({ type: ReviewTemplateResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewTemplate:update.' })
  @ApiNotFoundResponse({
    description:
      'Template not found (code: REVIEW_TEMPLATE_NOT_FOUND) or a ' +
      'submitted question id is unknown/soft-deleted ' +
      '(code: CHECKLIST_QUESTION_NOT_FOUND).',
  })
  @ApiConflictResponse({
    description:
      'Template is not a draft. Body carries code: ' +
      'REVIEW_TEMPLATE_NOT_EDITABLE.',
  })
  async setQuestions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setReviewTemplateQuestionsSchema))
    body: SetReviewTemplateQuestionsRequestDto,
  ): Promise<ReviewTemplateResponseDto> {
    try {
      await this.setReviewTemplateQuestionsUseCase.execute({
        templateId: id,
        questionIds: body.questionIds,
      });
      return await this.readReviewTemplateUseCase.execute(id);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // design.md Data Flow (POST .../activate): the pre-flight guards run in
  // ActivateReviewTemplateUseCase (Phase 8); the one Serializable
  // transaction runs in PrismaReviewTemplateRepository.activate() (9.1).
  // This route only orchestrates and maps the resulting errors.
  @Post(':id/activate')
  @RequirePermission('reviewTemplate:activate')
  @ApiOkResponse({ type: ActivateReviewTemplateResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks reviewTemplate:activate.',
  })
  @ApiNotFoundResponse({
    description:
      'Template not found. Body carries code: REVIEW_TEMPLATE_NOT_FOUND.',
  })
  @ApiConflictResponse({
    description:
      'Not editable (code: REVIEW_TEMPLATE_NOT_EDITABLE), empty selection ' +
      '(code: REVIEW_TEMPLATE_EMPTY), or a concurrent activation won the ' +
      'race (code: REVIEW_TEMPLATE_ACTIVATION_CONFLICT).',
  })
  async activate(
    @Param('id') id: string,
  ): Promise<ActivateReviewTemplateResponseDto> {
    try {
      return await this.activateReviewTemplateUseCase.execute(id);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // spec.md "Only Drafts May Be Soft-Deleted" — frozen versions are
  // undeletable (409), never 404-masked the way checklist-question's
  // soft-delete is unconditional.
  @Delete(':id')
  @RequirePermission('reviewTemplate:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Draft template soft-deleted.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewTemplate:delete.' })
  @ApiNotFoundResponse({
    description:
      'Template not found or already soft-deleted. Body carries code: ' +
      'REVIEW_TEMPLATE_NOT_FOUND.',
  })
  @ApiConflictResponse({
    description:
      'Template is not a draft — frozen versions are undeletable. Body ' +
      'carries code: REVIEW_TEMPLATE_NOT_EDITABLE.',
  })
  async softDelete(@Param('id') id: string): Promise<void> {
    try {
      await this.softDeleteDraftReviewTemplateUseCase.execute(id);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): unknown {
    if (error instanceof ReviewTemplateNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'REVIEW_TEMPLATE_NOT_FOUND',
      );
    }
    if (error instanceof ChecklistQuestionNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'CHECKLIST_QUESTION_NOT_FOUND',
      );
    }
    if (error instanceof ReviewTemplateNotEditableError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'REVIEW_TEMPLATE_NOT_EDITABLE',
      );
    }
    if (error instanceof ReviewTemplateEmptyError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'REVIEW_TEMPLATE_EMPTY',
      );
    }
    if (error instanceof ReviewTemplateDraftExistsError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'REVIEW_TEMPLATE_DRAFT_EXISTS',
      );
    }
    if (error instanceof TransactionConflictError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'REVIEW_TEMPLATE_ACTIVATION_CONFLICT',
      );
    }
    return error;
  }
}
