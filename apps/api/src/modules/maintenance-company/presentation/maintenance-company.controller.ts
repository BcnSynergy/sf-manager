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
  createMaintenanceCompanySchema,
  updateMaintenanceCompanySchema,
} from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { CreateMaintenanceCompanyUseCase } from '../application/use-cases/create-maintenance-company.use-case';
import { ListMaintenanceCompaniesUseCase } from '../application/use-cases/list-maintenance-companies.use-case';
import { SoftDeleteMaintenanceCompanyUseCase } from '../application/use-cases/soft-delete-maintenance-company.use-case';
import { UpdateMaintenanceCompanyUseCase } from '../application/use-cases/update-maintenance-company.use-case';
import { MaintenanceCompanyHasActiveUsersError } from '../domain/errors/maintenance-company-has-active-users.error';
import { MaintenanceCompanyNotFoundError } from '../domain/errors/maintenance-company-not-found.error';
import { TaxIdAlreadyInUseError } from '../domain/errors/tax-id-already-in-use.error';
import type { CreateMaintenanceCompanyRequestDto } from './dto/create-maintenance-company-request.dto';
import type { UpdateMaintenanceCompanyRequestDto } from './dto/update-maintenance-company-request.dto';
import { MaintenanceCompanyResponseDto } from './dto/maintenance-company-response.dto';

// design.md Routes + Data Flow: every route sits behind AuthenticatedGuard
// (401 on no session) then PermissionsGuard (403 unless the caller's role
// has the route's @RequirePermission), both wired globally by AuthModule —
// this controller only declares the required permission per route
// (authorization spec "Permission Check on Maintenance Company Endpoints").
// Domain errors thrown by the use cases are mapped to HTTP responses here,
// never leaked as raw 500s (ADR-013: presentation never imports
// @prisma/client). Mirrors CommunityController/UsersController.
@ApiTags('maintenance-companies')
@Controller('maintenance-companies')
export class MaintenanceCompanyController {
  constructor(
    private readonly createMaintenanceCompanyUseCase: CreateMaintenanceCompanyUseCase,
    private readonly listMaintenanceCompaniesUseCase: ListMaintenanceCompaniesUseCase,
    private readonly updateMaintenanceCompanyUseCase: UpdateMaintenanceCompanyUseCase,
    private readonly softDeleteMaintenanceCompanyUseCase: SoftDeleteMaintenanceCompanyUseCase,
  ) {}

  @Post()
  @RequirePermission('maintenanceCompany:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'taxId', 'contactInfo'],
      properties: {
        name: { type: 'string' },
        taxId: { type: 'string' },
        contactInfo: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceCompanyResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks maintenanceCompany:create.',
  })
  @ApiConflictResponse({
    description:
      'taxId already in use by another active company. Body carries code: TAX_ID_ALREADY_IN_USE.',
  })
  async create(
    @Body(new ZodValidationPipe(createMaintenanceCompanySchema))
    body: CreateMaintenanceCompanyRequestDto,
  ): Promise<MaintenanceCompanyResponseDto> {
    try {
      return await this.createMaintenanceCompanyUseCase.execute(body);
    } catch (error) {
      throw this.mapTaxIdError(error);
    }
  }

  @Get()
  @RequirePermission('maintenanceCompany:read')
  @ApiOkResponse({ type: MaintenanceCompanyResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks maintenanceCompany:read.',
  })
  async list(): Promise<MaintenanceCompanyResponseDto[]> {
    return this.listMaintenanceCompaniesUseCase.execute();
  }

  @Patch(':id')
  @RequirePermission('maintenanceCompany:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        taxId: { type: 'string' },
        contactInfo: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: MaintenanceCompanyResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks maintenanceCompany:update.',
  })
  @ApiNotFoundResponse({ description: 'Maintenance company not found.' })
  @ApiConflictResponse({
    description:
      'taxId already in use by another active company. Body carries code: TAX_ID_ALREADY_IN_USE.',
  })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMaintenanceCompanySchema))
    body: UpdateMaintenanceCompanyRequestDto,
  ): Promise<MaintenanceCompanyResponseDto> {
    try {
      return await this.updateMaintenanceCompanyUseCase.execute({
        id,
        ...body,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Delete(':id')
  @RequirePermission('maintenanceCompany:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Maintenance company soft-deleted.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks maintenanceCompany:delete.',
  })
  @ApiNotFoundResponse({ description: 'Maintenance company not found.' })
  @ApiConflictResponse({
    description:
      'Company has active users attached. Body carries code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS.',
  })
  async softDelete(@Param('id') id: string): Promise<void> {
    try {
      await this.softDeleteMaintenanceCompanyUseCase.execute(id);
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Shared by update() and softDelete() — both operate on an existing
  // company looked up by id, so both may 404.
  private mapMutationError(error: unknown): unknown {
    if (error instanceof MaintenanceCompanyNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof MaintenanceCompanyHasActiveUsersError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS',
      );
    }
    return this.mapTaxIdError(error);
  }

  // Shared by create() and mapMutationError() — the only cause create() can
  // throw beyond a raw 500 (design.md Decision 2: no read-check, the
  // partial unique index is the sole enforcement).
  private mapTaxIdError(error: unknown): unknown {
    if (error instanceof TaxIdAlreadyInUseError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'TAX_ID_ALREADY_IN_USE',
      );
    }
    return error;
  }
}
