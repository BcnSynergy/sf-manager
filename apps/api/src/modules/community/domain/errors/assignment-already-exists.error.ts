// Thrown by AddRepresentativeUseCase / AddTechnicianUseCase (design.md
// Decision 4) when a POST to an assignment collection targets a
// (communityId, userId) pair that already has a record — active or
// deactivated. The application layer maps this to 409, pointing the
// caller at the reactivate route instead.
export class AssignmentAlreadyExistsError extends Error {
  constructor() {
    super(
      'Assignment already exists for this community and user; use reactivate instead',
    );
    this.name = 'AssignmentAlreadyExistsError';
  }
}
