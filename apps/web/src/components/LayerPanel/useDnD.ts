import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  useSensor, useSensors, PointerSensor, TouchSensor,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { LayerState } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { isFolder } from '../../lib/layers'
import { S_TOP, S_BOT, type FlatEntry, reconstructHierarchy } from './flatList'

export interface DnDHandlers {
  activeDragId:     string | null
  dragOverFolderId: string | null
  sensors:          ReturnType<typeof useSensors>
  onDragStart:      (e: DragStartEvent) => void
  onDragOver:       (e: DragOverEvent)  => void
  onDragEnd:        (e: DragEndEvent)   => void
}

export function useDnD(
  flatList: FlatEntry[],
  layerState: LayerState,
  onChange: Dispatch<SetStateAction<LayerState>>,
): DnDHandlers {
  const [activeDragId,     setActiveDragId]    = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
    setDragOverFolderId(null)
  }

  const onDragOver = useCallback((e: DragOverEvent) => {
    const { over } = e
    if (!over) { setDragOverFolderId(null); return }
    const entry = flatList.find(f => f.id === String(over.id))
    setDragOverFolderId(entry?.kind === 'folder' ? String(over.id) : null)
  }, [flatList])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDragId(null)
    setDragOverFolderId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const flatIds = flatList.map(f => f.id)
    let ai = flatIds.indexOf(String(active.id))
    let oi = flatIds.indexOf(String(over.id))
    if (ai < 0 || oi < 0 || ai === oi) return

    // Background is always last and immovable
    const bgIdx = flatIds.indexOf(BACKGROUND_LAYER_ID)
    if (bgIdx >= 0 && oi >= bgIdx) return

    // Determine if the drop target implies entering a folder.
    //
    // closestCenter rarely returns the small __top_ sentinel as the hit target;
    // the folder header and __bot_ sentinel are far more common. Both cases must
    // redirect so the dragged item lands INSIDE the folder, not at root level.
    const overEntry = flatList[oi]
    const overId    = String(over.id)
    let targetFolderId: string | null = null

    if (overEntry?.kind === 'folder') {
      targetFolderId = overEntry.id
    } else if (overId.startsWith(S_BOT)) {
      // Dropping on __bot_ from ABOVE the folder's __top_ would place the item
      // after the closing sentinel (outside the folder). Redirect to enter instead.
      const fid    = overId.slice(S_BOT.length)
      const folder = layerState.items[fid]
      const topIdx = flatIds.indexOf(`${S_TOP}${fid}`)
      if (folder && isFolder(folder) && !folder.collapsed && topIdx >= 0 && ai < topIdx) {
        targetFolderId = fid
      }
    }

    if (targetFolderId) {
      const folder = layerState.items[targetFolderId]
      if (folder && isFolder(folder) && !folder.collapsed) {
        const topIdx = flatIds.indexOf(`${S_TOP}${targetFolderId}`)
        const botIdx = flatIds.indexOf(`${S_BOT}${targetFolderId}`)
        const inside = topIdx >= 0 && ai > topIdx && ai < botIdx
        if (!inside && topIdx >= 0) {
          // Place as first child; adjust for arrayMove direction shift
          oi = ai < topIdx ? topIdx : topIdx + 1
          if (ai === oi) return
        }
      }
    }

    const newFlatIds = arrayMove(flatIds, ai, oi)
    const { rootOrder, items } = reconstructHierarchy(newFlatIds, layerState.items)
    onChange(p => ({ ...p, rootOrder, items }))
  }, [flatList, layerState.items, onChange])

  return { activeDragId, dragOverFolderId, sensors, onDragStart, onDragOver, onDragEnd }
}
