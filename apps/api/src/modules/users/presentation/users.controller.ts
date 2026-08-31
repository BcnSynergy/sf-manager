import {
  BadRequestException,
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
import { createUserSchema, updateUserSchema } from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '../application/use-cases/deactivate-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { EmailAlreadyInUseError } from '../domain/errors/email-already-in-use.error';
import { InvalidMaintenanceCompanyAssignmentError } from '../domain/errors/invalid-maintenance-company-assignment.error';
import { LastSystemAdminError } from '../domain/errors/last-system-admin.error';
import { MaintenanceCompanyNotFoundError } from '../domain/errors/maintenance-company-not-found.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import { UserNotFoundError } from '../domain/errors/user-not-found.error';
import { WeakPasswordError } from '../domain/errors/weak-password.error';
import type { UserErrorCode } from './user-error-code';
import type { CreateUserRequestDto } from './dto/create-user-request.dto';
import type { UpdateUserRequestDto } from './dto/update-user-request.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { MaintenanceCompanyZodValidationPipe } from './pipes/maintenance-company-zod-validation.pipe';

const ROLE_ENUM = [
  'SYSTEM_ADMIN',
  'MANAGER',
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE',
];

// design.md Data Flow: every route sits behind AuthenticatedGuard (401 on no
// session) then PermissionsGuard (403 unless the caller's role has the
// route's @RequirePermission), both wired globally by AuthModule (PR 3) —
// this controller only declares the required permission per route
// (authorization spec "Permission Check on Protected Endpoints"). Domain
// errors thrown by the use cases are mapped to HTTP responses here, never
// leaked as raw 500s (ADR-013: presentation never imports @prisma/client).
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
  ) {}

  @Post()
  @RequirePermission('user:create')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'role'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 10 },
        role: { type: 'string', enum: ROLE_ENUM },
        maintenanceCompanyId: {
          type: 'string',
          description:
            'Required iff role is MAINTENANCE_COMPANY_MANAGER or MAINTENANCE_TECHNICIAN; must be absent otherwise.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:create.' })
  @ApiConflictResponse({
    description:
      'Email already in use. Body carries code: EMAIL_ALREADY_IN_USE.',
  })
  @ApiBadRequestResponse({
    description:
      'Maintenance-company assignment invalid (code: MAINTENANCE_COMPANY_REQUIRED ' +
      'or MAINTENANCE_COMPANY_NOT_ALLOWED) or the referenced company is ' +
      'missing/soft-deleted (code: MAINTENANCE_COMPANY_NOT_FOUND).',
  })
  async create(
    @Body(new MaintenanceCompanyZodValidationPipe(createUserSchema))
    body: CreateUserRequestDto,
  ): Promise<UserResponseDto> {
    try {
      return await this.createUserUseCase.execute(body);
    } catch (error) {
      if (error instanceof WeakPasswordError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof EmailAlreadyInUseError) {
        throw buildCodedError(
          HttpStatus.CONFLICT,
          error.message,
          'EMAIL_ALREADY_IN_USE',
        );
      }
      throw this.mapMaintenanceCompanyError(error) ?? error;
    }
  }

  @Get()
  @RequirePermission('user:read')
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:read.' })
  async list(): Promise<UserResponseDto[]> {
    return this.listUsersUseCase.execute();
  }

  @Patch(':id')
  @RequirePermission('user:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ROLE_ENUM },
        maintenanceCompanyId: {
          type: 'string',
          description:
            'Present iff this request assigns/reassigns a maintenance ' +
            'company; the resulting role/company pair is always validated, ' +
            'even when this field is absent (spec.md "Grandfathered ' +
            'Maintenance-Role Users").',
        },
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:update.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({
    description:
      'Would leave zero active SYSTEM_ADMIN users (code: LAST_SYSTEM_ADMIN), ' +
      'or a concurrent conflicting update occurred (code: TRANSACTION_CONFLICT).',
  })
  @ApiBadRequestResponse({
    description:
      'Maintenance-company assignment invalid (code: MAINTENANCE_COMPANY_REQUIRED ' +
      'or MAINTENANCE_COMPANY_NOT_ALLOWED) or the referenced company is ' +
      'missing/soft-deleted (code: MAINTENANCE_COMPANY_NOT_FOUND).',
  })
  async update(
    @Param('id') id: string,
    @Body(new MaintenanceCompanyZodValidationPipe(updateUserSchema))
    body: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    try {
      return await this.updateUserUseCase.execute({ id, ...body });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  @Delete(':id')
  @RequirePermission('user:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'User deactivated.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:delete.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({
    description:
      'Would leave zero active SYSTEM_ADMIN users (code: LAST_SYSTEM_ADMIN), ' +
      'or a concurrent conflicting update occurred (code: TRANSACTION_CONFLICT).',
  })
  async deactivate(@Param('id') id: string): Promise<void> {
    try {
      await this.deactivateUserUseCase.execute(id);
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Shared by update() and deactivate() — both mutate an existing user
  // looked up by id and both run the same Last-Admin Lockout /
  // SERIALIZABLE-conflict path (design.md Decision 3, Data Flow).
  //
  // maintenance-company design.md Decision 1/5: the three
  // MAINTENANCE_COMPANY_* 400 causes are only reachable through update()
  // (UpdateUserUseCase) — deactivate() never touches role/company, so this
  // branch is simply unreached for that call site, not dead code.
  private mapMutationError(error: unknown): unknown {
    if (error instanceof UserNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof LastSystemAdminError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'LAST_SYSTEM_ADMIN',
      );
    }
    if (error instanceof TransactionConflictError) {
      return buildCodedError(
        HttpStatus.CONFLICT,
        error.message,
        'TRANSACTION_CONFLICT',
      );
    }
    return this.mapMaintenanceCompanyError(error) ?? error;
  }

  // Shared by create() and mapMutationError() — both may receive the two
  // maintenance-company domain errors (design.md Decision 5). Returns
  // undefined for any other error so callers fall through to their own
  // handling/rethrow. `InvalidMaintenanceCompanyAssignmentError.reason`
  // discriminates the two 400 codes (user-management spec.md "Last-Admin
  // Lockout", MODIFIED — MAINTENANCE_COMPANY_REQUIRED /
  // MAINTENANCE_COMPANY_NOT_ALLOWED).
  private mapMaintenanceCompanyError(error: unknown): unknown {
    if (error instanceof InvalidMaintenanceCompanyAssignmentError) {
      const code: UserErrorCode =
        error.reason === 'REQUIRED'
          ? 'MAINTENANCE_COMPANY_REQUIRED'
          : 'MAINTENANCE_COMPANY_NOT_ALLOWED';
      return buildCodedError(HttpStatus.BAD_REQUEST, error.message, code);
    }
    if (error instanceof MaintenanceCompanyNotFoundError) {
      return buildCodedError(
        HttpStatus.BAD_REQUEST,
        error.message,
        'MAINTENANCE_COMPANY_NOT_FOUND',
      );
    }
    return undefined;
  }
}
