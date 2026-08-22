import {
  BadRequestException,
  Body,
  ConflictException,
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
import { createUserSchema, updateUserSchema } from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '../application/use-cases/deactivate-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { EmailAlreadyInUseError } from '../domain/errors/email-already-in-use.error';
import { LastSystemAdminError } from '../domain/errors/last-system-admin.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import { UserNotFoundError } from '../domain/errors/user-not-found.error';
import { WeakPasswordError } from '../domain/errors/weak-password.error';
import type { CreateUserRequestDto } from './dto/create-user-request.dto';
import type { UpdateUserRequestDto } from './dto/update-user-request.dto';
import { UserResponseDto } from './dto/user-response.dto';

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
      },
    },
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:create.' })
  @ApiConflictResponse({ description: 'Email already in use.' })
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserRequestDto,
  ): Promise<UserResponseDto> {
    try {
      return await this.createUserUseCase.execute(body);
    } catch (error) {
      if (error instanceof WeakPasswordError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof EmailAlreadyInUseError) {
        throw new ConflictException(error.message);
      }
      throw error;
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
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks user:update.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({
    description:
      'Would leave zero active SYSTEM_ADMIN users, or a concurrent conflicting update occurred.',
  })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserRequestDto,
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
      'Would leave zero active SYSTEM_ADMIN users, or a concurrent conflicting update occurred.',
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
  private mapMutationError(error: unknown): unknown {
    if (error instanceof UserNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (
      error instanceof LastSystemAdminError ||
      error instanceof TransactionConflictError
    ) {
      return new ConflictException(error.message);
    }
    return error;
  }
}
