# Production image for apps/server (Fastify + Socket.io). Built from the
# monorepo root as build context (see docker-compose.prod.yml) since npm
# workspaces need the root package.json/lockfile plus every workspace's own
# package.json to resolve consistently — apps/server alone isn't a valid
# npm-ci context on its own.
#
# @art-lessons/shared is a type-only dependency here (every import site in
# apps/server/src is `import type`, see grep) — tsc erases it entirely from
# the compiled output, so the runtime stage never needs the shared package's
# source or a build step for it at all, just its types during the build
# stage's own tsc pass.
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Prisma generate (npm ci's postinstall, below) detects the *build* image's
# own OpenSSL to pick which query-engine binary to generate — must be
# installed here too, matching the runtime stage exactly, or generate-time
# detection and run-time reality disagree (this really happened: guessed
# openssl-1.1.x with neither stage having openssl installed worked, since
# both sides were consistently wrong the same way — but installing the real
# OpenSSL 3.x in *only* the runtime stage broke it outright, wrong-engine
# binary, container crash-looped on start).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server apps/server
COPY packages/shared packages/shared
# postinstall (prisma generate) needs apps/server/prisma/schema.prisma
# present, hence copying the whole apps/server dir before this rather than
# just its package.json.
RUN npm ci
RUN npm run build --workspace=apps/server

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
# Prisma's query engine needs libssl at runtime — without it present it falls
# back to guessing an OpenSSL version, a real (if usually harmless) warning
# on every start that's cheap to just not have.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/package.json ./package.json
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
