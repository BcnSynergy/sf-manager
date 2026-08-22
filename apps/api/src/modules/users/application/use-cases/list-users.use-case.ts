import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

export interface ListedUser {
  id: string;
  email: string;
  role: Role;
}

// design.md Data Flow / Testing Strategy: findAll() already excludes
// soft-deleted rows by construction (Decision 10) — this use case adds no
// filtering of its own. Never returns the password hash (spec.md
// "List Users").
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(): Promise<ListedUser[]> {
    const users = await this.userRepository.findAll();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
    }));
  }
}
