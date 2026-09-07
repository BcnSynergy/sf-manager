// Thrown by `OpenReviewSessionUseCase` (design.md Decision 8, Phase 4) when
// `repository.create` fails on the hand-written partial unique index
// `ReviewSession_open_draft_key` (Postgres `P2002`) — at most one open
// draft per (community, template, performer) (spec.md "At Most One Open
// Draft Per Community, Template and User"). The presentation layer maps
// this to 409 { code: OPEN_DRAFT_ALREADY_EXISTS }.
export class OpenDraftAlreadyExistsError extends Error {
  constructor() {
    super('An open draft session already exists for this community, template and user');
    this.name = 'OpenDraftAlreadyExistsError';
  }
}
