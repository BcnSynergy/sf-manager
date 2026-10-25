# Production image for the web app (odd/tasks/deployment.md, S5, S7): the
# Vite build served by Caddy, which also forwards /api/* to the API. Build it
# from the repository root, which holds the npm workspace:
#   docker build -f apps/web/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app

# `npm ci` only accepts the lockfile when every workspace manifest is
# present, even though only the web app and its validation package install.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/validation/package.json packages/validation/
COPY packages/api-contracts/package.json packages/api-contracts/
RUN npm ci --workspace=@sf-manager/web --workspace=@sf-manager/validation

COPY packages/validation packages/validation
COPY apps/web apps/web
# The browser calls the API on the same origin, under the prefix Caddy
# strips; the production auth cookie is SameSite=Strict, so a separate API
# origin would not receive it.
ARG VITE_API_BASE_URL=/api
RUN VITE_API_BASE_URL=$VITE_API_BASE_URL npm run build --workspace=@sf-manager/web

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
