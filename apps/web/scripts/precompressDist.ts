// Pre-compresses the built bundle so nginx can answer with `gzip_static`
// instead of gzipping the same bytes again for every visitor (#437).
//
// What this fixes is not "gzip was off". `gzip on` has been set all along —
// but `gzip_types` at the server level *replaces* the inherited list rather
// than extending it, and the list in deploy/nginx.conf was written for the
// proxied JSON of /socket.io/ and /api/. `application/javascript` and
// `text/css` were never in it, and nginx's own default is `text/html` alone,
// so index.html compressed and every chunk it names did not. Measured on prod
// before this change: 1020 KB of JS/CSS/HTML on the wire where gzip gives 314.
//
// Runs as `postbuild`, i.e. automatically after `npm run build` — including in
// CI, which is the only build whose output reaches the VPS (deploy.yml builds
// apps/web, uploads dist/ as an artifact, and the deploy job rsyncs it into
// ~/web-dist-incoming/). Nothing here is committed: the .gz files live and die
// with dist/, which Vite empties on every build.
//
// Explicitly a `postbuild` and not a Vite plugin: the Sentry plugin deletes
// dist/**/*.js.map from inside the build (vite.config.ts), and a plugin racing
// that could compress and ship a source map we go to some trouble not to
// publish. Afterwards there is nothing left to get wrong.
//
// ---------------------------------------------------------------------------
// Why offline rather than letting nginx do it per request
//
//   - CPU is this box's first limiting resource, not memory. #424 measured a
//     single event loop saturating at ~100 simultaneously drawing rooms on two
//     vCPUs. Recompressing a megabyte of identical JS for every cold visitor
//     competes with that for nothing.
//   - Being offline makes level 9 free. nginx runs at 6 because a request is
//     waiting on it; here nobody is.
//   - gzip_static keeps Content-Length. A response gzipped on the fly has no
//     length known up front, so it goes out chunked and loses Content-Length,
//     Accept-Ranges and its strong ETag — exactly the loss documented at the
//     `.paper` location in deploy/nginx.conf, where it is what breaks the
//     room's download progress bar.
//
// `gzip on` stays configured next to it and is not redundant: gzip_static can
// only answer for a static file that has a .gz twin on disk, so every proxied
// /api/ and /socket.io/ response — generated per request, impossible to
// pre-compress — still needs the on-the-fly path.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, constants as zlibConstants } from 'node:zlib'

import { COMPRESSIBLE_EXTENSIONS, MIN_COMPRESSIBLE_BYTES } from './precompressPolicy.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, '..', 'dist')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

function main() {
  let rawTotal = 0
  let gzTotal = 0
  let written = 0
  let skippedNotSmaller = 0

  for (const file of walk(DIST)) {
    if (!COMPRESSIBLE_EXTENSIONS.has(extname(file).toLowerCase())) continue
    if (statSync(file).size < MIN_COMPRESSIBLE_BYTES) continue

    const raw = readFileSync(file)
    const gz = gzipSync(raw, { level: zlibConstants.Z_BEST_COMPRESSION })

    // Strictly smaller, or it is not written. gzip_static serves whatever twin
    // it finds without comparing sizes, so a twin that lost is a twin that
    // makes every visitor download more.
    if (gz.length >= raw.length) {
      skippedNotSmaller++
      continue
    }

    writeFileSync(`${file}.gz`, gz)
    rawTotal += raw.length
    gzTotal += gz.length
    written++
  }

  if (written === 0) {
    // dist/ exists — walk() would have thrown otherwise — but holds nothing we
    // recognise. A build that changed shape, or one that failed quietly. Fail
    // loudly here, because the only symptom downstream is "the site feels a
    // bit slow", which nobody traces back to a missing postbuild step.
    throw new Error(`No compressible files under ${DIST} — did the build produce anything?`)
  }

  const pct = Math.round((100 * (rawTotal - gzTotal)) / rawTotal)
  console.log(`Pre-compressed ${written} files in ${relative(process.cwd(), DIST)}`)
  console.log(`  ${(rawTotal / 1024).toFixed(0)} KB -> ${(gzTotal / 1024).toFixed(0)} KB (-${pct}%)`)
  if (skippedNotSmaller > 0) {
    console.log(`  ${skippedNotSmaller} skipped: gzip did not make them smaller`)
  }
}

try {
  main()
} catch (err: unknown) {
  console.error(err)
  process.exit(1)
}
