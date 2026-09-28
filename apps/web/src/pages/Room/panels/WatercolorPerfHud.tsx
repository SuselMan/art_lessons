import { useEffect, useState, type RefObject } from 'react'

import type { PencilEngineAPI, WatercolorPerf } from '../../../engine'

/** (#536, ADR 011 §17.22) The watercolor tool's live numbers, four times a
 *  second, in the debug stack — so a tablet with no inspector attached can
 *  still say where the time goes. Dev-only, English on purpose. */
export function WatercolorPerfHud({ engineRef, className }: { engineRef: RefObject<PencilEngineAPI | null>; className: string }) {
  const [perf, setPerf] = useState<WatercolorPerf | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      const engine = engineRef.current
      if (engine) setPerf(engine.getWatercolorPerf())
    }, 250)
    return () => window.clearInterval(id)
  }, [engineRef])
  if (!perf) return <div className={className}>wc perf: waiting for engine</div>
  const f = (v: number, d = 1) => v.toFixed(d)
  return (
    <div className={className}>
      <div>frame {f(perf.frameP50)} / p95 {f(perf.frameP95)} ms · {perf.frames} in 2 s · display {f(perf.displayMs, 2)} ms</div>
      <div>batches {f(perf.batchesPerSec, 0)}/s · submit {f(perf.batchP50, 2)} / max {f(perf.batchMax, 2)} ms</div>
      <div>settle {f(perf.settleMs, 0)} ms over {perf.settleOps} steps</div>
      <div>gpu MB: scratch {f(perf.scratchLiveMB, 0)} live + {f(perf.scratchFreeMB, 0)} free · field {f(perf.fieldMB, 0)} · reveal {f(perf.revealMB, 0)} · wet cells {perf.wetCells}</div>
    </div>
  )
}
