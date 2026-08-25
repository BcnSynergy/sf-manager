// Thrown by community-assignments application use cases (design.md File
// Changes) when a given (communityId, userId) pair does not resolve to an
// existing representative or technician assignment record — e.g.
// deactivating or reactivating a pair that was never created. The
// application layer maps this to 404.
export class AssignmentNotFoundError extends Error {
  constructor() {
    super('Assignment not found');
    this.name = 'AssignmentNotFoundError';
  }
}
