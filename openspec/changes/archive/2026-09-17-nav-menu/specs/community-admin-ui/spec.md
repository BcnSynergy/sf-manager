# Delta for Community Admin UI

> **Purpose amendment (for archive):** the capability's Purpose closes by
> listing what does not ship, ending *"... audit-log UI, or a global nav
> bar (proposal Out of Scope)"*. The last item becomes false with this
> change: a global role-filtered navigation now exists and carries a
> Communities item for `SYSTEM_ADMIN`, so the section is reachable in one
> click from any authenticated page. Drop *"or a global nav bar (proposal
> Out of Scope)"* from that list and add: *"Reached from the global
> navigation's Communities item, offered to `SYSTEM_ADMIN` on every
> authenticated page (`app-navigation`)."* Everything else holds: no user
> search/autocomplete, no cross-community assignment views, no
> community-scoped authorization, no pagination/filtering/sorting, no
> restore of soft-deleted communities and no audit-log UI.
>
> **No `ADDED Requirements` block in this delta (fix round, item 5).** A
> duplicate *"...Is Reachable From the Global Navigation"* requirement was
> dropped from here: that fact is already fully covered by
> `app-navigation`'s own role → items requirement (*The Role → Navigation
> Items Map Is Exhaustive and Fixed*), which is the single source of truth
> for reachability. Per this project's walking-skeleton discipline
> (ADR-006), spec surface stays minimal — this capability's Purpose
> amendment above is sufficient to record that the pre-existing gap is
> closed.
