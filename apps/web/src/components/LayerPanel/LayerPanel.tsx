import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerState, LayerFolder } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { Icon } from '../Icon'
import { LayerRow } from './LayerRow'
import { buildFlatList } from './flatList'
import { useDnD } from './useDnD'
import { patchItem } from './utils'
import { cn } from '../../lib/cn'
import { uid } from '../../lib/uid'
import { isFolder, parentOf } from '../../lib/layers'
import styles from './LayerPanel.module.css'

// Invisible drop-zone element used as folder boundary markers in the flat list.
function Sentinel({ id }: { id: string }) {
  const { setNodeRef, transform, transition } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={styles.sentinel}
    />
  )
}

export interface LayerPanelProps {
  layerState:           LayerState
  onChange:             Dispatch<SetStateAction<LayerState>>
  onInitLayer:          (id: string) => void
  onDestroyLayer:       (id: string) => void
  onMergeLayers:        (ids: string[]) => Uint8Array
  onRestoreLayerPixels: (id: string, pixels: Uint8Array) => void
  open:                 boolean
  onToggle:             () => void
}

export function LayerPanel({
  layerState, onChange, onInitLayer, onDestroyLayer, onMergeLayers, onRestoreLayerPixels,
  open, onToggle,
}: LayerPanelProps) {
  const { items, rootOrder, activeId, selectedIds } = layerState
  const activeItem = items[activeId]

  const flatList   = useMemo(() => buildFlatList(layerState), [layerState])
  const sortableIds = useMemo(
    () => flatList.map(f => f.id).filter(id => id !== BACKGROUND_LAYER_ID),
    [flatList],
  )

  const { activeDragId, dragOverFolderId, sensors, onDragStart, onDragOver, onDragEnd } =
    useDnD(flatList, layerState, onChange)

  // ── item mutations ───────────────────────────────────────────────────────────

  const handleOpacity = useCallback((id: string, v: number) =>
    onChange(patchItem(id, { opacity: v }))
  , [onChange])

  const handleToggleLock = useCallback((id: string) =>
    onChange(patchItem(id, prev => ({ locked: !prev.locked })))
  , [onChange])

  const handleToggleVisible = useCallback((id: string) =>
    onChange(patchItem(id, prev => ({ visible: !prev.visible })))
  , [onChange])

  const handleToggleCollapse = useCallback((id: string) =>
    onChange(patchItem(id, prev => isFolder(prev) ? { collapsed: !prev.collapsed } : {}))
  , [onChange])

  const handleRename = useCallback((id: string, name: string) =>
    onChange(patchItem(id, { name }))
  , [onChange])

  const handleActivate = useCallback((id: string, e: React.MouseEvent) =>
    onChange(p => {
      const sel   = p.selectedIds
      const multi = e.shiftKey || e.ctrlKey || e.metaKey
      return {
        ...p,
        activeId:    id,
        selectedIds: multi
          ? sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
          : [],
      }
    })
  , [onChange])

  // ── add / delete ─────────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const newId = uid()
    const count = Object.values(layerState.items).filter(i => i.kind === 'layer').length
    onInitLayer(newId)
    onChange(p => ({
      ...p,
      items:     { ...p.items, [newId]: { kind: 'layer', id: newId, name: `Layer ${count + 1}`, opacity: 1, visible: true, locked: false } },
      rootOrder: [newId, ...p.rootOrder],
      activeId:  newId,
      selectedIds: [],
    }))
  }, [layerState.items, onChange, onInitLayer])

  const handleAddFolder = useCallback(() => {
    const newId = uid()
    const folder: LayerFolder = { kind: 'folder', id: newId, name: 'Folder', opacity: 1, visible: true, locked: false, collapsed: false, children: [] }
    onChange(p => ({
      ...p,
      items:     { ...p.items, [newId]: folder },
      rootOrder: [newId, ...p.rootOrder],
    }))
  }, [onChange])

  const handleDelete = useCallback(() => {
    const targets = (selectedIds.length > 0 ? selectedIds : [activeId])
      .filter(id => id !== BACKGROUND_LAYER_ID)
    if (!targets.length) return
    const idSet = new Set(targets)
    targets.forEach(id => onDestroyLayer(id))
    onChange(p => {
      const ni = { ...p.items }
      for (const id of targets) {
        const fid = parentOf(p, id)
        if (fid) {
          const f = p.items[fid]
          if (isFolder(f)) ni[fid] = { ...f, children: f.children.filter(c => !idSet.has(c)) }
        }
        delete ni[id]
      }
      const nr     = p.rootOrder.filter(x => !idSet.has(x))
      const newAct = idSet.has(p.activeId)
        ? (nr.find(x => x !== BACKGROUND_LAYER_ID) ?? BACKGROUND_LAYER_ID)
        : p.activeId
      return { ...p, items: ni, rootOrder: nr, activeId: newAct, selectedIds: [] }
    })
  }, [activeId, selectedIds, onChange, onDestroyLayer])

  // ── merge ────────────────────────────────────────────────────────────────────

  // Merges ids in engine, creates a new AccumulationBuffer, destroys old ones. Returns new layer id.
  const execMerge = useCallback((ids: string[]): string => {
    const pixels = onMergeLayers(ids)
    const newId  = uid()
    onInitLayer(newId)
    onRestoreLayerPixels(newId, pixels)
    ids.forEach(id => onDestroyLayer(id))
    return newId
  }, [onInitLayer, onDestroyLayer, onMergeLayers, onRestoreLayerPixels])

  const handleMergeSelected = useCallback(() => {
    const ids = selectedIds.filter(id => items[id]?.kind === 'layer')
    if (ids.length < 2) return
    const idSet = new Set(ids)
    const newId = execMerge(ids)
    onChange(p => {
      const ni = { ...p.items }
      for (const id of ids) {
        const fid = parentOf(p, id)
        if (fid) {
          const f = p.items[fid]
          if (isFolder(f)) ni[fid] = { ...f, children: f.children.filter(c => !idSet.has(c)) }
        }
        delete ni[id]
      }
      ni[newId] = { kind: 'layer', id: newId, name: 'Merged', opacity: 1, visible: true, locked: false }
      return { ...p, items: ni, rootOrder: [newId, ...p.rootOrder.filter(x => !idSet.has(x))], activeId: newId, selectedIds: [] }
    })
  }, [selectedIds, items, onChange, execMerge])

  const handleMergeDown = useCallback(() => {
    const idx     = rootOrder.indexOf(activeId)
    const belowId = rootOrder.slice(idx + 1).find(id => items[id]?.kind === 'layer' && id !== BACKGROUND_LAYER_ID) ?? null
    if (idx < 0 || !belowId) return
    const mergedName = `${items[activeId].name} + ${items[belowId].name}`
    const newId      = execMerge([activeId, belowId])
    onChange(p => {
      const ni = { ...p.items }
      delete ni[activeId]; delete ni[belowId]
      ni[newId] = { kind: 'layer', id: newId, name: mergedName, opacity: 1, visible: true, locked: false }
      const filtered = p.rootOrder.filter(x => x !== activeId && x !== belowId)
      const ins      = Math.min(idx, filtered.length)
      return { ...p, items: ni, rootOrder: [...filtered.slice(0, ins), newId, ...filtered.slice(ins)], activeId: newId, selectedIds: [] }
    })
  }, [activeId, rootOrder, items, onChange, execMerge])

  // ── toolbar state ─────────────────────────────────────────────────────────────

  const canMergeSelected = selectedIds.filter(id => items[id]?.kind === 'layer').length >= 2
  const canMergeDown     = !canMergeSelected
    && activeItem?.kind === 'layer'
    && activeId !== BACKGROUND_LAYER_ID
    && rootOrder.slice(rootOrder.indexOf(activeId) + 1).some(id => items[id]?.kind === 'layer' && id !== BACKGROUND_LAYER_ID)
  const canMerge        = canMergeSelected || canMergeDown
  const canDelete       = activeId !== BACKGROUND_LAYER_ID || selectedIds.some(id => id !== BACKGROUND_LAYER_ID)
  const isActiveLocked  = !!activeItem?.locked

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      <div className={styles.tabStrip}>
        <button
          className={cn(styles.stripTab, open && styles.stripTabActive)}
          onClick={onToggle}
          title={open ? 'Collapse layers' : 'Open layers'}>
          <Icon name="layers" />
        </button>
      </div>

      {open && (
        <div className={styles.content}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Layers</span>
            <button className={styles.collapseBtn} onClick={onToggle} title="Collapse">
              <Icon name="chevron_right" />
            </button>
          </div>

          {activeItem && (
            <div className={styles.opacityBar}>
              <span className={styles.opacityBarLabel}>Opacity</span>
              <input type="range" min={0} max={100}
                value={Math.round(activeItem.opacity * 100)}
                onChange={e => handleOpacity(activeId, Number(e.target.value) / 100)}
                className={styles.opacityBarSlider} />
              <span className={styles.opacityBarValue}>{Math.round(activeItem.opacity * 100)}%</span>
            </div>
          )}

          <div className={styles.listToolbar}>
            <button className={styles.toolbarBtn} onClick={handleAddLayer} title="Add layer">
              <Icon name="add" />
            </button>
            <button className={styles.toolbarBtn} onClick={handleAddFolder} title="Add folder">
              <Icon name="create_new_folder" />
            </button>
            <span className={styles.toolbarSpacer} />
            <button
              className={cn(styles.toolbarBtn, isActiveLocked && styles.toolbarBtnLocked)}
              onClick={() => handleToggleLock(activeId)}
              disabled={activeId === BACKGROUND_LAYER_ID}
              title={isActiveLocked ? 'Unlock layer' : 'Lock layer'}>
              <Icon name={isActiveLocked ? 'lock' : 'lock_open'} />
            </button>
            <button
              className={styles.toolbarBtn}
              disabled={!canMerge}
              onClick={canMergeSelected ? handleMergeSelected : handleMergeDown}
              title={canMergeSelected ? 'Merge selected' : 'Merge down'}>
              <Icon name="move_down" />
            </button>
            <button
              className={cn(styles.toolbarBtn, styles.toolbarBtnDanger)}
              onClick={handleDelete}
              disabled={!canDelete}
              title={selectedIds.length > 0 ? 'Delete selected' : 'Delete layer'}>
              <Icon name="delete" />
            </button>
          </div>

          <div className={styles.list}>
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {flatList.map(entry => {
                  if (entry.kind === 'sentinel') return <Sentinel key={entry.id} id={entry.id} />
                  const item = items[entry.id]
                  if (!item) return null
                  return (
                    <LayerRow key={entry.id} item={item} depth={entry.depth}
                      isActive={activeId === entry.id}
                      isSelected={selectedIds.includes(entry.id)}
                      isBackground={entry.id === BACKGROUND_LAYER_ID}
                      isDragOverFolder={dragOverFolderId === entry.id}
                      onActivate={handleActivate}
                      onToggleVisible={handleToggleVisible}
                      onToggleLock={handleToggleLock}
                      onRename={handleRename}
                      onToggleCollapse={handleToggleCollapse}
                    />
                  )
                })}
              </SortableContext>

              <DragOverlay>
                {activeDragId && items[activeDragId]
                  ? <div className={styles.dragOverlay}>{items[activeDragId].name}</div>
                  : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}
    </div>
  )
}
