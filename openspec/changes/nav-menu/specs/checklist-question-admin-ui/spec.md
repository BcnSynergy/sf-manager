# Delta for Checklist Question Admin UI

> **Purpose amendment (for archive):** the capability's Purpose states
> the surface is *"Reached by URL — there is no global nav bar and no
> parent page to hang an entry point from (pre-existing gap, carried
> forward)"*. That guard becomes false with this change: a global
> role-filtered navigation now exists and carries a Checklist questions
> item for `SYSTEM_ADMIN`, so the section is reachable in one click from
> any authenticated page. Replace that clause with: *"Reached from the
> global navigation's Checklist questions item, offered to `SYSTEM_ADMIN`
> on every authenticated page (`app-navigation`); no parent page hangs an
> entry point from within this surface."* Everything else holds: no
> question detail page beyond edit, no search, no pagination, no restore
> of soft-deleted questions, no audit-log UI.
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
