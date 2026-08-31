import { useRef, memo } from 'react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerItem } from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { isFolder } from '../../lib/layers'
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
  // (#449) Enabled for a folder too, unlike Merge down and Clear: those two are
  // about pixels a folder does not have, while duplicating one copies its shape
  // and everything inside it.
  onDuplicate?: (id: string) => void
  onClear?: (id: string) => void
  onDelete?: (id: string) => void
  // (#411) Long-press-to-enter-selection-mode. `onPointerMove` cancels it:
  // once the drag moved to the grip, `.rowMain` no longer sets
  // `touch-action: none`, so a finger on a row scrolls the list — and a slow
  // scroll would otherwise cross 500 ms and drop the user into selection mode
  // they never asked for.
  onPointerDown?: (id: string, e: React.PointerEvent) => void
  onPointerUp?: () => void
  onPointerMove?: (e: React.PointerEvent) => void
  /** Selection mode swaps the row's affordances: a checkbox appears, and the
   *  per-row menu and opacity readout give up their space to it — the row was
   *  already at its horizontal limit with eight controls (see the CSS note on
   *  `.rowMain`). */
  selectionMode?: boolean
  onToggleSelected?: (id: string) => void
  /** (#518) The row sits inside a folder that is locked. Its own flag is off,
   *  so its padlock has nothing to open \u2014 but the layer refuses paint all the
   *  same, and a row showing an open padlock while silently declining every
   *  stroke is the failure this issue is about. */
  lockedByFolder?: boolean
}

function LayerRowImpl({
  item, depth, isActive, isSelected, isDragOverFolder, isTravelling = false, isOwner,
  lockedByFolder = false,
  onActivate, onToggleVisible, onToggleLock, onToggleOwnerLock, onRename,
  editing = false, onStartEditing, onStopEditing,
  onToggleCollapse, onMergeDown, onDuplicate, onClear, onDelete,
  onPointerDown, onPointerUp, onPointerMove,
  selectionMode = false, onToggleSelected,
}: LayerRowProps) {
  const t = useT()
  const nameRef = useRef<HTMLInputElement>(null)

  const isFolderItem = isFolder(item)
  const isBackground = item.id === BACKGROUND_LAYER_ID
  // (#488) The shared lock's own flag — this row's padlock toggles that one,
  // and the amber badge below answers for the owner lock separately. Reading
  // isLayerLocked here would light this padlock up for a lock it cannot open.
  const isLocked = isBackground || !!item.locked
  // (#518) Closed for an inherited lock too, and then inert: the lock it would
  // open is not on this row. Disabled rather than wired through to the folder
  // \u2014 unlocking something you did not click is worse than a padlock that says
  // where the lock actually is, which the tooltip does.
  const showsLocked = isLocked || lockedByFolder
  const lockInherited = lockedByFolder && !isLocked
  const lockLabel = isBackground ? t('layers.backgroundLocked')
    : lockInherited ? t('layers.lockedByFolder')
    : t(isLocked ? 'layers.unlock' : 'layers.lock')
  const isOwnerLocked = !!item.ownerLocked
  const collapsed = isFolderItem && !!item.collapsed

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
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
        // Only `isTravelling` — the panel's own answer, which already includes
        // the grabbed row and, crucially, stays false until the drag actually
        // moves. dnd-kit's `isDragging` goes true the moment the touch delay
        // elapses, which on a long press is before anyone has decided whether
        // this is a drag at all.
        opacity: isTravelling ? 0.4 : 1,
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
      {...attributes}
      {...listeners}
      onClick={e => onActivate(item.id, e)}
      onPointerDown={e => { listeners?.onPointerDown?.(e); onPointerDown?.(item.id, e) }}
      onPointerUp={onPointerUp}
      // The browser fires this when it takes the gesture for a pan; without it
      // a pending long press would outlive a scroll that has already begun.
      onPointerCancel={onPointerUp}
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

      {/* The whole row is the drag handle; this only says so.
          #411 briefly moved dnd-kit's listeners here, to stop the touch drag
          and the long-press from fighting over one held finger. That separated
          them by *where* the finger lands, which cost the row-wide drag people
          actually use — and a 15px icon is not something you can aim a finger
          at anyway. They are separated by *what the finger does* now (see the
          sensors in LayerPanel: distance, not delay), so the grip goes back to
          being a hint. */}
      {isBackground
        ? <span className={styles.gripSpacer} />
        : (
          <span className={styles.grip} title={t('layers.dragHandle')}>
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
        className={clsx(styles.rowIconBtn, showsLocked ? styles.rowIconBtnLocked : styles.rowIconBtnDim)}
        onClick={e => { e.stopPropagation(); onToggleLock(item.id) }}
        disabled={isBackground || lockInherited}
        title={lockLabel}
        aria-label={lockLabel}
      >
        <Icon name={showsLocked ? 'lock' : 'lock_open'} />
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
            // (#434) The same three toggles the row's own icons carry, as a
            // second route to them. Deliberately not a replacement: the icons
            // show *state* at a glance across the whole list, which a menu
            // cannot do, and the menu says in words what an icon only implies —
            // "lock" and "lock for others" are two padlocks apart in the row.
            // They lead the list because they are the ones reached most often.
            {
              label: t(item.visible ? 'layers.hide' : 'layers.show'),
              icon: item.visible ? 'visibility_off' : 'visibility',
              onClick: () => onToggleVisible(item.id),
            },
            {
              label: lockInherited ? t('layers.lockedByFolder') : t(isLocked ? 'layers.unlock' : 'layers.lock'),
              icon: showsLocked ? 'lock_open' : 'lock',
              disabled: lockInherited,
              onClick: () => onToggleLock(item.id),
            },
            // Owner-only, and absent rather than disabled for everyone else:
            // a non-owner has nothing to flip here, and the row's amber badge
            // already tells them the layer is locked when it is.
            ...(isOwner ? [{
              label: t(isOwnerLocked ? 'layers.ownerUnlockShort' : 'layers.ownerLockShort'),
              icon: 'lock_person' as const,
              onClick: () => onToggleOwnerLock?.(item.id),
            }] : []),
            { label: t('common.rename'),     icon: 'edit',            onClick: () => onStartEditing?.(item.id) },
            // (#449) Above Merge down, not below: duplicating is the safe,
            // reversible half of this menu and the one reached most often of
            // the two, while everything from Merge down onward destroys or
            // consumes something.
            { label: t('layers.duplicate'),  icon: 'content_copy',    onClick: () => onDuplicate?.(item.id) },
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
