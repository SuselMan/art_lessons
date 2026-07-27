import { useRef, memo } from 'react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayerItem } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { useT } from '../../i18n'
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
  // (#310) Inline name editing is controlled by LayerPanel rather than owned
  // here, so the row's context menu ("Rename") can open the very same editor a
  // double-click opens instead of a window.prompt.
  editing?: boolean
  onStartEditing?: (id: string) => void
  onStopEditing?: () => void
  onToggleCollapse?: (id: string) => void
  onOpenMenu?: (id: string, anchor: HTMLElement) => void
  onOpenOpacity?: (id: string, anchor: HTMLElement) => void
  onPointerDown?: (id: string) => void
  onPointerUp?: () => void
}

function LayerRowImpl({
  item, depth, isActive, isSelected, isDragOverFolder, isOwner,
  onActivate, onToggleVisible, onToggleLock, onToggleOwnerLock, onRename,
  editing = false, onStartEditing, onStopEditing,
  onToggleCollapse, onOpenMenu, onOpenOpacity,
  onPointerDown, onPointerUp,
}: LayerRowProps) {
  const t = useT()
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
    onStopEditing?.()
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
        title={t(item.visible ? 'layers.hide' : 'layers.show')}
        aria-label={t(item.visible ? 'layers.hide' : 'layers.show')}
      >
        <Icon name={item.visible ? 'visibility' : 'visibility_off'} />
      </button>

      <button
        className={clsx(styles.rowIconBtn, isLocked ? styles.rowIconBtnLocked : styles.rowIconBtnDim)}
        onClick={e => { e.stopPropagation(); onToggleLock(item.id) }}
        title={t(isLocked ? 'layers.unlock' : 'layers.lock')}
        aria-label={t(isLocked ? 'layers.unlock' : 'layers.lock')}
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
            ? t(isOwnerLocked ? 'layers.ownerUnlock' : 'layers.ownerLock')
            : t('layers.lockedByOwner')}
          aria-label={isOwner
            ? t(isOwnerLocked ? 'layers.ownerUnlockShort' : 'layers.ownerLockShort')
            : t('layers.lockedByOwner')}
        >
          <Icon name="lock_person" />
        </button>
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

      <button
        className={styles.opacityDisplay}
        onClick={e => { e.stopPropagation(); onOpenOpacity?.(item.id, e.currentTarget) }}
        title={t('layers.opacity')}
      >
        {Math.round(item.opacity * 100)}%
      </button>

      {!isBackground && (
        <button
          className={styles.rowIconBtn}
          onClick={e => { e.stopPropagation(); onOpenMenu?.(item.id, e.currentTarget) }}
          title={t('layers.more')}
          aria-label={t('layers.more')}
        >
          <Icon name="more_vert" />
        </button>
      )}
    </div>
  )
}

export const LayerRow = memo(LayerRowImpl)
