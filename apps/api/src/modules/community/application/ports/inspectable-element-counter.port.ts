// Port (application layer, ADR-002/013), owned by `community` — NOT
// imported from the `inspectable-element` module. design.md Decision 4:
// `community` does not own InspectableElement and never writes it; it owns
// exactly one question ("how many active elements point at this
// community?"), and Clean Architecture says the consumer owns the contract
// it needs. This is what keeps the Nest module graph acyclic without
// `forwardRef()` — `InspectableElementModule` imports `CommunityModule` for
// `COMMUNITY_REPOSITORY`, while `CommunityModule` imports nothing from
// `inspectable-element` at all. Exact analogue of
// `users/application/ports/maintenance-company-lookup.port.ts`.
export interface InspectableElementCounter {
  // Active = not soft-deleted (ADR-010). Soft-deleted elements do NOT block
  // a community's deletion (community-management spec.md "Soft-deleted
  // elements do not block deletion").
  countActiveByCommunity(communityId: string): Promise<number>;
}

export const INSPECTABLE_ELEMENT_COUNTER = Symbol(
  'INSPECTABLE_ELEMENT_COUNTER',
);
