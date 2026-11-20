import type { Operation } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../../engine'
import { walkHistoryBackward } from './snapshotRestore'

/** Continue the ordinary backfill only for an actually blocked baked base.
 *  A page belongs to the captured engine; navigation cannot repair its successor. */
export async function continueSnapshotHistoryRepair(
  roomId: string,
  engine: Pick<PencilEngineAPI, 'pendingSnapshotHistoryRepairs' | 'absorbHistoricalOperations'>,
  deps: {
    ordinary?: Promise<void>
    current: () => boolean
    onPage: (page: Operation[]) => void
    walk?: typeof walkHistoryBackward
  },
): Promise<boolean> {
  await deps.ordinary
  if (!deps.current()) return false
  const needed = engine.pendingSnapshotHistoryRepairs()
  if (!needed.length) return true
  let beforeSeq = Math.max(...needed.map(r => r.beforeSeq))
  for (;;) {
    let pages = 0
    await (deps.walk ?? walkHistoryBackward)(roomId, beforeSeq, beforeSeq, page => {
      if (!deps.current()) return
      pages++
      engine.absorbHistoricalOperations(page)
      deps.onPage(page)
    })
    if (!deps.current()) return false
    const remaining = engine.pendingSnapshotHistoryRepairs()
    if (!pages) throw new Error('Incomplete snapshot history repair')
    if (!remaining.length) return true
    const next = Math.max(...remaining.map(r => r.beforeSeq))
    // A higher prefix requested while this walk was busy belongs to this
    // SAME work. An unchanged/older missing range is a failure, not a retry.
    if (next <= beforeSeq) throw new Error('Incomplete snapshot history repair')
    beforeSeq = next
  }
}
