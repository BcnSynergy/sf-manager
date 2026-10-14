# Delta for Review Template Admin UI

> **Purpose amendment (for archive):** the capability's Purpose states
> the surface is _"Reached by URL — no global nav bar exists
> (pre-existing gap, carried forward)"_. That guard becomes false with
> this change: a global role-filtered navigation now exists and carries a
> Review templates item for `SYSTEM_ADMIN`, so the section is reachable
> in one click from any authenticated page. Replace that clause with:
> _"Reached from the global navigation's Review templates item, offered
> to `SYSTEM_ADMIN` on every authenticated page (`app-navigation`)."_
> Everything else holds: no template duplication or "clone as new draft",
> no restore of soft-deleted drafts, no session/run surface, no search or
> pagination.
>
> **No `ADDED Requirements` block in this delta (fix round, item 5).** A
> duplicate _"...Is Reachable From the Global Navigation"_ requirement was
> dropped from here: that fact is already fully covered by
> `app-navigation`'s own role → items requirement (_The Role → Navigation
> Items Map Is Exhaustive and Fixed_), which is the single source of truth
> for reachability. Per this project's walking-skeleton discipline
> (ADR-006), spec surface stays minimal — this capability's Purpose
> amendment above is sufficient to record that the pre-existing gap is
> closed.
