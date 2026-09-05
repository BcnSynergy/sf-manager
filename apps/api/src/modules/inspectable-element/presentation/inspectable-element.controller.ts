import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
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
  createInspectableElementSchema,
  updateInspectableElementSchema,
} from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { CommunityNotFoundError } from '../../community/domain/errors/community-not-found.error';
import { ElementCodeGenerationFailedError } from '../domain/errors/element-code-generation-failed.error';
import { CreateInspectableElementUseCase } from '../application/use-cases/create-inspectable-element.use-case';
import { ListInspectableElementsByCommunityUseCase } from '../application/use-cases/list-inspectable-elements-by-community.use-case';
import { SoftDeleteInspectableElementUseCase } from '../application/use-cases/soft-delete-inspectable-element.use-case';
import { UpdateInspectableElementUseCase } from '../application/use-cases/update-inspectable-element.use-case';
import { InspectableElementNotFoundError } from '../domain/errors/inspectable-element-not-found.error';
import type { CreateInspectableElementRequestDto } from './dto/create-inspectable-element-request.dto';
import { CreateInspectableElementResponseDto } from './dto/create-inspectable-element-response.dto';
import type { UpdateInspectableElementRequestDto } from './dto/update-inspectable-element-request.dto';
import { InspectableElementResponseDto } from './dto/inspectable-element-response.dto';

// design.md Decision 8: nested under `communities/:communityId/...`, same
// segment on the API and the web (Open Question 3 — no fork). Every route
// sits behind AuthenticatedGuard (401) then PermissionsGuard (403 unless the
// caller's role has the route's @RequirePermission), both wired globally by
// AuthModule — this controller only declares the required permission per
// route (authorization spec "Permission Check on Inspectable Element
// Endpoints"). Domain errors thrown by the use cases are mapped to HTTP
// responses here, never leaked as raw 500s (ADR-013: presentation never
// imports @prisma/client).
//
// Ordering, verified not assumed (design.md Decision 8): this controller has
// NO static sub-path, so there is no intra-controller static/dynamic
// contest. Across controllers, CommunityController declares no @Get(':id')
// at all, and its @Delete(':id')/@Patch(':id') are depth-2 while every
// route here is depth-4 or depth-5 — Express cannot confuse them. The
// literal `inspectable-elements` segment also differs from
// `representatives`/`technicians` at position 3. Registration order in
// app.module.ts is therefore irrelevant here — this comment records that so
// a future reader does not "fix" a non-problem.
@ApiTags('inspectable-elements')
@Controller('communities/:communityId/inspectable-elements')
export class InspectableElementController {
  constructor(
    private readonly createInspectableElementUseCase: CreateInspectableElementUseCase,
    private readonly listInspectableElementsByCommunityUseCase: ListInspectableElementsByCommunityUseCase,
    private readonly updateInspectableElementUseCase: UpdateInspectableElementUseCase,
    private readonly softDeleteInspectableElementUseCase: SoftDeleteInspectableElementUseCase,
  ) {}

  @Post()
  @RequirePermission('inspectableElement:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['elementType', 'name', 'location', 'installedAt'],
      properties: {
        elementType: { type: 'string', enum: ['EXTINGUISHER'] },
        name: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        serialNumber: { type: 'string' },
        installedAt: { type: 'string', example: '2026-03-15' },
      },
    },
  })
  @ApiCreatedResponse({ type: CreateInspectableElementResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks inspectableElement:create.',
  })
  @ApiNotFoundResponse({
    description:
      'Community not found or soft-deleted. Body carries code: COMMUNITY_NOT_FOUND.',
  })
  async create(
    @Param('communityId') communityId: string,
    // design.md Addendum Decision 10: raw body, deliberately unpiped —
    // ZodValidationPipe strips `code` out of the typed argument below, so
    // this is the only place the key survives to detect its presence.
    @Body() rawBody: Record<string, unknown>,
    @Body(new ZodValidationPipe(createInspectableElementSchema))
    body: CreateInspectableElementRequestDto,
  ): Promise<CreateInspectableElementResponseDto> {
    try {
      return await this.createInspectableElementUseCase.execute({
        communityId,
        ...body,
        codeSupplied: Object.hasOwn(rawBody ?? {}, 'code'),
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Get()
  @RequirePermission('inspectableElement:read')
  @ApiOkResponse({ type: InspectableElementResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks inspectableElement:read.',
  })
  @ApiNotFoundResponse({
    description:
      'Community not found or soft-deleted. Body carries code: COMMUNITY_NOT_FOUND.',
  })
  async list(
    @Param('communityId') communityId: string,
  ): Promise<InspectableElementResponseDto[]> {
    try {
      return await this.listInspectableElementsByCommunityUseCase.execute(
        communityId,
      );
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Patch(':elementId')
  @RequirePermission('inspectableElement:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', nullable: true },
        location: { type: 'string' },
        serialNumber: { type: 'string', nullable: true },
        installedAt: { type: 'string', example: '2026-03-15' },
      },
    },
  })
  @ApiOkResponse({ type: InspectableElementResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks inspectableElement:update.',
  })
  @ApiNotFoundResponse({
    description:
      'Community not found (code: COMMUNITY_NOT_FOUND) or element not ' +
      'found (code: INSPECTABLE_ELEMENT_NOT_FOUND).',
  })
  async update(
    @Param('communityId') communityId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(updateInspectableElementSchema))
    body: UpdateInspectableElementRequestDto,
  ): Promise<InspectableElementResponseDto> {
    try {
      return await this.updateInspectableElementUseCase.execute({
        communityId,
        elementId,
        ...body,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Delete(':elementId')
  @RequirePermission('inspectableElement:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Inspectable element soft-deleted.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks inspectableElement:delete.',
  })
  @ApiNotFoundResponse({
    description:
      'Community not found (code: COMMUNITY_NOT_FOUND) or element not ' +
      'found (code: INSPECTABLE_ELEMENT_NOT_FOUND).',
  })
  async softDelete(
    @Param('communityId') communityId: string,
    @Param('elementId') elementId: string,
  ): Promise<void> {
    try {
      await this.softDeleteInspectableElementUseCase.execute({
        communityId,
        elementId,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Shared by all four routes — every one of them resolves the community
  // first (design.md Decision 5), and three also resolve the element.
  // design.md Decision 7: both are coded 404s, not a generic
  // NotFoundException — this is the earning test for the coded-error
  // convention (>1 reachable cause on the same call, here the same status).
  private mapMutationError(error: unknown): unknown {
    if (error instanceof CommunityNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'COMMUNITY_NOT_FOUND',
      );
    }
    if (error instanceof InspectableElementNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    }
    // design.md Decision 3: exhausting the bounded code-generation retry
    // signals a systemic bug (constant generator, corrupt index), not a
    // retryable client-facing condition — a plain 500 with no error code,
    // not a coded error (the coded-error convention's earning test is >1
    // reachable cause on one status; this has exactly one).
    if (error instanceof ElementCodeGenerationFailedError) {
      return new InternalServerErrorException();
    }
    return error;
  }
}
