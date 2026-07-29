import { PAPER_GRAIN_TYPES, type PaperGrainType } from '@grafetto/shared'

// (#322) The name index for the baked paper assets.
//
// The bake's filenames are content-hashed (`coarse.3f2a91c7.paper`) so that
// nginx can serve them `immutable` — a URL that can never change meaning is
// the only kind that is safe to cache for a year, and the ~7.4 MB texture is
// the single biggest thing a returning user was re-downloading daily. But a
// hashed name is by definition not derivable at runtime, so something has to
// map PaperGrainType -> filename. This file defines that something.
//
// Why the map is fetched at runtime rather than generated as a TS module and
// bundled — the alternative that would have cost one fewer round trip:
//
//  - `apps/web/public/paper/` is gitignored (the bake is a prebuild step; its
//    22 MB of output is deliberately not in git history — see .gitignore).
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
export const PAPER_MANIFEST_VERSION = 1

/** One paper's two files. `*Bytes` are the on-the-wire (gzip stream) sizes,
 *  not the decompressed payload — see paperAssetIO.ts's PaperAssetNames. */
export interface PaperAssetEntry {
  texture: string
  textureBytes: number
  preview: string
  previewBytes: number
}

export interface PaperManifest {
  version: number
  /** Keyed by PaperGrainType, and complete: every grain type is present.
   *  `flat` is absent by construction — it has no asset and never will (it is
   *  two constant bytes synthesised in paperLoader.ts), and both call sites
   *  short-circuit it before they ever reach the manifest. */
  assets: Record<PaperGrainType, PaperAssetEntry>
}

function isEntry(v: unknown): v is PaperAssetEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.texture === 'string' && e.texture.length > 0
    && typeof e.preview === 'string' && e.preview.length > 0
    && typeof e.textureBytes === 'number' && typeof e.previewBytes === 'number'
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
