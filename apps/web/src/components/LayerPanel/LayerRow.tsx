import { useState, useRef } from 'react'
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
  onActivate: (id: string, e: React.MouseEvent) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggleCollapse?: (id: string) => void
  onOpenMenu?: (id: string, anchor: HTMLElement) => void
  onOpenOpacity?: (id: string, anchor: HTMLElement) => void
  onPointerDown?: (id: string) => void
  onPointerUp?: () => void
}

export function LayerRow({
  item, depth, isActive, isSelected, isDragOverFolder,
  onActivate, onToggleVisible, onToggleLock, onRename, onToggleCollapse, onOpenMenu, onOpenOpacity,
  onPointerDown, onPointerUp,
}: LayerRowProps) {
  const [editing, setEditing] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const isFolderItem = isFolder(item)
  const isBackground = item.id === BACKGROUND_LAYER_ID
  const isLocked = !!item.locked
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
