import { useCallback, useRef, useState, type RefObject } from 'react'

import type { FillSourceMode, OperationDraft } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './viewport/cameraMath'
import { getToolColor } from '../../lib/tools/toolSchemas'
import type { DispatchedOp } from './useOperationDispatch'

export interface FillToolDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  handActive: boolean
  /** The layer the fill lands on, read when the tap runs, and whether it
   *  refuses paint (#518) — Room's, shared with the selection and shapes. */
  paintTargetIdRef: RefObject<string | null>
  paintTargetLockedRef: RefObject<boolean>
  dispatchOp: (draft: OperationDraft) => DispatchedOp | null
}

/** (#493) The fill tool (#453) on the Room side: its one gesture — a tap
 *  works out the region and emits an `area_fill` — and whether it is still
 *  thinking about the last one. */
export function useFillTool({
  engineRef, vpRef, handActive, paintTargetIdRef, paintTargetLockedRef, dispatchOp,
}: FillToolDeps) {
  const config = useRoomStore(s => s.room)


  // (#453) The fill's one gesture: a tap works out the region and emits an
  // `area_fill`. Two pieces of state around it, both for the same reason —
  // the work happens on the main thread and is not instant (a readback of the
  // fill's domain plus a scan of it), so the tool has to say it is thinking
  // and has to refuse a second tap while it is.
  const [fillBusy, setFillBusy] = useState(false)
  const fillBusyRef = useRef(false)

  const handleFillTap = useCallback(async (e: React.PointerEvent<HTMLDivElement>) => {
    // Pen (and mouse) only, same as the selection tool. On a tablet a finger is
    // how the canvas is panned and zoomed, so a touch that reaches here is
    // almost always the start of a two-finger gesture — and unlike a stray
    // stroke, a stray fill repaints a whole region.
    if (e.pointerType === 'touch') return
    // Same precedence as every other canvas tool: the hand outranks what is
    // under it, and a press with it up pans instead.
    if (handActive) return
    e.preventDefault()
    e.stopPropagation()
    const engine = engineRef.current
    const el = vpRef.current
    const layerId = paintTargetIdRef.current
    if (!engine || !el || !config || !layerId || fillBusyRef.current) return
    // (#518) Refused before the work, not after: the fill's own readback and
    // scan take long enough to show a busy state, and spending them on a tap
    // `dispatchOp` will throw away would look like the tool hanging on a
    // locked layer rather than declining.
    if (paintTargetLockedRef.current) return

    const rect = el.getBoundingClientRect()
    // Layer space, not screen space — #143's rule for everything that reaches
    // an operation: the viewport is this user's own, so a seed recorded in
    // screen pixels would be somewhere else on every other participant's
    // canvas (and, here, somewhere else in this user's own layer one zoom
    // later).
    const seed = clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config)
    const values = useRoomStore.getState().toolSettings.fill
    const color = getToolColor(useRoomStore.getState().toolSettings, 'fill')
    // The one place the on-screen toggle becomes the operation's named mode —
    // see the schema's own comment for why the two are shaped differently.
    const source: FillSourceMode = values.allLayers ? 'visible' : 'layer'

    fillBusyRef.current = true
    setFillBusy(true)
    try {
      // Yields one frame before the blocking work so the busy state is on
      // screen while it runs, rather than painting after it is over.
      await new Promise(resolve => requestAnimationFrame(resolve))
      const filled = await engine.computeAreaFill({
        layerId,
        seedX: seed.x,
        seedY: seed.y,
        color,
        tolerance: values.tolerance as number,
        gapClose: values.gapClose as number,
        expand: values.expand as number,
        source,
      })
      // Null means the tap produced no region at all (an empty result, not a
      // failure) — nothing to record and nothing to say.
      if (!filled) return
      dispatchOp({
        type: 'area_fill',
        layerId,
        image: filled.image,
        x: filled.x,
        y: filled.y,
        width: filled.width,
        height: filled.height,
        seedX: seed.x,
        seedY: seed.y,
        color,
        tolerance: values.tolerance as number,
        gapClose: values.gapClose as number,
        expand: values.expand as number,
        source,
      })
    } catch (err) {
      console.error('fill failed', err)
    } finally {
      fillBusyRef.current = false
      setFillBusy(false)
    }
    // (#493) The refs are parameters now, so the lint rule asks for them; they
    // are ref objects and never change identity. Their `.current` is read
    // when the tap runs, on purpose.
  }, [vpRef, config, dispatchOp, handActive, engineRef, paintTargetIdRef, paintTargetLockedRef])

  return { fillBusy, handleFillTap }
}
