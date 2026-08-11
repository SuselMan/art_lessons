// What the build pre-compresses, and what it must never touch (#437).
//
// Split out of precompressDist.ts for the same reason src/pwa/workboxConfig.ts
// is split out of vite.config.ts: the failure this guards against is silent.
// Adding an already-compressed asset type here costs a wasted build second and
// then ships a .gz twin *larger* than its original, which nginx serves in
// preference — so every visitor downloads more, and nothing about the build,
// the deploy or the page says so. Asserting it needs a test that runs without
// a build, and a test cannot run a module that walks dist/ at import time.

/** Extensions worth compressing.
 *
 *  An allowlist on purpose. A denylist ("everything except .paper") is wrong
 *  the first time an already-compressed asset lands and nobody remembers to
 *  exclude it. That the loss is real and not theoretical is measured: a full
 *  comp_level 6 pass over the paper bake came out 2 KB *bigger* than its
 *  input (#342, and see the `.paper` location in deploy/nginx.conf).
 *
 *  Deliberately absent, each already compressed: `.paper` and `.preview` (gzip
 *  streams the bake wrote itself), `.png`, `.woff2`. */
export const COMPRESSIBLE_EXTENSIONS = new Set([
  '.js',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.webmanifest',
  '.txt',
  '.ico',
])

/** Below this, the ~20-byte gzip envelope and one more file on disk buy
 *  nothing worth having. Same number as `gzip_min_length` in
 *  deploy/nginx.conf, so the static and on-the-fly paths draw the line in the
 *  same place. */
export const MIN_COMPRESSIBLE_BYTES = 512
