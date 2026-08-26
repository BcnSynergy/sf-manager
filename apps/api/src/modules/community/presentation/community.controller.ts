import {
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import {
  addRepresentativeSchema,
  addTechnicianSchema,
  createCommunitySchema,
  updateCommunitySchema,
} from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { UserNotFoundError } from '../../users/domain/errors/user-not-found.error';
import { AddRepresentativeUseCase } from '../application/use-cases/add-representative.use-case';
import { AddTechnicianUseCase } from '../application/use-cases/add-technician.use-case';
import { CreateCommunityUseCase } from '../application/use-cases/create-community.use-case';
import { DeactivateRepresentativeUseCase } from '../application/use-cases/deactivate-representative.use-case';
import { DeactivateTechnicianUseCase } from '../application/use-cases/deactivate-technician.use-case';
import { ListCommunitiesUseCase } from '../application/use-cases/list-communities.use-case';
import { ReactivateRepresentativeUseCase } from '../application/use-cases/reactivate-representative.use-case';
import { ReactivateTechnicianUseCase } from '../application/use-cases/reactivate-technician.use-case';
import { SoftDeleteCommunityUseCase } from '../application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from '../application/use-cases/update-community.use-case';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../application/ports/community-representative.repository.port';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../application/ports/community-technician.repository.port';
import { AssignmentAlreadyExistsError } from '../domain/errors/assignment-already-exists.error';
import { AssignmentNotFoundError } from '../domain/errors/assignment-not-found.error';
import { CommunityNotFoundError } from '../domain/errors/community-not-found.error';
import { IneligibleRoleError } from '../domain/errors/ineligible-role.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import type { CommunityErrorCode } from './community-error-code';
import type { AddRepresentativeRequestDto } from './dto/add-representative-request.dto';
import type { AddTechnicianRequestDto } from './dto/add-technician-request.dto';
import type { CreateCommunityRequestDto } from './dto/create-community-request.dto';
import type { UpdateCommunityRequestDto } from './dto/update-community-request.dto';
import { CommunityResponseDto } from './dto/community-response.dto';
import { RepresentativeResponseDto } from './dto/representative-response.dto';
import { RepresentativeListItemDto } from './dto/representative-list-item.dto';
import { TechnicianResponseDto } from './dto/technician-response.dto';
import { TechnicianListItemDto } from './dto/technician-list-item.dto';

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
    private readonly addRepresentativeUseCase: AddRepresentativeUseCase,
    private readonly deactivateRepresentativeUseCase: DeactivateRepresentativeUseCase,
    private readonly reactivateRepresentativeUseCase: ReactivateRepresentativeUseCase,
    private readonly addTechnicianUseCase: AddTechnicianUseCase,
    private readonly deactivateTechnicianUseCase: DeactivateTechnicianUseCase,
    private readonly reactivateTechnicianUseCase: ReactivateTechnicianUseCase,
    // tasks.md 10.1: list-assignments routes read straight from the
    // repository ports (design.md "controller composes listByCommunity()
    // directly, NO dedicated use case" — per design's 10-use-case count,
    // this deliberately stays a thin controller-level composition).
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly communityRepresentativeRepository: CommunityRepresentativeRepository,
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly communityTechnicianRepository: CommunityTechnicianRepository,
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

  // design.md Decision 4 (GET /communities/:id/representatives): active AND
  // deactivated records, per community-assignments spec.md "List Community
  // Assignments". tasks.md 10.1 — thin controller-level composition over
  // listByCommunity(), no dedicated use case (design's 10-use-case count).
  @Get(':id/representatives')
  @RequirePermission('community:read')
  @ApiOkResponse({ type: RepresentativeListItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:read.' })
  async listRepresentatives(
    @Param('id') communityId: string,
  ): Promise<RepresentativeListItemDto[]> {
    const records =
      await this.communityRepresentativeRepository.listByCommunity(communityId);
    return records.map((record) => ({
      communityId: record.communityId,
      userId: record.userId,
      deactivatedAt: record.deactivatedAt,
    }));
  }

  // design.md Decision 4 (POST /communities/:id/representatives): body is
  // just `{ userId }` — auto-deactivates the incumbent for this community
  // (exclusivity swap) and may carry a multi-community warning.
  @Post(':id/representatives')
  @RequirePermission('community:assign')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: { userId: { type: 'string' } },
    },
  })
  @ApiCreatedResponse({ type: RepresentativeResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Community or user not found.' })
  @ApiConflictResponse({
    description:
      'Assignment already exists (code: ASSIGNMENT_ALREADY_EXISTS), user is ' +
      'not eligible (code: INELIGIBLE_ROLE), or a concurrent conflicting ' +
      'change occurred (code: TRANSACTION_CONFLICT).',
  })
  async addRepresentative(
    @Param('id') communityId: string,
    @Body(new ZodValidationPipe(addRepresentativeSchema))
    body: AddRepresentativeRequestDto,
  ): Promise<RepresentativeResponseDto> {
    try {
      return await this.addRepresentativeUseCase.execute({
        communityId,
        userId: body.userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
    }
  }

  // design.md Decision 4 (DELETE .../representatives/:userId): mirrors
  // DELETE /users/:id — deactivate, not delete; the record stays reactivable.
  @Delete(':id/representatives/:userId')
  @RequirePermission('community:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Representative deactivated.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Assignment not found.' })
  async deactivateRepresentative(
    @Param('id') communityId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    try {
      await this.deactivateRepresentativeUseCase.execute({
        communityId,
        userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
    }
  }

  // design.md Decision 4 (POST .../representatives/:userId/reactivate):
  // re-applies exclusivity against an EXISTING pair; 404 if the pair was
  // never created or the associated user is soft-deleted (spec.md
  // "Reactivation rejected for a soft-deleted user").
  @Post(':id/representatives/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('community:assign')
  @ApiOkResponse({ type: RepresentativeResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Assignment or user not found.' })
  @ApiConflictResponse({
    description:
      'User is not eligible (code: INELIGIBLE_ROLE), or a concurrent ' +
      'conflicting change occurred (code: TRANSACTION_CONFLICT).',
  })
  async reactivateRepresentative(
    @Param('id') communityId: string,
    @Param('userId') userId: string,
  ): Promise<RepresentativeResponseDto> {
    try {
      return await this.reactivateRepresentativeUseCase.execute({
        communityId,
        userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
    }
  }

  // design.md Decision 4 (GET /communities/:id/technicians): mirrors
  // listRepresentatives() — active AND deactivated records, no dedicated
  // use case (tasks.md 10.1).
  @Get(':id/technicians')
  @RequirePermission('community:read')
  @ApiOkResponse({ type: TechnicianListItemDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:read.' })
  async listTechnicians(
    @Param('id') communityId: string,
  ): Promise<TechnicianListItemDto[]> {
    const records =
      await this.communityTechnicianRepository.listByCommunity(communityId);
    return records.map((record) => ({
      communityId: record.communityId,
      userId: record.userId,
      deactivatedAt: record.deactivatedAt,
    }));
  }

  // design.md Decision 4 (POST /communities/:id/technicians): mirrors
  // addRepresentative() minus exclusivity — body is just `{ userId }`, no
  // incumbent to deactivate, no warning ever returned (tasks.md 9.6).
  @Post(':id/technicians')
  @RequirePermission('community:assign')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: { userId: { type: 'string' } },
    },
  })
  @ApiCreatedResponse({ type: TechnicianResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Community or user not found.' })
  @ApiConflictResponse({
    description:
      'Assignment already exists (code: ASSIGNMENT_ALREADY_EXISTS), or the ' +
      'user is not eligible (code: INELIGIBLE_ROLE).',
  })
  async addTechnician(
    @Param('id') communityId: string,
    @Body(new ZodValidationPipe(addTechnicianSchema))
    body: AddTechnicianRequestDto,
  ): Promise<TechnicianResponseDto> {
    try {
      return await this.addTechnicianUseCase.execute({
        communityId,
        userId: body.userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
    }
  }

  // design.md Decision 4 (DELETE .../technicians/:userId): mirrors
  // deactivateRepresentative() — deactivate, not delete; the record stays
  // reactivable. No exclusivity side effect on any other technician.
  @Delete(':id/technicians/:userId')
  @RequirePermission('community:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Technician deactivated.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Assignment not found.' })
  async deactivateTechnician(
    @Param('id') communityId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    try {
      await this.deactivateTechnicianUseCase.execute({
        communityId,
        userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
    }
  }

  // design.md Decision 4 (POST .../technicians/:userId/reactivate): 404 if
  // the pair was never created or the associated user is soft-deleted
  // (spec.md "Reactivation rejected for a soft-deleted user"). No
  // exclusivity swap and no warning, unlike reactivateRepresentative().
  @Post(':id/technicians/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('community:assign')
  @ApiOkResponse({ type: TechnicianResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks community:assign.' })
  @ApiNotFoundResponse({ description: 'Assignment or user not found.' })
  @ApiConflictResponse({
    description: 'The user is not eligible (code: INELIGIBLE_ROLE).',
  })
  async reactivateTechnician(
    @Param('id') communityId: string,
    @Param('userId') userId: string,
  ): Promise<TechnicianResponseDto> {
    try {
      return await this.reactivateTechnicianUseCase.execute({
        communityId,
        userId,
      });
    } catch (error) {
      throw this.mapAssignmentError(error);
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

  // Shared by both representative AND technician assignment routes
  // (tasks.md 8.3, 9.6) — mirrors mapMutationError's shape but covers the
  // wider set of errors an assignment use case can throw (design.md Data
  // Flow, "Where the settled policies live in code"). Technician use cases
  // never throw TransactionConflictError (no transactional() wrap), but
  // mapping it here anyway costs nothing and keeps this method reusable.
  // design.md Decision 1 (Coded-conflict convention): each 409 cause gets
  // its own machine-readable `code`, additive to {statusCode, error,
  // message} — mirrors UsersController.mapMutationError.
  private mapAssignmentError(error: unknown): unknown {
    if (
      error instanceof CommunityNotFoundError ||
      error instanceof UserNotFoundError ||
      error instanceof AssignmentNotFoundError
    ) {
      return new NotFoundException(error.message);
    }
    if (error instanceof AssignmentAlreadyExistsError) {
      return this.buildConflictException(error, 'ASSIGNMENT_ALREADY_EXISTS');
    }
    if (error instanceof IneligibleRoleError) {
      return this.buildConflictException(error, 'INELIGIBLE_ROLE');
    }
    if (error instanceof TransactionConflictError) {
      return this.buildConflictException(error, 'TRANSACTION_CONFLICT');
    }
    return error;
  }

  // design.md Decision 1 ("Non-breaking guarantee", mirroring
  // UsersController.buildConflictException): ConflictException with an
  // object body is emitted verbatim by Nest's HttpException.createBody, so
  // this re-supplies the default {statusCode, error, message} shape and
  // only *adds* `code`, keeping the change additive/non-breaking per the
  // community-assignments spec delta.
  private buildConflictException(
    error: Error,
    code: CommunityErrorCode,
  ): ConflictException {
    return new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: error.message,
      code,
    });
  }
}
