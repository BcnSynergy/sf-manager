import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { Role } from '../../../domain/role';
import { User } from '../../../domain/user.entity';
import { UserRepository } from '../../ports/user.repository.port';

// Test double for UserRepository (design.md Testing Strategy: "In-memory
// fake repo whose transactional runs the callback inline" — no real
// isolation; that guarantee is infrastructure and lands with
// PrismaUserRepository in PR 6). Shared across the four use-case unit specs
// (tasks.md 5.6).
export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, User>();

  seed(user: User): void {
    this.usersById.set(user.id, user);
  }

  findByEmail(email: string): Promise<User | null> {
    for (const user of this.usersById.values()) {
      if (user.email === email && !user.isDeleted) {
        return Promise.resolve(user);
      }
    }
    return Promise.resolve(null);
  }

  // Upsert-by-email (design.md Decision 8) — mirrors
  // PrismaUserRepository.save(), unused by the four use cases added in this
  // PR but kept so this fake fully satisfies the port.
  save(user: User): Promise<void> {
    for (const [id, existing] of this.usersById) {
      if (existing.email === user.email) {
        this.usersById.delete(id);
        break;
      }
    }
    this.usersById.set(user.id, user);
    return Promise.resolve();
  }

  findById(id: string): Promise<User | null> {
    const user = this.usersById.get(id);
    if (!user || user.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(user);
  }

  findAll(): Promise<User[]> {
    return Promise.resolve(
      [...this.usersById.values()].filter((user) => !user.isDeleted),
    );
  }

  create(user: User): Promise<void> {
    // Mirrors the real unique index on User.email (schema.prisma: a plain
    // @unique column, not scoped to active rows) — ANY existing row with
    // this email, active or soft-deleted, rejects the insert (design.md
    // Decision 8).
    for (const existing of this.usersById.values()) {
      if (existing.email === user.email) {
        return Promise.reject(new EmailAlreadyInUseError());
      }
    }
    this.usersById.set(user.id, user);
    return Promise.resolve();
  }

  updateById(
    id: string,
    changes: {
      email?: string;
      role?: Role;
      maintenanceCompanyId?: string | null;
    },
  ): Promise<void> {
    const existing = this.usersById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.usersById.set(
      id,
      new User({
        ...existing,
        email: changes.email ?? existing.email,
        role: changes.role ?? existing.role,
        // Mirrors PrismaUserRepository.updateById passing `changes` straight
        // through as Prisma `data`: Prisma strips undefined-valued keys from
        // the update entirely (column untouched), while an explicit `null`
        // clears it. Checking `!== undefined` (not `'in' changes`) matches
        // that -- a present-but-undefined key must NOT be treated as "clear"
        // here, only an explicit null does (design.md Decision 5, no
        // auto-clear on a bare role change).
        maintenanceCompanyId:
          changes.maintenanceCompanyId !== undefined
            ? changes.maintenanceCompanyId
            : existing.maintenanceCompanyId,
        updatedAt: new Date(),
      }),
    );
    return Promise.resolve();
  }

  softDeleteById(id: string): Promise<void> {
    const existing = this.usersById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.usersById.set(
      id,
      new User({ ...existing, deletedAt: new Date(), updatedAt: new Date() }),
    );
    return Promise.resolve();
  }

  countActiveByRole(role: Role): Promise<number> {
    let count = 0;
    for (const user of this.usersById.values()) {
      if (user.role === role && !user.isDeleted) {
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  // maintenance-company design.md Decision 4: mirrors countActiveByRole
  // above -- kept in sync with UserRepository so this fake fully satisfies
  // the port (used by community's SoftDeleteMaintenanceCompanyUseCase fake
  // wiring in a later phase; not exercised by any Phase 5 caller yet).
  countActiveByMaintenanceCompany(
    maintenanceCompanyId: string,
  ): Promise<number> {
    let count = 0;
    for (const user of this.usersById.values()) {
      if (
        user.maintenanceCompanyId === maintenanceCompanyId &&
        !user.isDeleted
      ) {
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  // No real isolation/concurrency abort (design.md Testing Strategy — that
  // guarantee is infrastructure, tested against a real Postgres in PR 6),
  // but the port contract's other half — "a rejected work MUST roll back"
  // — is a real, testable behavior even without isolation: snapshot the
  // map, run the callback inline against `this`, and restore the snapshot
  // if `work` throws (e.g. assertSystemAdminRemains rejecting a demotion).
  transactional<T>(work: (repo: UserRepository) => Promise<T>): Promise<T> {
    const snapshot = new Map(this.usersById);
    return work(this).catch((error: unknown) => {
      this.usersById.clear();
      for (const [id, user] of snapshot) {
        this.usersById.set(id, user);
      }
      throw error;
    });
  }
}
