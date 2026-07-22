import { useState, useRef, memo } from 'react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerItem } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { Icon } from '../Icon'
import { isFolder } from '../../lib/layers'
import styles from './LayerPanel.module.css'

export interface LayerRowProps {
  item: LayerItem
  depth: number
  isActive: boolean
  isSelected: boolean
  isDragOverFolder?: boolean
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
  onToggleCollapse?: (id: string) => void
  onOpenMenu?: (id: string, anchor: HTMLElement) => void
  onOpenOpacity?: (id: string, anchor: HTMLElement) => void
  onPointerDown?: (id: string) => void
  onPointerUp?: () => void
}

function LayerRowImpl({
  item, depth, isActive, isSelected, isDragOverFolder, isOwner,
  onActivate, onToggleVisible, onToggleLock, onToggleOwnerLock, onRename, onToggleCollapse, onOpenMenu, onOpenOpacity,
  onPointerDown, onPointerUp,
}: LayerRowProps) {
  const [editing, setEditing] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const isFolderItem = isFolder(item)
  const isBackground = item.id === BACKGROUND_LAYER_ID
  const isLocked = !!item.locked
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
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        marginLeft: 3 + depth * 14,
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
      onPointerDown={e => { listeners?.onPointerDown?.(e); onPointerDown?.(item.id) }}
      onPointerUp={onPointerUp}
    >
      {isBackground
        ? <span className={styles.gripSpacer} />
        : <span className={styles.grip}><Icon name="drag_indicator" /></span>
      }

      <button
        className={styles.rowIconBtn}
        onClick={e => { e.stopPropagation(); onToggleVisible(item.id) }}
        title={item.visible ? 'Hide' : 'Show'}
        aria-label={item.visible ? 'Hide' : 'Show'}
      >
        <Icon name={item.visible ? 'visibility' : 'visibility_off'} />
      </button>

      <button
        className={clsx(styles.rowIconBtn, isLocked ? styles.rowIconBtnLocked : styles.rowIconBtnDim)}
        onClick={e => { e.stopPropagation(); onToggleLock(item.id) }}
        title={isLocked ? 'Unlock' : 'Lock'}
        aria-label={isLocked ? 'Unlock' : 'Lock'}
      >
        <Icon name={isLocked ? 'lock' : 'lock_open'} />
      </button>

      {/* Owner-lock badge (#254/#260) — visually distinct from the plain
          lock button above (amber, `lock_person` icon), and shown to
          non-owners only once the layer actually *is* locked (nothing to
          toggle, so no point cluttering every row with a permanently-dim
          icon the way the plain lock button above does). The owner always
          sees it, locked or not, since it's their own toggle. */}
      {!isBackground && (isOwner || isOwnerLocked) && (
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
            ? (isOwnerLocked ? 'Unlock layer for others (owner)' : 'Lock layer for others (owner)')
            : 'Locked by the room owner'}
          aria-label={isOwner
            ? (isOwnerLocked ? 'Unlock layer for others' : 'Lock layer for others')
            : 'Locked by the room owner'}
        >
          <Icon name="lock_person" />
        </button>
      )}

      {isFolderItem ? (
        <button
          className={styles.folderToggleBtn}
          onClick={e => { e.stopPropagation(); onToggleCollapse?.(item.id) }}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
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
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className={styles.name}
          onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
        >
          {item.name}
        </span>
      )}

      <button
        className={styles.opacityDisplay}
        onClick={e => { e.stopPropagation(); onOpenOpacity?.(item.id, e.currentTarget) }}
        title="Opacity"
      >
        {Math.round(item.opacity * 100)}%
      </button>

      {!isBackground && (
        <button
          className={styles.rowIconBtn}
          onClick={e => { e.stopPropagation(); onOpenMenu?.(item.id, e.currentTarget) }}
          title="More"
          aria-label="More"
        >
          <Icon name="more_vert" />
        </button>
      )}
    </div>
  )
}

export const LayerRow = memo(LayerRowImpl)
