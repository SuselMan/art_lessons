// (#663) What the offline paper bake (scripts/bakePaperTextures.ts,
// scripts/paperAssetIO.ts) shares with the engine at runtime: the sampling
// constants, the manifest format and the catch-channel builder. One copy of
// each, so a bake and the client reading it cannot disagree.
//
// Imported by node scripts, so every specifier here carries `.js` — the
// scripts' tsconfig resolves as node does — and nothing behind it may touch
// the DOM or WebGL.
export { PAPER_BAKE_RESOLUTION, PAPER_WORLD_SIZE } from './src/paper/paperConstants.js'
export {
  PAPER_MANIFEST_FILENAME, PAPER_MANIFEST_VERSION, parsePaperManifest,
  type PaperAssetEntry, type PaperManifest,
} from './src/paper/paperManifest.js'
export { buildPaperCatch, buildPaperCatchLut } from './src/paper/paperCatch.js'
