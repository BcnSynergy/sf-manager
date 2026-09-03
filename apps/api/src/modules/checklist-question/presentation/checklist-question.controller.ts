import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  createChecklistQuestionSchema,
  updateChecklistQuestionSchema,
} from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { CreateChecklistQuestionUseCase } from '../application/use-cases/create-checklist-question.use-case';
import { ListChecklistQuestionsUseCase } from '../application/use-cases/list-checklist-questions.use-case';
import { SoftDeleteChecklistQuestionUseCase } from '../application/use-cases/soft-delete-checklist-question.use-case';
import { UpdateChecklistQuestionUseCase } from '../application/use-cases/update-checklist-question.use-case';
import { ChecklistQuestionNotFoundError } from '../domain/errors/checklist-question-not-found.error';
import { InvalidChecklistQuestionInputError } from '../domain/errors/invalid-checklist-question-input.error';
import type { CreateChecklistQuestionRequestDto } from './dto/create-checklist-question-request.dto';
import type { UpdateChecklistQuestionRequestDto } from './dto/update-checklist-question-request.dto';
import { ChecklistQuestionResponseDto } from './dto/checklist-question-response.dto';

// design.md Decision 8: flat routes, no community parent — global admin
// pool (spec.md "Admin-only CRUD over the global ChecklistQuestion pool").
// Every route sits behind AuthenticatedGuard (401) then PermissionsGuard
// (403 unless the caller's role has the route's @RequirePermission), both
// wired globally by AuthModule — this controller only declares the
// required permission per route (authorization spec "Permission Check on
// Checklist Question Endpoints"). Domain errors thrown by the use cases are
// mapped to HTTP responses here, never leaked as raw 500s (ADR-013:
// presentation never imports @prisma/client).
//
// No `?elementType=` filter is implemented here (design.md Decision 8
// mentions it as a possibility): ListChecklistQuestionsUseCase (Phase 3,
// already merged) takes no filter argument and no spec.md scenario requires
// it, so widening the use case's signature is out of this PR's scope
// (ADR-006 walking skeleton — do not build what the current slice doesn't
// need). Left as an open item if a future slice needs it.
@ApiTags('checklist-questions')
@Controller('checklist-questions')
export class ChecklistQuestionController {
  constructor(
    private readonly createChecklistQuestionUseCase: CreateChecklistQuestionUseCase,
    private readonly listChecklistQuestionsUseCase: ListChecklistQuestionsUseCase,
    private readonly updateChecklistQuestionUseCase: UpdateChecklistQuestionUseCase,
    private readonly softDeleteChecklistQuestionUseCase: SoftDeleteChecklistQuestionUseCase,
  ) {}

  @Post()
  @RequirePermission('checklistQuestion:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['elementType', 'frequencies', 'text'],
      properties: {
        elementType: { type: 'string', enum: ['EXTINGUISHER'] },
        frequencies: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'],
          },
        },
        text: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: ChecklistQuestionResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks checklistQuestion:create.',
  })
  async create(
    @Body(new ZodValidationPipe(createChecklistQuestionSchema))
    body: CreateChecklistQuestionRequestDto,
  ): Promise<ChecklistQuestionResponseDto> {
    try {
      return await this.createChecklistQuestionUseCase.execute(body);
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Get()
  @RequirePermission('checklistQuestion:read')
  @ApiOkResponse({ type: ChecklistQuestionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks checklistQuestion:read.',
  })
  async list(): Promise<ChecklistQuestionResponseDto[]> {
    return this.listChecklistQuestionsUseCase.execute();
  }

  @Patch(':id')
  @RequirePermission('checklistQuestion:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        frequencies: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'],
          },
        },
        text: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: ChecklistQuestionResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks checklistQuestion:update.',
  })
  @ApiNotFoundResponse({
    description:
      'Question not found or soft-deleted. Body carries code: CHECKLIST_QUESTION_NOT_FOUND.',
  })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChecklistQuestionSchema))
    body: UpdateChecklistQuestionRequestDto,
  ): Promise<ChecklistQuestionResponseDto> {
    try {
      return await this.updateChecklistQuestionUseCase.execute({
        id,
        ...body,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Delete(':id')
  @RequirePermission('checklistQuestion:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Checklist question soft-deleted.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks checklistQuestion:delete.',
  })
  @ApiNotFoundResponse({
    description:
      'Question not found or already soft-deleted. Body carries code: ' +
      'CHECKLIST_QUESTION_NOT_FOUND. Never 409 — soft-delete is never ' +
      'blocked by template references (spec.md).',
  })
  async softDelete(@Param('id') id: string): Promise<void> {
    try {
      await this.softDeleteChecklistQuestionUseCase.execute(id);
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // tasks.md 4.6: InvalidChecklistQuestionInputError is defense-in-depth on
  // CreateChecklistQuestionUseCase (Phase 3) for a direct application-layer
  // caller that bypasses the DTO pipe — through THIS route it is
  // unreachable, because ZodValidationPipe(createChecklistQuestionSchema)
  // already rejects the identical empty-frequencies/missing-field shapes
  // before the use case ever runs. Mapped to a PLAIN BadRequestException
  // (no `code` field), matching the Zod pipe's own 400 shape exactly rather
  // than wrapping it in buildCodedError's {code} envelope: the coded-error
  // convention's bar (coded-error.ts) is >1 REACHABLE cause of the same
  // status on the same call, and there is no such second reachable cause
  // here — inventing a code would imply a client-distinguishable case that
  // does not exist. update-checklist-question.use-case.ts gets NO symmetric
  // guard: updateChecklistQuestionSchema's `frequencies` is already
  // `z.array(...).min(1).optional()`, so "update to an empty frequencies
  // set" is already a 400 at the Zod boundary — adding a second guard at
  // the use-case layer for update would duplicate coverage the schema
  // already provides, unlike create where the guard covers direct callers
  // the same Zod schema does not intercept.
  private mapMutationError(error: unknown): unknown {
    if (error instanceof ChecklistQuestionNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'CHECKLIST_QUESTION_NOT_FOUND',
      );
    }
    if (error instanceof InvalidChecklistQuestionInputError) {
      return new BadRequestException(error.message);
    }
    return error;
  }
}
