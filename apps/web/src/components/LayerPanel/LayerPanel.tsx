import { useCallback, useMemo, useState, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import clsx from 'clsx'
import { nanoid } from 'nanoid'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerState, LayerFolder } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { Icon } from '../Icon'
import { LayerRow } from './LayerRow'
import { buildFlatList, buildDropZoneMap, reconstructHierarchy, S_BOT } from './flatList'
import { patchItem } from './utils'
import { isFolder, parentOf, getVisibleOrder, collectDescendants } from '../../lib/layers'
import styles from './LayerPanel.module.css'

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

  const flatList = useMemo(() => buildFlatList(layerState), [layerState])
  const flatIds  = useMemo(() => flatList.map(f => f.id), [flatList])
  const dropZone = useMemo(() => buildDropZoneMap(flatList), [flatList])

  const [dragId, setDragId]                     = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [menuId, setMenuId]                     = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor]             = useState<HTMLElement | null>(null)
  const [opacityId, setOpacityId]               = useState<string | null>(null)
  const [opacityAnchor, setOpacityAnchor]       = useState<HTMLElement | null>(null)

  const longPressRef = useRef<{ id: string; timer: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

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

  // ── selection ────────────────────────────────────────────────────────────────

  const handleActivate = useCallback((id: string, e: React.MouseEvent) => {
    if (id === BACKGROUND_LAYER_ID) {
      onChange(p => ({ ...p, activeId: id, selectedIds: [] }))
      return
    }

    onChange(p => {
      const prevActive = p.activeId
      const sel = p.selectedIds

      if (e.shiftKey && prevActive && prevActive !== id && prevActive !== BACKGROUND_LAYER_ID) {
        const all = getVisibleOrder(p)
        const i1 = all.indexOf(prevActive)
        const i2 = all.indexOf(id)
        if (i1 < 0 || i2 < 0) return { ...p, activeId: id, selectedIds: [] }
        const range = all.slice(Math.min(i1, i2), Math.max(i1, i2) + 1)
        return { ...p, activeId: id, selectedIds: range }
      }

      if (e.ctrlKey || e.metaKey) {
        return {
          ...p,
          activeId: id,
          selectedIds: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id],
        }
      }

      return { ...p, activeId: id, selectedIds: [] }
    })
  }, [onChange])

  const handlePointerDown = useCallback((id: string) => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer)
    longPressRef.current = {
      id,
      timer: window.setTimeout(() => {
        onChange(p => ({
          ...p,
          activeId: id,
          selectedIds: p.selectedIds.includes(id)
            ? p.selectedIds.filter(x => x !== id)
            : [...p.selectedIds, id],
        }))
      }, 500),
    }
  }, [onChange])

  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer)
      longPressRef.current = null
    }
  }, [])

  // ── add / delete ─────────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const newId = nanoid(8)
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
    const newId = nanoid(8)
    const folder: LayerFolder = { kind: 'folder', id: newId, name: 'Folder', opacity: 1, visible: true, locked: false, collapsed: false, children: [] }
    onChange(p => ({
      ...p,
      items:     { ...p.items, [newId]: folder },
      rootOrder: [newId, ...p.rootOrder],
    }))
  }, [onChange])

  const handleDelete = useCallback((ids?: string[]) => {
    const targets = (ids ?? (selectedIds.length > 0 ? selectedIds : [activeId]))
      .filter(id => id !== BACKGROUND_LAYER_ID)
    if (!targets.length) return

    const idSet = new Set<string>()
    for (const id of targets) {
      idSet.add(id)
      for (const d of collectDescendants(layerState, id)) idSet.add(d)
    }

    for (const id of idSet) onDestroyLayer(id)
    onChange(p => {
      const ni = { ...p.items }
      for (const id of idSet) {
        const fid = parentOf(p, id)
        if (fid) {
          const f = p.items[fid]
          if (isFolder(f)) ni[fid] = { ...f, children: f.children.filter(c => !idSet.has(c)) }
        }
        delete ni[id]
      }
      const nr = p.rootOrder.filter(x => !idSet.has(x))
      const newAct = idSet.has(p.activeId)
        ? (nr.find(x => x !== BACKGROUND_LAYER_ID) ?? BACKGROUND_LAYER_ID)
        : p.activeId
      return { ...p, items: ni, rootOrder: nr, activeId: newAct, selectedIds: [] }
    })
  }, [activeId, selectedIds, layerState, onChange, onDestroyLayer])

  // ── merge ────────────────────────────────────────────────────────────────────

  const execMerge = useCallback((ids: string[]): string => {
    const pixels = onMergeLayers(ids)
    const newId  = nanoid(8)
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

  const handleMergeDown = useCallback((id?: string) => {
    const sourceId = id ?? activeId
    if (!sourceId || sourceId === BACKGROUND_LAYER_ID) return
    const containerId = parentOf(layerState, sourceId) ?? '__root__'
    const siblings = containerId === '__root__' ? rootOrder : (items[containerId] as LayerFolder | undefined)?.children ?? []
    const idx = siblings.indexOf(sourceId)
    const belowId = siblings.slice(idx + 1).find(id => items[id]?.kind === 'layer' && id !== BACKGROUND_LAYER_ID) ?? null
    if (idx < 0 || !belowId) return
    const mergedName = `${items[sourceId].name} + ${items[belowId].name}`
    const newId = execMerge([sourceId, belowId])
    onChange(p => {
      const ni = { ...p.items }
      delete ni[sourceId]; delete ni[belowId]
      ni[newId] = { kind: 'layer', id: newId, name: mergedName, opacity: 1, visible: true, locked: false }
      const filtered = p.rootOrder.filter(x => x !== sourceId && x !== belowId)
      const ins = Math.min(idx, filtered.length)
      return { ...p, items: ni, rootOrder: [...filtered.slice(0, ins), newId, ...filtered.slice(ins)], activeId: newId, selectedIds: [] }
    })
  }, [activeId, layerState, rootOrder, items, onChange, execMerge])

  // ── context menu ─────────────────────────────────────────────────────────────

  const handleOpenMenu = useCallback((id: string, anchor: HTMLElement) => {
    setMenuId(id)
    setMenuAnchor(anchor)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setMenuId(null)
    setMenuAnchor(null)
  }, [])

  const handleMenuRename = useCallback(() => {
    if (!menuId) return
    const item = items[menuId]
    if (!item) return
    const next = window.prompt('Rename layer', item.name)
    if (next?.trim()) handleRename(menuId, next.trim())
    handleCloseMenu()
  }, [menuId, items, handleRename, handleCloseMenu])

  const handleMenuMergeDown = useCallback(() => {
    handleCloseMenu()
    if (menuId) handleMergeDown(menuId)
  }, [menuId, handleCloseMenu, handleMergeDown])

  const handleMenuDelete = useCallback(() => {
    handleCloseMenu()
    if (menuId) handleDelete([menuId])
  }, [menuId, handleCloseMenu, handleDelete])

  // ── opacity popup ────────────────────────────────────────────────────────────

  const handleOpenOpacity = useCallback((id: string, anchor: HTMLElement) => {
    setOpacityId(id)
    setOpacityAnchor(anchor)
  }, [])

  const handleCloseOpacity = useCallback(() => {
    setOpacityId(null)
    setOpacityAnchor(null)
  }, [])

  // ── DnD ──────────────────────────────────────────────────────────────────────

  // pointerWithin does literal hit-testing (pointer inside rect), so it reliably
  // catches small drop targets (the sentinel) that closestCenter tends to skip in
  // favor of a taller neighboring row. Fall back to closestCenter when the pointer
  // isn't within any droppable (e.g. dragged past the edges of the list).
  const collisionDetection: CollisionDetection = useCallback(args => {
    const hits = pointerWithin(args)
    return hits.length > 0 ? hits : closestCenter(args)
  }, [])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDragId(String(e.active.id))
    setDragOverFolderId(null)
  }, [])

  // Build the contiguous block of ids that moves together with `id`. For a
  // folder this is the header, its visible children, and its bottom sentinel;
  // for anything else it's just the id itself.
  const blockFor = useCallback((id: string): string[] => {
    const item = items[id]
    if (!item || !isFolder(item)) return [id]
    return [
      id,
      ...(item.collapsed ? [] : item.children.filter(cid => flatIds.includes(cid))),
      `${S_BOT}${id}`,
    ]
  }, [items, flatIds])

  // Where would `activeId`'s block land if dropped on `overId` right now?
  // Mirrors dnd-kit's own arrayMove: overId's position is read from the
  // ORIGINAL (pre-removal) list, so dragging down past a target lands after
  // it and dragging up past it lands before it. That directionality is what
  // makes the folder header resolve correctly on its own — hovering it while
  // moving down means "enter as first child", moving up means "stay above,
  // outside" — without needing any pixel/rect math.
  const computeInsertIndex = useCallback((activeId: string, overId: string) => {
    const allIds = flatIds
    const activeBlock = blockFor(activeId)
    const activeSet = new Set(activeBlock)
    if (activeSet.has(overId)) return null

    const blockStart = allIds.indexOf(activeBlock[0])
    const overIndexOriginal = allIds.indexOf(overId)
    if (overIndexOriginal < 0) return null

    const remainingIds = allIds.filter(id => !activeSet.has(id))
    const overIndexRemaining = remainingIds.indexOf(overId)
    if (overIndexRemaining < 0) return null

    const insertIndex = overIndexOriginal > blockStart ? overIndexRemaining + 1 : overIndexRemaining
    return { activeBlock, remainingIds, insertIndex }
  }, [flatIds, blockFor])

  const onDragOver = useCallback((e: DragOverEvent) => {
    const overId    = e.over?.id ? String(e.over.id) : null
    const activeIdD = String(e.active.id)
    if (!overId) { setDragOverFolderId(null); return }

    const overItem = items[overId]
    if (overItem && isFolder(overItem)) {
      if (isFolder(items[activeIdD])) { setDragOverFolderId(null); return }
      const result = computeInsertIndex(activeIdD, overId)
      // Entering means the block ends up right after the header, i.e. at the
      // header's own (post-removal) index + 1.
      const headerIndex = result?.remainingIds.indexOf(overId)
      setDragOverFolderId(result && headerIndex != null && result.insertIndex > headerIndex ? overId : null)
      return
    }
    setDragOverFolderId(dropZone[overId] ?? null)
  }, [items, dropZone, computeInsertIndex])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setDragId(null)
    setDragOverFolderId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const activeIdDnD = String(active.id)
    const overId      = String(over.id)

    // Background is immovable.
    if (activeIdDnD === BACKGROUND_LAYER_ID) return

    const activeItemDnD = items[activeIdDnD]
    if (!activeItemDnD) return

    // Prevent dropping a folder into another folder.
    const overItem = items[overId]
    if (isFolder(activeItemDnD) && overItem && isFolder(overItem)) return

    const result = computeInsertIndex(activeIdDnD, overId)
    if (!result) return
    const { activeBlock, remainingIds } = result
    let insertIndex = result.insertIndex

    // Prevent dropping below background.
    const bgIndex = remainingIds.indexOf(BACKGROUND_LAYER_ID)
    if (bgIndex >= 0 && insertIndex > bgIndex) insertIndex = bgIndex

    const workingIds = [
      ...remainingIds.slice(0, insertIndex),
      ...activeBlock,
      ...remainingIds.slice(insertIndex),
    ]

    const { rootOrder, items: nextItems } = reconstructHierarchy(workingIds, items)
    onChange(p => ({ ...p, rootOrder, items: nextItems }))
  }, [items, onChange, computeInsertIndex])

  // ── toolbar state ────────────────────────────────────────────────────────────

  const canMergeSelected = selectedIds.filter(id => items[id]?.kind === 'layer').length >= 2
  const canMergeDown     = !canMergeSelected
    && activeItem?.kind === 'layer'
    && activeId !== BACKGROUND_LAYER_ID
  const canMerge        = canMergeSelected || canMergeDown
  const canDelete       = activeId !== BACKGROUND_LAYER_ID || selectedIds.some(id => id !== BACKGROUND_LAYER_ID)
  const isActiveLocked  = !!activeItem?.locked

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.tabStrip}>
        <button
          className={clsx(styles.stripTab, open && styles.stripTabActive)}
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
              className={clsx(styles.toolbarBtn, isActiveLocked && styles.toolbarBtnLocked)}
              onClick={() => handleToggleLock(activeId)}
              disabled={activeId === BACKGROUND_LAYER_ID}
              title={isActiveLocked ? 'Unlock layer' : 'Lock layer'}>
              <Icon name={isActiveLocked ? 'lock' : 'lock_open'} />
            </button>
            <button
              className={styles.toolbarBtn}
              disabled={!canMerge}
              onClick={() => canMergeSelected ? handleMergeSelected() : handleMergeDown()}
              title={canMergeSelected ? 'Merge selected' : 'Merge down'}>
              <Icon name="move_down" />
            </button>
            <button
              className={clsx(styles.toolbarBtn, styles.toolbarBtnDanger)}
              onClick={() => handleDelete()}
              disabled={!canDelete}
              title={selectedIds.length > 0 ? 'Delete selected' : 'Delete layer'}>
              <Icon name="delete" />
            </button>
          </div>

          <div className={styles.list}
            onPointerUp={handlePointerUp}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
                {flatList.map(entry => {
                  if (entry.kind === 'sentinel') {
                    return <Sentinel key={entry.id} id={entry.id} />
                  }
                  const item = items[entry.id]
                  if (!item) return null
                  return (
                    <LayerRow
                      key={entry.id}
                      item={item}
                      depth={entry.depth}
                      isActive={activeId === entry.id}
                      isSelected={selectedIds.includes(entry.id)}
                      isDragOverFolder={dragOverFolderId === entry.id}
                      onActivate={handleActivate}
                      onToggleVisible={handleToggleVisible}
                      onToggleLock={handleToggleLock}
                      onRename={handleRename}
                      onToggleCollapse={handleToggleCollapse}
                      onOpenMenu={handleOpenMenu}
                      onOpenOpacity={handleOpenOpacity}
                      onPointerDown={handlePointerDown}
                      onPointerUp={handlePointerUp}
                    />
                  )
                })}
              </SortableContext>

              <DragOverlay>
                {dragId && items[dragId]
                  ? <div className={styles.dragOverlay}>{items[dragId].name}</div>
                  : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {menuId && menuAnchor && (
        <ContextMenu
          anchor={menuAnchor}
          onClose={handleCloseMenu}
          items={[
            { label: 'Rename',   onClick: handleMenuRename },
            { label: 'Merge down', onClick: handleMenuMergeDown, disabled: items[menuId]?.kind !== 'layer' },
            { label: 'Delete',   onClick: handleMenuDelete,   disabled: menuId === BACKGROUND_LAYER_ID },
          ]}
        />
      )}

      {opacityId && opacityAnchor && items[opacityId] && (
        <OpacityPopup
          anchor={opacityAnchor}
          value={items[opacityId].opacity}
          onChange={v => handleOpacity(opacityId, v)}
          onClose={handleCloseOpacity}
        />
      )}
    </div>
  )
}

// ── small UI helpers ─────────────────────────────────────────────────────────

/** Marks a folder's lower boundary in the flat list. It's a full sortable
 *  participant (gets the same live shift animation as every other row) but
 *  can't be picked up itself — only rows are draggable. */
function Sentinel({ id }: { id: string }) {
  const { setNodeRef, isOver, transform, transition } = useSortable({
    id,
    disabled: { draggable: true, droppable: false },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={styles.sentinel}
      data-over={isOver}
    />
  )
}

interface ContextMenuProps {
  anchor: HTMLElement
  onClose: () => void
  items: Array<{ label: string; onClick: () => void; disabled?: boolean }>
}

function ContextMenu({ anchor, onClose, items }: ContextMenuProps) {
  const rect = anchor.getBoundingClientRect()
  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={styles.contextMenu}
        style={{ top: rect.bottom + 4, left: rect.left }}
      >
        {items.map(item => (
          <button
            key={item.label}
            className={styles.contextMenuItem}
            disabled={item.disabled}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

interface OpacityPopupProps {
  anchor: HTMLElement
  value: number
  onChange: (v: number) => void
  onClose: () => void
}

function OpacityPopup({ anchor, value, onChange, onClose }: OpacityPopupProps) {
  const rect = anchor.getBoundingClientRect()
  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={styles.opacityPopup}
        style={{ top: rect.bottom + 4, right: window.innerWidth - rect.right }}
      >
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className={styles.opacityPopupSlider}
        />
        <span className={styles.opacityPopupValue}>{Math.round(value * 100)}%</span>
      </div>
    </>
  )
}
