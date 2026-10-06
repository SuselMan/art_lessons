import { useEffect, useRef, useState } from 'react'

/** Copy-and-open joins with the viewer's known name and keeps its themed
 * loader until restore finishes. Retries and refusals use the usual gate. */
export function useCopyRoomEntry(state: unknown, ready: boolean, connected: boolean, retryJoin: () => void, entered: boolean): boolean {
  const [copying, setCopying] = useState(() => typeof state === 'object' && state !== null && 'copying' in state && state.copying === true)
  const started = useRef(false)
  useEffect(() => {
    if (ready) setCopying(false)
  }, [ready])
  useEffect(() => {
    if (!connected) { started.current = false; return }
    if (!copying || entered || started.current) return
    started.current = true
    retryJoin()
  }, [copying, connected, retryJoin, entered])
  return copying
}
