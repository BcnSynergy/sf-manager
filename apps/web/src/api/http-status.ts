// HTTP statuses the web app branches on, shared by api/client and
// AuthProvider so both classify answers the same way.
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_TOO_MANY_REQUESTS = 429;
// Lowest 5xx status: any answer at or above it is a server error.
export const HTTP_SERVER_ERROR_MIN = 500;
