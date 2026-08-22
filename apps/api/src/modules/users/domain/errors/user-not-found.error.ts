// Thrown by UpdateUserUseCase/DeactivateUserUseCase (application layer,
// PR 5) when the given id does not resolve to an existing (and, per
// UserRepository.findById's default deletedAt: null filter, active) user
// (spec.md "Update User", "Update targets a non-existent user"). Not part
// of Phase 4's originally listed domain errors — added here because it is
// the minimal domain type this slice's spec scenario requires; the
// application layer maps it to 404.
export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}
