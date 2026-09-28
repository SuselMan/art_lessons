import { useEffect, useState } from 'react'

/** (#575) Below this width the editor's header stops fitting in one row: the
 *  rotation, zoom, history, annotation, board, fullscreen and menu clusters
 *  plus the wordmark, the lesson name and the save status ran into each
 *  other on a small laptop and on a portrait tablet. Chosen by Ilya rather
 *  than measured — the exact overflow point moves with the lesson name's
 *  length and with which conditional buttons are showing, so a fixed round
 *  number is honest about being a judgement.
 *
 *  Unrelated to deviceType's COMPACT_MAX_SHORT_SIDE_PX: that one swaps the
 *  whole editor for the annotation-only phone shell; this only packs the
 *  header tighter and leaves the editor as it is. */
export const NARROW_HEADER_MAX_WIDTH_PX = 1199

const QUERY = `(max-width: ${NARROW_HEADER_MAX_WIDTH_PX}px)`

function matches(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches
}

/** Live for the same reason useCompactLayout is: a window gets dragged
 *  narrow and a tablet gets rotated without a reload. */
export function useNarrowHeader(): boolean {
  const [narrow, setNarrow] = useState(matches)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(QUERY)
    setNarrow(query.matches)
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return narrow
}
