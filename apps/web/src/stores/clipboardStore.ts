import { create } from 'zustand'

import {
  CLIPBOARD_META_KEY, clearClipboardMeta, createIndexedDbClipboardStorage, metaOf,
  readClipboardMeta, writeClipboardMeta,
  type ClipboardMeta, type ClipboardRecord, type ClipboardStorage,
} from '../lib/clipboardStorage'

// (#521) What the editor currently has copied — as a *reflection*, never as
// the data itself.
//
// Deliberately a separate store from `roomStore`, for the reason `noticeStore`
// and `settingsStore` are: `resetRoomStore()` replaces the whole room state on
// every Room mount, and a clipboard that has to survive being carried from one
// room to another cannot live in something wiped by arriving there. `#446` put
// it in `selectionSlice` next to the selection, which was the right place while
// both were equally short-lived; the selection stays there, because a selection
// genuinely is about the room in front of you (ADR 008), and the clipboard
// leaves.
//
// Only the *meta* is in the store — the raster is not, and must not be. Keeping
// a few MB of base64 in a zustand store would put it in every snapshot the
// store hands out and hold it in memory for the life of the tab, to serve one
// keystroke that already has to await an image decode anyway. This is the same
// boundary `roomStore` draws around the engine's pixel buffers (see its
// top-of-file comment): the store says *that* something exists and where it
// goes, the bytes live where bytes belong.

interface ClipboardStore {
  /** Null when there is nothing to paste — which is what every paste
   *  affordance checks. Seeded synchronously from localStorage at module load,
   *  so the paste button is right on the very first render of a room rather
   *  than lighting up a moment later. */
  meta: ClipboardMeta | null
  setMeta: (meta: ClipboardMeta | null) => void
}

export const useClipboardStore = create<ClipboardStore>()(set => ({
  meta: typeof localStorage === 'undefined' ? null : readClipboardMeta(),
  setMeta: meta => set({ meta }),
}))

// Swappable so tests (and, later, anything that wants a fake) can drive the
// functions below without IndexedDB. The app never calls this.
let storage: ClipboardStorage | null = null

function getStorage(): ClipboardStorage {
  storage ??= createIndexedDbClipboardStorage()
  return storage
}

export function setClipboardStorageForTests(next: ClipboardStorage | null): void {
  storage = next
}

/** Copy. Writes the raster first and the meta second, and that order is the
 *  whole reliability story: the meta is what everything else treats as "there
 *  is something to paste", so it must never be published before the thing it
 *  points at exists.
 *
 *  Returns whether it was stored. Callers must respect a `false` — `cutSelection`
 *  erases the region only when the copy succeeded, because a cut that emptied
 *  the canvas and then failed to fill the clipboard destroys work with nothing
 *  left to paste back. Quota is a real way to get here: the raster is a PNG of
 *  whatever was lassoed. */
export async function writeClipboard(record: ClipboardRecord): Promise<boolean> {
  try {
    await getStorage().write(record)
  } catch {
    return false
  }
  const meta = metaOf(record)
  writeClipboardMeta(meta)
  useClipboardStore.getState().setMeta(meta)
  return true
}

/** Paste. Reads the raster back on demand rather than holding it — see the
 *  store's own comment on why the bytes are not in here.
 *
 *  A null answer while `meta` says otherwise means the two halves disagree:
 *  the browser evicted the IndexedDB record under storage pressure, or an
 *  older build wrote a meta this one cannot resolve. Rather than leave a paste
 *  button that does nothing when pressed, that clears the meta too — the
 *  disagreement is settled in favour of the half that actually holds pixels. */
export async function readClipboard(): Promise<ClipboardRecord | null> {
  let record: ClipboardRecord | null = null
  try {
    record = await getStorage().read()
  } catch {
    return null
  }
  if (!record) {
    clearClipboardMeta()
    useClipboardStore.getState().setMeta(null)
  }
  return record
}

// Cross-tab liveness. IndexedDB has no change event, which is the other half of
// why the meta is mirrored into localStorage: `storage` fires in every *other*
// tab of the origin (never in the one that wrote), so a copy made in one room
// lights the paste button up in a room already open next to it, with no polling
// and without either tab reading a single byte of the raster.
//
// A `null` key means the whole of localStorage was cleared, which is a change
// to this key as much as to any other.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== CLIPBOARD_META_KEY) return
    useClipboardStore.getState().setMeta(readClipboardMeta())
  })
}
