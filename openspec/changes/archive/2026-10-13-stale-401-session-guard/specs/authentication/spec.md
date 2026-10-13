# Delta for authentication

## MODIFIED Requirements

### Requirement: Redirect When Unauthenticated (Web)

The web app MUST redirect unauthenticated visits to protected routes
to `/login`, including when the session ends mid-session because an
authenticated API call issued under the current session returned 401.
A 401 returned for a call issued under an earlier session MUST NOT end
the current session.
(Previously: any authenticated API call returning 401 ended the session,
regardless of which session issued the call.)

#### Scenario: Unauthenticated visit redirected
- GIVEN no valid session
- WHEN the user navigates to a protected route
- THEN the app MUST redirect to `/login`

#### Scenario: Session ends mid-session
- GIVEN a signed-in user on a protected route
- WHEN an authenticated API call (not login) issued under the current session returns 401
- THEN the local session MUST be cleared and the app MUST redirect to `/login`

#### Scenario: Current-session 401 ends the session and redirects
- GIVEN a signed-in user on a protected route who sent an authenticated API call under the current session
- WHEN that call returns 401
- THEN the local session MUST be cleared
- AND the app MUST redirect to `/login`
- AND the session-ended notice MUST be shown

#### Scenario: Stale 401 after re-login keeps the new session
- GIVEN an authenticated API call was sent under an earlier session
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the app MUST NOT redirect to `/login`
- AND the caller of the earlier call MUST still receive the 401 error

### Requirement: Session-Ended Notice (Web)

When an authenticated API call other than login, issued under the
current session, returns 401 mid-session, the web app MUST end the local
session, redirect to `/login`, and show the notice "Your session has
ended. Please sign in again." (EN, ES and CA). The notice MUST NOT
disclose the reason. A failed login attempt MUST NOT show this notice. A
401 returned for a call issued under an earlier session (before a
re-login or before a logout) MUST NOT end the current session and MUST
NOT show this notice; the caller of that call MUST still receive the 401
error.
(Previously: any authenticated API call returning 401 mid-session ended
the session and showed the notice, regardless of which session issued
the call.)

#### Scenario: Mid-session 401
- GIVEN a signed-in user whose session is no longer accepted by the API
- WHEN any authenticated API call issued under the current session returns 401
- THEN the app MUST land on `/login` showing the session-ended notice
- AND the notice MUST NOT state why the session ended

#### Scenario: Failed login shows no session-ended notice
- GIVEN the login form
- WHEN the login call returns 401
- THEN the generic login error MUST be shown and the session-ended notice MUST NOT

#### Scenario: Localized notice
- GIVEN the UI locale is ES or CA
- WHEN the notice is shown
- THEN it MUST render the corresponding translated string

#### Scenario: Stale 401 after re-login does not end the new session
- GIVEN an authenticated API call was sent under an earlier session
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the session-ended notice MUST NOT be shown
- AND the caller of the earlier call MUST still receive the 401 error

#### Scenario: Stale 401 across logout raises no notice
- GIVEN an authenticated API call was sent before the user logged out
- WHEN the call returns 401 after the logout
- THEN the session-ended notice MUST NOT be shown
- AND the caller of that call MUST still receive the 401 error

#### Scenario: Stale 401 across logout and new login keeps the new session
- GIVEN an authenticated API call was sent before the user logged out
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the session-ended notice MUST NOT be shown

#### Scenario: Current-session 401 still shows the notice
- GIVEN a signed-in user who sent an authenticated API call under the current session
- WHEN that call returns 401
- THEN the local session MUST end, the app MUST land on `/login`, and the session-ended notice MUST be shown
