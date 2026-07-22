import { memo, useCallback, useMemo, useState, useRef } from 'react'
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
import type { LayerState, OperationDraft } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { Icon } from '../Icon'
import { LayerRow } from './LayerRow'
import { buildFlatList, buildDropZoneMap, reconstructHierarchy, S_BOT } from './flatList'
import { patchItem } from './utils'
import { isFolder, parentOf, getVisibleOrder, collectDescendants, computeMergeOrder } from '../../lib/layers'
import { readImageFile } from '../../lib/image'
import styles from './LayerPanel.module.css'

export interface LayerPanelProps {
  layerState: LayerState
  /** Local per-user view state only: selection, collapse, local lock. */
  onChange:   Dispatch<SetStateAction<LayerState>>
  /** Shared content changes go through the operation log (ADR 002). */
  onOp:       (draft: OperationDraft) => void
  // (#254/#260) Whether the current viewer is this room's owner — gates the
  // owner-lock toggle (toolbar button + LayerRow's own badge). Everyone
  // still *sees* an owner-locked layer's indicator; only the owner can
  // flip it.
  isOwner:    boolean
}

// Long-tap-to-multi-select (#129) has no discoverable affordance for touch
// users — the only documentation is a `title`, which never shows on touch
// (no hover). Same one-time-persisted-hint shape as displayName.ts's
// `al_`-prefixed localStorage convention: shown once, the first time this
// browser touches the panel at all, then never again.
const TOUCH_HINT_STORAGE_KEY = 'al_seen_layer_multiselect_hint'

function hasSeenTouchHint(): boolean {
  return localStorage.getItem(TOUCH_HINT_STORAGE_KEY) === 'true'
}

function markTouchHintSeen(): void {
  localStorage.setItem(TOUCH_HINT_STORAGE_KEY, 'true')
}

// Wrapped in memo (#127): Room re-renders far more often than layerState/
// onChange/onOp actually change (e.g. every pointermove while panning, #126)
// — without this, the whole DndContext + N LayerRow tree below re-renders
// and re-diffs on every one of those. Safe because all three props are
// already stable across unrelated Room re-renders: onChange is Room's
// setLayerState (a setState setter, stable by React's own guarantee) and
// onOp is Room's dispatchOp, itself useCallback'd off syncFromLog, which
// has an empty dependency array — see Room/index.tsx.
export const LayerPanel = memo(function LayerPanel({
  layerState, onChange, onOp, isOwner,
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

  const [showTouchHint, setShowTouchHint] = useState(false)

  // Fires on the very first touch anywhere in the panel (not just on a row —
  // taps on the toolbar count too), so the tip surfaces before the student
  // necessarily discovers long-press on their own. pointerType check mirrors
  // the convention used in useTapToggle/useViewport/PointerInput elsewhere
  // in this app rather than a device-capability check.
  const handlePanelPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !hasSeenTouchHint()) {
      setShowTouchHint(true)
      markTouchHintSeen()
    }
  }, [])

  const handleDismissTouchHint = useCallback(() => setShowTouchHint(false), [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // ── item mutations ───────────────────────────────────────────────────────────

  const handleOpacity = useCallback((id: string, v: number) =>
    onOp({ type: 'layer_opacity', layerId: id, opacity: v })
  , [onOp])

  const handleToggleLock = useCallback((id: string) =>
    onChange(patchItem(id, prev => ({ locked: !prev.locked })))
  , [onChange])

  // (#254/#260) Unlike handleToggleLock above (a purely local view-state
  // patch), this goes through the operation log — ownerLocked must be
  // synchronized to every participant and enforced server-side (#258), not
  // just a client-side gate. Server-side, non-owner senders of this op type
  // are rejected outright (see socketHandlers.ts's isOperationAllowed), so
  // this is never actually wired to a control a non-owner can reach — but
  // stays independent of `isOwner` itself so it doesn't silently no-op if
  // that ever changes.
  const handleToggleOwnerLock = useCallback((id: string) => {
    const item = items[id]
    if (item) onOp({ type: 'layer_owner_lock', layerId: id, locked: !item.ownerLocked })
  }, [items, onOp])

  const handleToggleVisible = useCallback((id: string) => {
    const item = items[id]
    if (item) onOp({ type: 'layer_visibility', layerId: id, visible: !item.visible })
  }, [items, onOp])

  const handleToggleCollapse = useCallback((id: string) =>
    onChange(patchItem(id, prev => isFolder(prev) ? { collapsed: !prev.collapsed } : {}))
  , [onChange])

  const handleRename = useCallback((id: string, name: string) =>
    onOp({ type: 'layer_rename', layerId: id, name })
  , [onOp])

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
    if (id === BACKGROUND_LAYER_ID) return // background never joins multi-select
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
    onOp({ type: 'layer_add', layerId: newId, name: `Layer ${count + 1}` })
    onChange(p => ({ ...p, activeId: newId, selectedIds: [] }))
  }, [layerState.items, onChange, onOp])

  const handleAddFolder = useCallback(() => {
    onOp({ type: 'folder_add', layerId: nanoid(8), name: 'Folder' })
  }, [onOp])

  // Reference image import (#88) — always its own new layer (never onto an
  // existing one), so image_import can assume a blank target with nothing
  // else racing to paint it. layer_add's name reuses the filename since
  // "Reference" for every import would be indistinguishable in the list.
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleImportImageClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    setImportError(null)
    try {
      const { dataUrl, width, height } = await readImageFile(file)
      const newId = nanoid(8)
      onOp({ type: 'layer_add', layerId: newId, name: file.name.replace(/\.[^./]+$/, '') || 'Reference' })
      onOp({ type: 'image_import', layerId: newId, image: dataUrl, width, height })
      onChange(p => ({ ...p, activeId: newId, selectedIds: [] }))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import image')
    } finally {
      // Reset only once the read has actually finished (success or failure)
      // rather than immediately on change — resetting the input's value
      // doesn't invalidate the already-grabbed File reference by spec, but
      // there's no upside to doing it before the read is done, either.
      input.value = ''
    }
  }, [onChange, onOp])

  const handleDelete = useCallback((ids?: string[]) => {
    const targets = (ids ?? (selectedIds.length > 0 ? selectedIds : [activeId]))
      .filter(id => id !== BACKGROUND_LAYER_ID)
    if (!targets.length) return

    // Resolve folder children at emission so replay never depends on what the
    // folder contained at other moments in history.
    const idSet = new Set<string>()
    for (const id of targets) {
      for (const d of collectDescendants(layerState, id)) idSet.add(d)
    }

    onOp({ type: 'layer_delete', layerIds: [...idSet] })
    onChange(p => ({ ...p, selectedIds: [] }))
  }, [activeId, selectedIds, layerState, onChange, onOp])

  // ── merge ────────────────────────────────────────────────────────────────────

  const emitMerge = useCallback((ids: string[], name: string, parentId: string | null, index: number) => {
    const newId = nanoid(8)
    onOp({
      type: 'layer_merge', layerId: newId, name,
      sources: computeMergeOrder(layerState, ids),
      parentId, index,
    })
    onChange(p => ({ ...p, activeId: newId, selectedIds: [] }))
  }, [layerState, onChange, onOp])

  const handleMergeSelected = useCallback(() => {
    const ids = selectedIds.filter(id => id !== BACKGROUND_LAYER_ID && items[id]?.kind === 'layer')
    if (ids.length < 2) return
    // Result lands at the topmost selected layer's own position in its own
    // container, mirroring handleMergeDown below — previously this always
    // inserted at root, ejecting the merge result out of whatever folder it
    // came from (#77).
    const containerId = parentOf(layerState, ids[0])
    const container = containerId ? items[containerId] : null
    const siblings = container && isFolder(container) ? container.children : rootOrder
    const idx = Math.min(...ids.map(id => siblings.indexOf(id)).filter(i => i >= 0))
    emitMerge(ids, 'Merged', containerId, idx)
  }, [selectedIds, items, layerState, rootOrder, emitMerge])

  const handleMergeDown = useCallback((id?: string) => {
    const sourceId = id ?? activeId
    if (!sourceId || sourceId === BACKGROUND_LAYER_ID) return
    const containerId = parentOf(layerState, sourceId)
    const container = containerId ? items[containerId] : null
    const siblings = container && isFolder(container) ? container.children : rootOrder
    const idx = siblings.indexOf(sourceId)
    const belowId = siblings.slice(idx + 1).find(sid => items[sid]?.kind === 'layer' && sid !== BACKGROUND_LAYER_ID) ?? null
    if (idx < 0 || !belowId) return
    // The merged layer takes the source's slot in its own container. Both
    // removed ids sit at idx or later, so idx is already the post-removal index.
    emitMerge([sourceId, belowId], `${items[sourceId].name} + ${items[belowId].name}`, containerId, idx)
  }, [activeId, layerState, rootOrder, items, emitMerge])

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
    handlePointerUp() // a started drag is not a long-press — cancel the pending select
    setDragId(String(e.active.id))
    setDragOverFolderId(null)
  }, [handlePointerUp])

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

    const { rootOrder: nextOrder, items: nextItems } = reconstructHierarchy(workingIds, items)

    // Folders are one level deep — a folder can never end up as another
    // folder's child. This catches every path that could nest one (landing
    // on the header, on a child row, or on the sentinel of another folder),
    // instead of only blocking the header case up front like before (which
    // also wrongly blocked placing a folder right next to another folder).
    if (isFolder(activeItemDnD)) {
      const nested = Object.values(nextItems).some(
        it => isFolder(it) && it.id !== activeIdDnD && it.children.includes(activeIdDnD),
      )
      if (nested) return
    }

    // Reduce the reconstructed hierarchy to a delta: where did the dragged
    // item land? A delta op keeps concurrent reorders composable — a full
    // order list would let a later reorder swallow another user's undo.
    let parentId: string | null = null
    let index = nextOrder.indexOf(activeIdDnD)
    for (const it of Object.values(nextItems)) {
      if (isFolder(it) && it.children.includes(activeIdDnD)) {
        parentId = it.id
        index = it.children.indexOf(activeIdDnD)
        break
      }
    }
    onOp({ type: 'layer_move', layerId: activeIdDnD, parentId, index })
  }, [items, onOp, computeInsertIndex])

  // ── toolbar state ────────────────────────────────────────────────────────────

  const canMergeSelected = selectedIds.filter(id => id !== BACKGROUND_LAYER_ID && items[id]?.kind === 'layer').length >= 2
  const canMergeDown     = !canMergeSelected
    && activeItem?.kind === 'layer'
    && activeId !== BACKGROUND_LAYER_ID
  const canMerge        = canMergeSelected || canMergeDown
  const canDelete       = activeId !== BACKGROUND_LAYER_ID || selectedIds.some(id => id !== BACKGROUND_LAYER_ID)
  const isActiveLocked  = !!activeItem?.locked
  const isActiveOwnerLocked = !!activeItem?.ownerLocked

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.body} onPointerDown={handlePanelPointerDown} onPointerUp={handlePointerUp}>
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
        <button className={styles.toolbarBtn} onClick={handleAddLayer} title="Add layer" aria-label="Add layer">
          <Icon name="add" />
        </button>
        <button className={styles.toolbarBtn} onClick={handleAddFolder} title="Add folder" aria-label="Add folder">
          <Icon name="create_new_folder" />
        </button>
        <button className={styles.toolbarBtn} onClick={handleImportImageClick} title="Import reference image" aria-label="Import reference image">
          <Icon name="add_photo_alternate" />
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenFileInput}
          onChange={handleImportImageChange}
        />
        <span className={styles.toolbarSpacer} />
        <button
          className={clsx(styles.toolbarBtn, isActiveLocked && styles.toolbarBtnLocked)}
          onClick={() => handleToggleLock(activeId)}
          disabled={activeId === BACKGROUND_LAYER_ID}
          title={isActiveLocked ? 'Unlock layer' : 'Lock layer'}
          aria-label={isActiveLocked ? 'Unlock layer' : 'Lock layer'}>
          <Icon name={isActiveLocked ? 'lock' : 'lock_open'} />
        </button>
        {isOwner && (
          <button
            className={clsx(styles.toolbarBtn, isActiveOwnerLocked && styles.toolbarBtnOwnerLocked)}
            onClick={() => handleToggleOwnerLock(activeId)}
            disabled={activeId === BACKGROUND_LAYER_ID}
            title={isActiveOwnerLocked ? 'Unlock layer for others (owner)' : 'Lock layer for others (owner)'}
            aria-label={isActiveOwnerLocked ? 'Unlock layer for others' : 'Lock layer for others'}>
            <Icon name="lock_person" />
          </button>
        )}
        <button
          className={styles.toolbarBtn}
          disabled={!canMerge}
          onClick={() => canMergeSelected ? handleMergeSelected() : handleMergeDown()}
          title={canMergeSelected ? 'Merge selected' : 'Merge down'}
          aria-label={canMergeSelected ? 'Merge selected' : 'Merge down'}>
          <Icon name="move_down" />
        </button>
        <button
          className={clsx(styles.toolbarBtn, styles.toolbarBtnDanger)}
          onClick={() => handleDelete()}
          disabled={!canDelete}
          title={selectedIds.length > 0 ? 'Delete selected' : 'Delete layer'}
          aria-label={selectedIds.length > 0 ? 'Delete selected' : 'Delete layer'}>
          <Icon name="delete" />
        </button>
      </div>

      {showTouchHint && (
        <div className={styles.touchHint}>
          <Icon name="info" />
          <span>Tip: press and hold a layer to select multiple</span>
          <button
            className={styles.touchHintDismiss}
            onClick={handleDismissTouchHint}
            title="Dismiss"
          >
            <Icon name="close" />
          </button>
        </div>
      )}

      {importError && <div className={styles.importError}>{importError}</div>}

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
                  isOwner={isOwner}
                  onActivate={handleActivate}
                  onToggleVisible={handleToggleVisible}
                  onToggleLock={handleToggleLock}
                  onToggleOwnerLock={handleToggleOwnerLock}
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
})

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
