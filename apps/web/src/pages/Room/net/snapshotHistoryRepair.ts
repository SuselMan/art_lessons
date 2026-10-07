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
  const beforeSeq = Math.max(...needed.map(r => r.beforeSeq))
  let pages = 0
  await (deps.walk ?? walkHistoryBackward)(roomId, beforeSeq, beforeSeq, page => {
    if (!deps.current()) return
    pages++
    engine.absorbHistoricalOperations(page)
    deps.onPage(page)
  })
  if (!deps.current()) return false
  if (!pages || engine.pendingSnapshotHistoryRepairs().length) throw new Error('Incomplete snapshot history repair')
  return true
}
