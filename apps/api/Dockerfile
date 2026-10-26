# Production image for the API (odd/tasks/deployment.md, S2-S4). Build it
# from the repository root, which holds the npm workspace:
#   docker build -f apps/api/Dockerfile .
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

# Links the image published by CI (ghcr.io/bcnsynergy/sf-manager-api, EN-91)
# to this repository; it inherits the repository's access permissions (not its
# visibility: GHCR makes a new package private).
LABEL org.opencontainers.image.source=https://github.com/BcnSynergy/sf-manager

# Prisma's schema engine (`prisma migrate deploy`) links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# `npm ci` only accepts the lockfile when every workspace manifest is
# present, even though only the API and its validation package install.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/validation/package.json packages/validation/
COPY packages/api-contracts/package.json packages/api-contracts/
RUN npm ci --workspace=@sf-manager/api --workspace=@sf-manager/validation

COPY packages/validation packages/validation
COPY apps/api apps/api
# prisma.config.ts reads DATABASE_URL even for `prisma generate`; the build
# connects to no database, so a placeholder satisfies it.
RUN npm run build --workspace=@sf-manager/validation \
  && DATABASE_URL=postgresql://build@localhost/build \
    npm run build --workspace=@sf-manager/api

ENV NODE_ENV=production
# Keeps npm's update notice out of the migration and seed output.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/apps/api
USER node
EXPOSE 3000

# Dev dependencies stay installed on purpose: `prisma migrate deploy` needs
# the Prisma CLI, and the admin seed (`npx prisma db seed`) runs through
# ts-node. Migrations run before the API starts, and a failed migration
# exits the container instead of serving the old schema (S3).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main"]
