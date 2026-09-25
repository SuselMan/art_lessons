import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import * as Sentry from '@sentry/react'

import type { PencilEngineAPI } from '../../engine'
import { subscribePaperLoadProgress, type PaperLoadProgress } from '../../engine/src/paperLoader'

export interface PaperReadinessDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** Re-asks the server for the room — the retry's second half. */
  requestFullResyncRef: RefObject<(() => void) | null>
}

/** (#346, #464, #493) Whether the paper texture arrived, on the Room side:
 *  the download's progress for the loading overlay, the wait every replay
 *  site does before restoring (reported once per failure, not once per
 *  site), and the retry that fetches it again and then asks for the room
 *  again. Out of Room. */
export function usePaperReadiness({ engineRef, requestFullResyncRef }: PaperReadinessDeps) {
  // (#345) Paper-download progress for the loading overlay. Local state next
  // to roomContentReady rather than in roomStore, for the same reason that one
  // is local: it describes this mount's own loading sequence and dies with it.
  //
  // Null means "no texture download is happening" — which covers both `flat`
  // paper (synthesised, never fetched) and, importantly, the case the prefetch
  // makes common: the bytes were already in hand before the room opened, so no
  // progress is ever emitted and the overlay should not flash an empty bar.
  const [paperProgress, setPaperProgress] = useState<PaperLoadProgress | null>(null)
  useEffect(() => subscribePaperLoadProgress(setPaperProgress), [])

  // (#346) The paper texture failed to load, and with it this mount's whole
  // catch-up: every replay site below awaits `paperReady()` first, so a
  // rejection there means nothing was restored either. Both facts point the
  // same way — the room is not open, and saying otherwise is the bug this
  // closes. `paperRetrying` is the retry's own in-flight flag.
  const [paperFailed,   setPaperFailed]   = useState(false)
  const [paperRetrying, setPaperRetrying] = useState(false)

  /** (#464) Whether this failure has already been reported to Sentry. Every
   *  replay site calls awaitPaper, so one broken load rejects at several of
   *  them and would otherwise send the same event three or four times.
   *
   *  Reset by a retry, deliberately: a second failure after the user asked
   *  again is a different fact from the first — it says the cause is not the
   *  transient blip the retry button exists for. */
  const paperReportedRef = useRef(false)

  /** Awaits the paper texture at a replay site, reporting a failure instead of
   *  letting it through. Returns whether the caller may proceed — `false`
   *  means it must leave `roomContentReady` alone (i.e. false) so the failure
   *  overlay stands, rather than run its restore against a placeholder
   *  texture and an engine that will refuse every stroke.
   *
   *  This is the `catch` the old `try/finally` sites were missing: the error
   *  itself is worth reading (paperLoader names the file, the HTTP status and
   *  the command to run), and it used to reach nothing but an unhandled
   *  rejection. */
  const awaitPaper = useCallback(async (engine: PencilEngineAPI | null): Promise<boolean> => {
    try {
      await engine?.paperReady()
      return true
    } catch (err) {
      console.error('paper texture failed to load — room cannot draw', err)
      // (#464) Reported, not just logged. This is a room that did not open,
      // and until an iPad on iPadOS 16.3 was picked up by hand we had no way
      // of knowing it ever happened: the console is on a device we don't have,
      // and the catch above is what stopped it reaching Sentry's unhandled
      // handler. A failure this total has to be something we see first.
      if (!paperReportedRef.current) {
        paperReportedRef.current = true
        Sentry.captureException(err)
      }
      setPaperFailed(true)
      return false
    }
  }, [])

  /** (#346) Load the paper texture again, without reloading the page — which
   *  for a room is never a neutral act: it throws away whatever the reload
   *  catches mid-flight, and #313 cares enough about that to put a
   *  beforeunload prompt in the way.
   *
   *  The retry is two steps because the failure cost two things. The texture
   *  comes back via the engine (the byte and manifest caches evict rejections
   *  rather than memoize them — see paperLoader — so this genuinely re-fetches).
   *  The room's *content* has to be asked for again separately: the room_state
   *  that would have restored it was consumed by the attempt that failed, so
   *  this re-runs the same full catch-up a seq gap does, and the ordinary
   *  handleRoomState path takes it from there. */
  const retryPaper = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    setPaperRetrying(true)
    paperReportedRef.current = false
    try {
      await engine.retryPaper()
      setPaperFailed(false)
      requestFullResyncRef.current?.()
    } catch (err) {
      // Stays on this screen with the button live again — a second attempt is
      // exactly as reasonable as the first was, and there is nothing else to
      // offer that reloading would not do worse.
      console.error('paper texture retry failed', err)
      // (#464) Reported here rather than left to awaitPaper: a rejected retry
      // never reaches a replay site, so this branch is the only one that knows
      // the user asked again and got the same answer.
      if (!paperReportedRef.current) {
        paperReportedRef.current = true
        Sentry.captureException(err)
      }
    } finally {
      setPaperRetrying(false)
    }
  }, [engineRef, requestFullResyncRef])

  return { paperProgress, paperFailed, paperRetrying, awaitPaper, retryPaper }
}
