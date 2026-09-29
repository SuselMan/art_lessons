import { PAPER_GRAIN_TYPES, type PaperGrainType } from '@grafetto/shared'

// Extension is mandatory here and nowhere else in this directory: the bake
// imports this module, so it is compiled under the node16 project's
// resolution as well as the app's bundler one, and node16 rejects an
// extensionless relative import. `npm run typecheck` only builds the app
// project and passes without it — `tsc -b`, which the build runs, does not.
import { PAPER_CATCH_LUT_SIZE } from './paperCatch.js'

// (#322) The name index for the baked paper assets.
//
// The bake's filenames are content-hashed (`coarse.3f2a91c7.paper`) so that
// nginx can serve them `immutable` — a URL that can never change meaning is
// the only kind that is safe to cache for a year, and the ~4 MB texture is
// the single biggest thing a returning user was re-downloading daily. But a
// hashed name is by definition not derivable at runtime, so something has to
// map PaperGrainType -> filename. This file defines that something.
//
// Why the map is fetched at runtime rather than generated as a TS module and
// bundled — the alternative that would have cost one fewer round trip:
//
//  - `apps/web/public/paper/` is gitignored (the bake is a prebuild step; its
//    12 MB of output is deliberately not in git history — see .gitignore).
//    A committed TS module would therefore be a *claim* about a bake nobody
//    can verify from the repo, and the bake is only reproducible for a fixed
//    sharp/libvips build. Any drift means a 404, and a 404 here means no
//    paper texture at all, which silently disables drawing (engine/index.ts's
//    _paperTexLoaded gate).
//  - `npm run dev` does not run `prebuild`, so a generated-and-imported
//    module would hard-fail a fresh checkout's dev server at *compile* time
//    rather than at fetch time with a message that says what to run.
//
// So the manifest is written by the bake, lives next to the files it names,
// and is gitignored with them. Its own name is fixed and therefore must NOT
// be cached immutable — it is the one unhashed pointer into an immutable set,
// exactly like index.html is for /assets/ (see deploy/nginx.conf).

/** Fixed name, in the same directory as the assets it indexes. */
export const PAPER_MANIFEST_FILENAME = 'manifest.json'

/** Bumped only if the shape below changes incompatibly. A manifest carrying
 *  any other version is rejected outright rather than read optimistically:
 *  the failure mode of guessing wrong is a blank-paper canvas that looks like
 *  a rendering bug, days away from the deploy that caused it. */
//
// (#441) 2: `.paper` is a bare height plane rather than an interleaved
// LUMINANCE_ALPHA grid, and `catchLut` appeared to rebuild the missing
// channel. Bumping is load-bearing here rather than tidy — a v1 payload read
// as v2 is half the expected resolution and every texel's tooth is garbage,
// which renders as paper that looks *plausible* and draws wrong.
export const PAPER_MANIFEST_VERSION = 2

/** One paper's two files. `*Bytes` are the on-the-wire (gzip stream) sizes,
 *  not the decompressed payload — see paperAssetIO.ts's PaperAssetNames. */
export interface PaperAssetEntry {
  texture: string
  textureBytes: number
  preview: string
  previewBytes: number
  /** (#441) The 256-entry fixed-point table that turns this paper's height
   *  bytes back into its graphite-catch channel — see paperCatch.ts, which
   *  owns both the format and the reason the channel is not shipped.
   *
   *  In the manifest rather than in the `.paper` payload on purpose. The table
   *  is a function of the paper's display gamma and `catchGain` only, so
   *  re-tuning the gain leaves the height plane — and therefore its content
   *  hash and its `immutable` URL — untouched, and a client picks the new
   *  tooth up from the one document that is always re-read. Folded into the
   *  payload it would instead invalidate 3.8 MB per client to change 2 KB. */
  catchLut: number[]
}

export interface PaperManifest {
  version: number
  /** Keyed by PaperGrainType, and complete: every grain type is present.
   *  `flat` is absent by construction — it has no asset and never will (it is
   *  two constant bytes synthesised in paperLoader.ts), and both call sites
   *  short-circuit it before they ever reach the manifest. */
  assets: Record<PaperGrainType, PaperAssetEntry>
}

/** The exact shape the bake emits: `<type>.<8 hex>.<paper|preview>`.
 *
 *  These two strings are the only values in the whole pipeline that arrive
 *  over the network and are then concatenated into a URL that gets fetched, so
 *  they are the one place a shape check is worth more than the strictness it
 *  costs. A name containing `../` would climb out of /paper/, and one starting
 *  `//` would become protocol-relative and point at another origin entirely.
 *  Same-origin delivery makes that unreachable today; the check is here so it
 *  stays unreachable if the manifest ever gains another writer. It also
 *  catches the duller failure — a differently-shaped future bake — at parse
 *  time, with a message, rather than as a 404 three calls later. */
const ASSET_NAME = /^[a-z]+\.[0-9a-f]{8}\.(paper|preview)$/

/** (#441) Checked element by element rather than by length alone, because
 *  every one of these is read 4.2M times into arithmetic that has no way to
 *  notice a bad value: a `null` would turn a texel's tooth into NaN, which
 *  fails every comparison in buildPaperCatch and writes 0 — a silently
 *  toothless paper rather than an error. */
function isCatchLut(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== PAPER_CATCH_LUT_SIZE) return false
  return v.every(n => typeof n === 'number' && Number.isFinite(n))
}

function isEntry(v: unknown): v is PaperAssetEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.texture === 'string' && ASSET_NAME.test(e.texture)
    && typeof e.preview === 'string' && ASSET_NAME.test(e.preview)
    && typeof e.textureBytes === 'number' && typeof e.previewBytes === 'number'
    && isCatchLut(e.catchLut)
}

/** Validates parsed JSON into a PaperManifest, or throws saying exactly what
 *  is wrong with it and how to regenerate it.
 *
 *  Deliberately strict in both directions — every grain type must be present,
 *  and no key may name a type that no longer exists. A *superset* is as much
 *  of a problem as a missing key: it means a type was dropped from
 *  PAPER_GRAIN_TYPES and this manifest is from before that, i.e. the hashes
 *  in it predate whatever else changed at the same time. Both checks exist
 *  because the cheap alternative (index and hope) turns a stale manifest into
 *  a silent 404 rather than an error that names the cause.
 *
 *  `source` is the URL or path the JSON came from, so the thrown message is
 *  actionable from a browser console with no other context. */
export function parsePaperManifest(raw: unknown, source: string): PaperManifest {
  const fail = (why: string): never => {
    throw new Error(`Paper manifest '${source}' ${why}. Re-run \`npm run bake:paper\` in apps/web.`)
  }

  if (typeof raw !== 'object' || raw === null) fail('is not an object')
  const m = raw as Record<string, unknown>

  if (m.version !== PAPER_MANIFEST_VERSION) {
    fail(`has version ${String(m.version)}, expected ${PAPER_MANIFEST_VERSION}`)
  }
  if (typeof m.assets !== 'object' || m.assets === null) fail('has no `assets` object')
  const assets = m.assets as Record<string, unknown>

  for (const type of PAPER_GRAIN_TYPES) {
    if (!(type in assets)) fail(`is missing paper type '${type}'`)
    if (!isEntry(assets[type])) fail(`has a malformed entry for paper type '${type}'`)
  }
  for (const key of Object.keys(assets)) {
    if (!(PAPER_GRAIN_TYPES as readonly string[]).includes(key)) {
      fail(`names paper type '${key}', which no longer exists — it predates the current PAPER_GRAIN_TYPES`)
    }
  }

  return m as unknown as PaperManifest
}
