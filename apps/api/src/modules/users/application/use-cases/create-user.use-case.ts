import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import { assertCompanyMatchesRole } from '../../domain/maintenance-company-assignment.policy';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { PlainPassword } from '../../domain/password';
import { Role } from '../../domain/role';
import { User } from '../../domain/user.entity';
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../ports/maintenance-company-lookup.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
  maintenanceCompanyId?: string;
}

export interface CreateUserResult {
  id: string;
  email: string;
  role: Role;
  maintenanceCompanyId: string | null;
}

// design.md Data Flow (POST /users) + Decision 8: PlainPassword.create(raw)
// -> PasswordHasher.hash -> IdGenerator.generate() -> UserRepository.create().
// Never returns the password hash (spec.md "Create User", scenario 1).
// maintenance-company design.md Decision 5: assertCompanyMatchesRole runs
// before any hashing or persistence; existsActive only when a company was
// actually supplied (shape 3, spec.md "Nonexistent or soft-deleted company
// rejected").
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(MAINTENANCE_COMPANY_LOOKUP)
    private readonly companyLookup: MaintenanceCompanyLookup,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserResult> {
    // Throws WeakPasswordError before any hashing/persistence occurs
    // (spec.md "Password Strength Policy") — validation only, no I/O.
    const password = PlainPassword.create(input.password);

    const maintenanceCompanyId = input.maintenanceCompanyId ?? null;

    // Domain AUTHORITY for the conditional requirement (spec.md
    // "Create User") — the shared Zod `.superRefine` already rejects both
    // shapes on the HTTP path, this is the backstop for writers that bypass
    // the pipe (e.g. `prisma/seed.ts`).
    assertCompanyMatchesRole(input.role, maintenanceCompanyId);
    if (maintenanceCompanyId !== null) {
      const isLive =
        await this.companyLookup.existsActive(maintenanceCompanyId);
      if (!isLive) {
        throw new MaintenanceCompanyNotFoundError();
      }
    }

    const passwordHash = await this.passwordHasher.hash(password.value);
    const now = new Date();

    const user = new User({
      id: this.idGenerator.generate(),
      email: input.email,
      passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      maintenanceCompanyId,
    });

    // Plain insert (design.md Decision 8) — a duplicate email surfaces as
    // EmailAlreadyInUseError from the adapter, never a silent overwrite
    // like save()'s upsert.
    await this.userRepository.create(user);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      maintenanceCompanyId: user.maintenanceCompanyId,
    };
  }
}
