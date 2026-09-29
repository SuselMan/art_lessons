// (#663) The paper, as the app outside a room needs it: start the download
// early, paint a picker miniature, match the canvas's tone. A public entry
// point of its own rather than more re-exports from index.ts, because its
// callers are App.tsx and the paper picker — both in the initial bundle — and
// importing index.ts would pull the whole WebGL engine in with them, undoing
// the lazy Room route (#130). Everything behind this file is the loader, the
// manifest parser and plain constants; keep it that way.
export {
  getPaperPreviewBytes, prefetchPaper, PAPER_PREVIEW_RESOLUTION,
} from './src/paper/paperLoader'
export { PAPER_TONE_AMPLITUDE } from './src/paper/paperTone'
