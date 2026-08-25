import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { CommunityTechnicianRepository } from '../../application/ports/community-technician.repository.port';
import { CommunityTechnicianMapper } from './community-technician.mapper';

// Prisma unique-constraint violation code.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

// Prisma adapter for the CommunityTechnicianRepository port (ADR-013).
// tasks.md 9.5. Deliberately simpler than
// PrismaCommunityRepresentativeRepository: this table has exactly ONE
// unique constraint — the plain `@@unique([communityId, userId])`
// (design.md Decision 1/Interfaces — "deliberately missing the exclusivity
// index"). There is no partial unique index and no SERIALIZABLE
// transaction wrap here, because there is nothing to race: any number of
// technicians can be active in the same community, and the same technician
// can be active in any number of communities. That means a P2002 on this
// table can ONLY be the plain (communityId, userId) pair violation — no
// driver-adapter column disambiguation is needed (contrast with
// PrismaCommunityRepresentativeRepository.isPlainPairViolation, which
// exists specifically because THAT table has two unique constraints to
// distinguish between). Does NOT extend SoftDeletableRepository (design.md
// Decision 3 — deactivatedAt is domain state, not an administrative
// delete).
@Injectable()
export class PrismaCommunityTechnicianRepository implements CommunityTechnicianRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityTechnician | null> {
    const record = await this.prisma.communityTechnician.findFirst({
      where: { communityId, userId },
    });

    return record ? CommunityTechnicianMapper.toDomain(record) : null;
  }

  // Active AND deactivated records — Phase 10's list-assignments route.
  async listByCommunity(communityId: string): Promise<CommunityTechnician[]> {
    const records = await this.prisma.communityTechnician.findMany({
      where: { communityId },
    });

    return records.map((record) => CommunityTechnicianMapper.toDomain(record));
  }

  // Plain insert. The (communityId, userId) unique constraint means the
  // pair already has a record, active or deactivated ->
  // AssignmentAlreadyExistsError (design.md Decision 4). Unlike the
  // representative adapter, no other unique constraint exists on this
  // table, so every P2002 here unambiguously means this.
  async create(assignment: CommunityTechnician): Promise<void> {
    try {
      await this.prisma.communityTechnician.create({
        data: CommunityTechnicianMapper.toPersistence(assignment),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AssignmentAlreadyExistsError();
      }
      throw error;
    }
  }

  // NULL = reactivate, a Date = deactivate (design.md Decision 3). Callers
  // (the use cases) always check existence first via
  // findByCommunityAndUser, mirroring
  // PrismaCommunityRepresentativeRepository.setDeactivatedAt's precedent.
  // Neither branch touches communityId/userId, so this can never trigger
  // the unique constraint — no try/catch needed (contrast with the
  // representative adapter, where reactivation can hit the partial index).
  async setDeactivatedAt(
    communityId: string,
    userId: string,
    at: Date | null,
  ): Promise<void> {
    await this.prisma.communityTechnician.update({
      where: { communityId_userId: { communityId, userId } },
      data: { deactivatedAt: at },
    });
  }
}
