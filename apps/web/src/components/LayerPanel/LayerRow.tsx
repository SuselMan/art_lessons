import { useRef, memo } from 'react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerItem } from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { isFolder, isLayerLocked } from '../../lib/layers'
import styles from './LayerPanel.module.css'

export interface LayerRowProps {
  item: LayerItem
  depth: number
  isActive: boolean
  isSelected: boolean
  isDragOverFolder?: boolean
  /** (#413) This row is part of the group currently being dragged. dnd-kit's
   *  own `isDragging` only ever describes the one row under the pointer. */
  isTravelling?: boolean
  // (#254/#260) Whether the *current viewer* is this room's owner — gates
  // whether the owner-lock badge below is an interactive toggle or a
  // read-only indicator. Not the same thing as `item.ownerLocked` (the
  // layer's own state, visible to everyone once true).
  isOwner: boolean
  onActivate: (id: string, e: React.MouseEvent) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onToggleOwnerLock?: (id: string) => void
  onRename: (id: string, name: string) => void
  // (#310) Inline name editing is controlled by LayerPanel rather than owned
  // here, so the row's context menu ("Rename") can open the very same editor a
  // double-click opens instead of a window.prompt.
  editing?: boolean
  onStartEditing?: (id: string) => void
  onStopEditing?: () => void
  onToggleCollapse?: (id: string) => void
  // (#328) The row's "⋮" is the shared `Menu` now, so the panel hands down the
  // actions themselves instead of an open-at-this-anchor callback.
  onMergeDown?: (id: string) => void
  onClear?: (id: string) => void
  onDelete?: (id: string) => void
  // (#411) Long-press-to-enter-selection-mode. `onPointerMove` cancels it:
  // once the drag moved to the grip, `.rowMain` no longer sets
  // `touch-action: none`, so a finger on a row scrolls the list — and a slow
  // scroll would otherwise cross 500 ms and drop the user into selection mode
  // they never asked for.
  onPointerDown?: (id: string) => void
  onPointerUp?: () => void
  onPointerMove?: (e: React.PointerEvent) => void
  /** Selection mode swaps the row's affordances: a checkbox appears, and the
   *  per-row menu and opacity readout give up their space to it — the row was
   *  already at its horizontal limit with eight controls (see the CSS note on
   *  `.rowMain`). */
  selectionMode?: boolean
  onToggleSelected?: (id: string) => void
}

function LayerRowImpl({
  item, depth, isActive, isSelected, isDragOverFolder, isTravelling = false, isOwner,
  onActivate, onToggleVisible, onToggleLock, onToggleOwnerLock, onRename,
  editing = false, onStartEditing, onStopEditing,
  onToggleCollapse, onMergeDown, onClear, onDelete,
  onPointerDown, onPointerUp, onPointerMove,
  selectionMode = false, onToggleSelected,
}: LayerRowProps) {
  const t = useT()
  const nameRef = useRef<HTMLInputElement>(null)

  const isFolderItem = isFolder(item)
  const isBackground = item.id === BACKGROUND_LAYER_ID
  const isLocked = isLayerLocked(item)
  const isOwnerLocked = !!item.ownerLocked
  const collapsed = isFolderItem && !!item.collapsed

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isBackground })

  const commit = () => {
    const v = nameRef.current?.value.trim()
    if (v) onRename(item.id, v)
    onStopEditing?.()
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging || isTravelling ? 0.4 : 1,
        // (#410) Depth is unbounded now; the indent is not. The row already
        // carries eight controls, and past the fourth level a tablet panel has
        // no width left for the name. Deeper rows stop stepping right rather
        // than squeezing the name to nothing — the chain of folder headers
        // above them still shows where they sit.
        marginLeft: 3 + Math.min(depth, 3) * 14,
      }}
      className={clsx(
        styles.rowMain,
        isActive && styles.rowActive,
        isSelected && styles.rowSelected,
        isBackground && styles.rowBackground,
        isDragOverFolder && styles.rowDragTarget,
      )}
      onClick={e => onActivate(item.id, e)}
      onPointerDown={() => onPointerDown?.(item.id)}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
    >
      {/* (#411) A checkbox in selection mode. Deliberately *additive* rather
          than replacing the grip: dragging a whole selection is the point of
          #413, so the handle has to survive the mode that builds the
          selection. */}
      {selectionMode && (isBackground
        ? <span className={styles.rowIconSpacer} />
        : (
          <button
            className={clsx(styles.rowIconBtn, isSelected && styles.rowCheckboxOn)}
            onClick={e => { e.stopPropagation(); onToggleSelected?.(item.id) }}
            title={t(isSelected ? 'layers.deselectRow' : 'layers.selectRow')}
            aria-label={t(isSelected ? 'layers.deselectRow' : 'layers.selectRow')}
            aria-pressed={isSelected}
          >
            <Icon name={isSelected ? 'check_box' : 'check_box_outline_blank'} />
          </button>
        )
      )}

      {/* (#411) The drag handle is the grip alone now, not the whole row.
          `listeners` used to sit on the row container, which made "hold a row"
          mean both "start dragging" and "start the long-press timer" — two
          gestures competing for one input, with dnd-kit's touch delay winning
          at 200 ms and cancelling the timer before it could ever fire. It also
          costs nothing to hand the row back to the browser: with `touch-action`
          moved to the grip, a finger on a row scrolls the list again. */}
      {isBackground
        ? <span className={styles.gripSpacer} />
        : (
          <span
            className={styles.grip}
            title={t('layers.dragHandle')}
            aria-label={t('layers.dragHandle')}
            {...attributes}
            {...listeners}
          >
            <Icon name="drag_indicator" />
          </span>
        )
      }

      <button
        className={styles.rowIconBtn}
        onClick={e => { e.stopPropagation(); onToggleVisible(item.id) }}
        title={t(item.visible ? 'layers.hide' : 'layers.show')}
        aria-label={t(item.visible ? 'layers.hide' : 'layers.show')}
      >
        <Icon name={item.visible ? 'visibility' : 'visibility_off'} />
      </button>

      {/* The background shows the same lock, permanently on and not clickable:
          it is the paper, and painting on it was never meant to be possible. */}
      <button
        className={clsx(styles.rowIconBtn, isLocked ? styles.rowIconBtnLocked : styles.rowIconBtnDim)}
        onClick={e => { e.stopPropagation(); onToggleLock(item.id) }}
        disabled={isBackground}
        title={isBackground ? t('layers.backgroundLocked') : t(isLocked ? 'layers.unlock' : 'layers.lock')}
        aria-label={isBackground ? t('layers.backgroundLocked') : t(isLocked ? 'layers.unlock' : 'layers.lock')}
      >
        <Icon name={isLocked ? 'lock' : 'lock_open'} />
      </button>

      {/* Owner-lock badge (#254/#260) — visually distinct from the plain
          lock button above (amber, `lock_person` icon), and shown to
          non-owners only once the layer actually *is* locked (nothing to
          toggle, so no point cluttering every row with a permanently-dim
          icon the way the plain lock button above does). The owner always
          sees it, locked or not, since it's their own toggle. */}
      {/* (#326) When it isn't shown its slot still is, as an empty spacer —
          otherwise every row that lacks it (the background, and any row a
          non-owner sees unlocked) pulls its name and everything right of it
          24px left, and the panel's column of names ends up ragged. Same
          reason `.gripSpacer` above exists for the background's missing
          drag handle. */}
      {!isBackground && (isOwner || isOwnerLocked) ? (
        <button
          className={clsx(
            styles.rowIconBtn,
            isOwner
              ? (isOwnerLocked ? styles.rowIconBtnOwnerLocked : styles.rowIconBtnDim)
              : styles.rowIconBtnOwnerLockedReadOnly,
          )}
          onClick={isOwner ? e => { e.stopPropagation(); onToggleOwnerLock?.(item.id) } : undefined}
          disabled={!isOwner}
          title={isOwner
            ? t(isOwnerLocked ? 'layers.ownerUnlock' : 'layers.ownerLock')
            : t('layers.lockedByOwner')}
          aria-label={isOwner
            ? t(isOwnerLocked ? 'layers.ownerUnlockShort' : 'layers.ownerLockShort')
            : t('layers.lockedByOwner')}
        >
          <Icon name="lock_person" />
        </button>
      ) : (
        <span className={styles.rowIconSpacer} />
      )}

      {isFolderItem ? (
        <button
          className={styles.folderToggleBtn}
          onClick={e => { e.stopPropagation(); onToggleCollapse?.(item.id) }}
          title={t(collapsed ? 'layers.expand' : 'layers.collapse')}
          aria-label={t(collapsed ? 'layers.expand' : 'layers.collapse')}
        >
          <Icon name={collapsed ? 'chevron_right' : 'expand_more'} />
          <Icon name={collapsed ? 'folder' : 'folder_open'} />
        </button>
      ) : (
        <span className={styles.typeIcon}><Icon name="brush" /></span>
      )}

      {editing ? (
        <input
          ref={nameRef}
          className={styles.nameInput}
          defaultValue={item.name}
          autoFocus
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onStopEditing?.() }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className={styles.name}
          onDoubleClick={e => { e.stopPropagation(); onStartEditing?.(item.id) }}
        >
          {item.name}
        </span>
      )}

      {/* Read-only readout. Clicking it used to open a per-row slider popup —
          a second control for something the panel's own opacity bar already
          does; the click now falls through to the row, activating the layer so
          that one shared slider targets it. */}
      {!selectionMode && (
        <span className={styles.opacityDisplay} title={t('layers.opacity')}>
          {Math.round(item.opacity * 100)}%
        </span>
      )}

      {!isBackground && !selectionMode && (
        <Menu
          triggerClassName={styles.rowIconBtn}
          triggerLabel={t('layers.more')}
          trigger={<Icon name="more_vert" />}
          actions={[
            { label: t('common.rename'),     icon: 'edit',            onClick: () => onStartEditing?.(item.id) },
            { label: t('layers.mergeDown'),  icon: 'vertical_align_bottom', onClick: () => onMergeDown?.(item.id), disabled: isFolderItem },
            // (#329) A folder holds no pixels of its own — clearing one would
            // have to mean clearing its children, which is a different action
            // nobody asked for.
            { label: t('layers.clearLayer'), icon: 'delete_forever',  onClick: () => onClear?.(item.id), disabled: isFolderItem },
            { label: t('common.delete'),     icon: 'delete',          onClick: () => onDelete?.(item.id), danger: true },
          ]}
        />
      )}
    </div>
  )
}

export const LayerRow = memo(LayerRowImpl)
