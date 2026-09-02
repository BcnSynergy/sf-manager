# Delta for Community Admin UI

## ADDED Requirements

### Requirement: Navigation to Inspectable Elements

The system MUST show a link from `CommunityDetailPage` to that
community's inspectable elements. The inspectable-elements pages MUST
be reachable only through a valid community id carried from that link
— not by a standalone, community-independent URL.

#### Scenario: Admin navigates to a community's elements from its detail page
- GIVEN the `SYSTEM_ADMIN` is viewing an existing community's detail page
- WHEN they follow the inspectable-elements link
- THEN they MUST land on that community's elements list, scoped to its id

#### Scenario: Elements pages require a valid community id
- GIVEN no valid community id backs the current inspectable-elements route
- WHEN the `SYSTEM_ADMIN` reaches that route
- THEN the system MUST NOT render an elements list for an unresolved or invalid community
