import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
  createCommunitySchema,
  updateCommunitySchema,
} from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { CreateCommunityUseCase } from '../application/use-cases/create-community.use-case';
import { ListCommunitiesUseCase } from '../application/use-cases/list-communities.use-case';
import { SoftDeleteCommunityUseCase } from '../application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from '../application/use-cases/update-community.use-case';
import { CommunityNotFoundError } from '../domain/errors/community-not-found.error';
import type { CreateCommunityRequestDto } from './dto/create-community-request.dto';
import type { UpdateCommunityRequestDto } from './dto/update-community-request.dto';
import { CommunityResponseDto } from './dto/community-response.dto';

const LOCALE_ENUM = ['en', 'es', 'ca'];

// design.md Data Flow + Decision 4 (Routes): every route sits behind
// AuthenticatedGuard (401 on no session) then PermissionsGuard (403 unless
// the caller's role has the route's @RequirePermission), both wired
// globally by AuthModule — this controller only declares the required
// permission per route (authorization spec "Permission Check on Community
// and Assignment Endpoints"), mirroring UsersController. Domain errors
// thrown by the use cases are mapped to HTTP responses here, never leaked
// as raw 500s (ADR-013: presentation never imports @prisma/client).
@ApiTags('communities')
@Controller('communities')
export class CommunityController {
  constructor(
    private readonly createCommunityUseCase: CreateCommunityUseCase,
    private readonly listCommunitiesUseCase: ListCommunitiesUseCase,
    private readonly updateCommunityUseCase: UpdateCommunityUseCase,
    private readonly softDeleteCommunityUseCase: SoftDeleteCommunityUseCase,
  ) {}

  @Post()
  @RequirePermission('community:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'address', 'locale'],
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        locale: { type: 'string', enum: LOCALE_ENUM },
      },
    },
  })
  @ApiCreatedResponse({ type: CommunityResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:create.' })
  async create(
    @Body(new ZodValidationPipe(createCommunitySchema))
    body: CreateCommunityRequestDto,
  ): Promise<CommunityResponseDto> {
    return this.createCommunityUseCase.execute(body);
  }

  @Get()
  @RequirePermission('community:read')
  @ApiOkResponse({ type: CommunityResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:read.' })
  async list(): Promise<CommunityResponseDto[]> {
    return this.listCommunitiesUseCase.execute();
  }

  @Patch(':id')
  @RequirePermission('community:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        locale: { type: 'string', enum: LOCALE_ENUM },
      },
    },
  })
  @ApiOkResponse({ type: CommunityResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:update.' })
  @ApiNotFoundResponse({ description: 'Community not found.' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCommunitySchema))
    body: UpdateCommunityRequestDto,
  ): Promise<CommunityResponseDto> {
    try {
      return await this.updateCommunityUseCase.execute({ id, ...body });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Delete(':id')
  @RequirePermission('community:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Community soft-deleted.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:delete.' })
  @ApiNotFoundResponse({ description: 'Community not found.' })
  async softDelete(@Param('id') id: string): Promise<void> {
    try {
      await this.softDeleteCommunityUseCase.execute(id);
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Shared by update() and softDelete() — both mutate an existing community
  // looked up by id.
  private mapMutationError(error: unknown): unknown {
    if (error instanceof CommunityNotFoundError) {
      return new NotFoundException(error.message);
    }
    return error;
  }
}
