import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import { PlainPassword } from '../../domain/password';
import { Role } from '../../domain/role';
import { User } from '../../domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
}

export interface CreateUserResult {
  id: string;
  email: string;
  role: Role;
}

// design.md Data Flow (POST /users) + Decision 8: PlainPassword.create(raw)
// -> PasswordHasher.hash -> IdGenerator.generate() -> UserRepository.create().
// Never returns the password hash (spec.md "Create User", scenario 1).
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserResult> {
    // Throws WeakPasswordError before any hashing/persistence occurs
    // (spec.md "Password Strength Policy").
    const password = PlainPassword.create(input.password);
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
    });

    // Plain insert (design.md Decision 8) — a duplicate email surfaces as
    // EmailAlreadyInUseError from the adapter, never a silent overwrite
    // like save()'s upsert.
    await this.userRepository.create(user);

    return { id: user.id, email: user.email, role: user.role };
  }
}
