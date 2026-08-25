import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { DeactivateTechnicianUseCase } from './deactivate-technician.use-case';
import { InMemoryCommunityTechnicianRepository } from './testing/in-memory-community-technician.repository';

const makeTechnician = (
  overrides: Partial<{
    id: string;
    communityId: string;
    userId: string;
    deactivatedAt: Date | null;
  }> = {},
): CommunityTechnician =>
  new CommunityTechnician({
    id: 'assignment-1',
    communityId: 'community-1',
    userId: 'user-1',
    deactivatedAt: null,
    ...overrides,
  });

// tasks.md 9.3 + community-assignments spec.md "Technician Deactivation and
// Reactivation" — a reversible toggle (deactivatedAt, not deletedAt), with
// no exclusivity side effect on any other technician.
describe('DeactivateTechnicianUseCase', () => {
  let technicianRepository: InMemoryCommunityTechnicianRepository;
  let useCase: DeactivateTechnicianUseCase;

  beforeEach(() => {
    technicianRepository = new InMemoryCommunityTechnicianRepository();
    useCase = new DeactivateTechnicianUseCase(technicianRepository);
  });

  it('deactivates an active assignment', async () => {
    await technicianRepository.create(makeTechnician());

    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const stored = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(stored?.isActive).toBe(false);
  });

  it('throws AssignmentNotFoundError when no record exists for the pair', async () => {
    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'missing' }),
    ).rejects.toThrow(AssignmentNotFoundError);
  });

  it('leaves other technicians in the same community untouched (triangulation)', async () => {
    await technicianRepository.create(makeTechnician());
    await technicianRepository.create(
      makeTechnician({ id: 'assignment-2', userId: 'user-2' }),
    );

    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const other = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-2',
    );
    expect(other?.isActive).toBe(true);
  });

  it('leaves the same technician in a different community untouched (triangulation)', async () => {
    await technicianRepository.create(makeTechnician());
    await technicianRepository.create(
      makeTechnician({ id: 'assignment-2', communityId: 'community-2' }),
    );

    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const other = await technicianRepository.findByCommunityAndUser(
      'community-2',
      'user-1',
    );
    expect(other?.isActive).toBe(true);
  });
});
