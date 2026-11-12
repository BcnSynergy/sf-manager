# Production image for the API (odd/tasks/deployment.md, S2-S4). Build it
# from the repository root, which holds the npm workspace:
#   docker build -f apps/api/Dockerfile .
#
# Two stages (EN-93): `build` installs every dependency and compiles the API,
# the validation package and the admin seed; `runtime` installs only
# production dependencies and copies the compiled output, so the image ships
# no dev dependencies, TypeScript sources or tests.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS base

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

FROM base AS build

RUN npm ci --workspace=@sf-manager/api --workspace=@sf-manager/validation

COPY packages/validation packages/validation
COPY apps/api apps/api
# prisma.config.ts reads DATABASE_URL even for `prisma generate`; the build
# connects to no database, so a placeholder satisfies it. The seed compiles
# after `nest build`, which empties dist/ first.
RUN npm run build --workspace=@sf-manager/validation \
  && DATABASE_URL=postgresql://build@localhost/build \
    npm run build --workspace=@sf-manager/api \
  && npx --workspace=@sf-manager/api tsc -p tsconfig.seed.json

FROM base AS runtime

# Links the image published by CI (ghcr.io/bcnsynergy/sf-manager-api, EN-91)
# to this repository, so it inherits the repository's access permissions.
LABEL org.opencontainers.image.source=https://github.com/BcnSynergy/sf-manager

# The Prisma CLI is a production dependency of the API: migrations run when
# the container starts.
RUN npm ci --omit=dev --workspace=@sf-manager/api --workspace=@sf-manager/validation \
  && npm cache clean --force

COPY --from=build /app/packages/validation/dist packages/validation/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
# The generated Prisma client lives in node_modules, which this stage
# installed afresh, so it is generated again here.
RUN cd apps/api && DATABASE_URL=postgresql://build@localhost/build npx prisma generate

ENV NODE_ENV=production
# `npx prisma db seed` runs the compiled admin seed, not ts-node.
ENV PRISMA_SEED_COMMAND="node dist/seed/prisma/seed.js"
# Uploaded files such as the organization logo (FileStorage). Created here,
# owned by `node`, so a named volume mounted on it starts writable.
ENV FILE_STORAGE_DIR=/var/lib/sf-manager/files
RUN mkdir -p "$FILE_STORAGE_DIR" && chown node:node "$FILE_STORAGE_DIR"
# Keeps npm's update notice out of the migration and seed output.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/apps/api
USER node
EXPOSE 3000

# Migrations run before the API starts, and a failed migration exits the
# container instead of serving the old schema (S3).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main"]
