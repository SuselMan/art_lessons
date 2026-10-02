import { useEffect, useState } from 'react'
import { useRoomStore } from '../../stores/roomStore'

/** #698: losing the target permanently dismisses the current filter request. */
export function useFilterTarget(editingBlocked: boolean, compact: boolean) {
  const [filterLayerId, setFilterLayerId] = useState<string | null>(null)
  const items = useRoomStore(s => s.layerState.items)
  useEffect(() => {
    if (!filterLayerId) return
    const item = items[filterLayerId]
    if (!item || item.kind !== 'layer' || editingBlocked || compact) setFilterLayerId(null)
  }, [filterLayerId, items, editingBlocked, compact])
  return [filterLayerId, setFilterLayerId] as const
}
