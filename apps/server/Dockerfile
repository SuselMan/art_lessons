# Production image for apps/server (Fastify + Socket.io). Built from the
# monorepo root as build context (see docker-compose.prod.yml) since npm
# workspaces need the root package.json/lockfile plus every workspace's own
# package.json to resolve consistently — apps/server alone isn't a valid
# npm-ci context on its own.
#
# @art-lessons/shared (#184): package.json's main/exports point at its own
# compiled ./dist, built by the root postinstall script that `npm ci` below
# already triggers — so by the time it finishes, packages/shared/dist exists
# in this build stage same as apps/server's own dist does. The runtime stage
# below copies packages/shared alongside node_modules (whose
# @art-lessons/shared entry is a symlink into it) so plain `node
# dist/index.js` can actually resolve real (not type-only) imports from it —
# previously it couldn't at all, since main pointed straight at TypeScript
# source, and this stage never copied packages/shared in the first place;
# see #184/#170 for the incident this caused.
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
COPY scripts/brush-import scripts/brush-import
# Pure ink law has one canonical source; compiler bundles it at build time only.
COPY apps/web/src/engine/src/presets/brushBristleInk.ts apps/web/src/engine/src/presets/brushBristleInkBulk.ts apps/web/src/engine/src/presets/brushBristleSaturationTable.ts apps/web/src/engine/src/presets/
# postinstall (prisma generate) needs apps/server/prisma/schema.prisma
# present, hence copying the whole apps/server dir before this rather than
# just its package.json.
RUN npm ci
RUN node scripts/brush-import/fetch-stock.mjs
RUN node scripts/brush-import/build_bristle_saturation.mjs
RUN npm run build --workspace=apps/server

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
# Prisma's query engine needs libssl at runtime — without it present it falls
# back to guessing an OpenSSL version, a real (if usually harmless) warning
# on every start that's cheap to just not have.
# Captured brush uploads execute the packaged bounded Python/Pillow importer.
# prlimit comes from util-linux; SVG uses the same Node and runtime Sharp.
# Text brush masks resolve an installed face offline; DejaVu is the declared
# fallback, and the resulting pixels are captured in CAS for every client.
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 python3-venv util-linux fontconfig fonts-dejavu-core chromium && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/brush-import ./scripts/brush-import
COPY apps/web/dist /app/brush-preview/web
# Keep importer raster APIs identical to the pinned CLI environment; Debian's
# python3-pil is older and lacks APIs used by this importer.
RUN python3 -m venv /opt/brush-python \
    && /opt/brush-python/bin/python -m pip install --no-cache-dir -r /app/scripts/brush-import/requirements.txt \
    && /opt/brush-python/bin/python -c "from PIL import Image; assert hasattr(Image.Image, 'get_flattened_data')"
ENV GRAFETTO_BRUSH_IMPORT_PYTHON=/opt/brush-python/bin/python
ENV GRAFETTO_BRUSH_CHROMIUM=/usr/bin/chromium
ENV GRAFETTO_BRUSH_PREVIEW_URL=http://127.0.0.1
ENV GRAFETTO_BRUSH_PREVIEW_ASSET_DIR=/app/brush-preview/web
ENV GRAFETTO_BRUSH_LIBRARY_DIR=/app/apps/server/resources/brush-stock
ENV GRAFETTO_BRUSH_PREVIEW_SEED_DIR=/app/apps/server/resources/brush-stock/previews
WORKDIR /app/apps/server
EXPOSE 4000
# (#177) `--import` loads the Sentry init before any application module, and
# `--enable-source-maps` makes the reported stack frames point at src/*.ts
# rather than at compiled output. Both are inert without SENTRY_DSN in the
# environment (docker-compose.prod.yml).
#
# (#415, трек #314 §1) `--max-old-space-size` задан явно, и это важнее, чем
# выглядит. Без него V8 выводит потолок кучи из объёма хоста — 493 МБ на
# коробке в 960 МБ, 2006 МБ на нынешней в 3.9 ГБ. То есть цифра, от которой
# зависит, сколько комнат держит сервер, менялась при апгрейде железа молча и
# задним числом, а замер, снятый до апгрейда, переставал что-либо значить.
#
# 1536 МБ выбрано так, чтобы куча упиралась в собственный потолок **раньше**,
# чем контейнер упрётся в `mem_limit: 2g`: V8 у своего потолка сначала
# собирает мусор и только потом падает предсказуемым OOM в логе, тогда как
# cgroup убивает процесс без единой строчки объяснения. Зазор в 512 МБ — под
# то, что в кучу не входит: буферы сокетов, распаковка снапшотов, сам Node.
#
# Что это значит в комнатах (замер 2026-08-10, 11.2 КБ кучи на резидентную
# операцию): ~390 обычных комнат по 300 операций без снапшота, ~1200 комнат со
# снапшотным покрытием, ~39 комнат размером с самую тяжёлую на проде.
CMD ["node", "--max-old-space-size=1536", "--import", "./dist/instrument.js", "--enable-source-maps", "dist/index.js"]
