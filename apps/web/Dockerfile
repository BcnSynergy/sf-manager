# Production image for the web app (odd/tasks/deployment.md, S5, S7): the
# Vite build served by Caddy, which also forwards /api/* to the API. Build it
# from the repository root, which holds the npm workspace:
#   docker build -f apps/web/Dockerfile .
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
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

FROM caddy:2-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
# Links the image published by CI (ghcr.io/bcnsynergy/sf-manager-web, EN-91)
# to this repository, so the package inherits its visibility.
LABEL org.opencontainers.image.source=https://github.com/BcnSynergy/sf-manager
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
