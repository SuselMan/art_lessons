import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import type { Room, RoomFolder } from '@art-lessons/shared'
import {
  ApiError, createFolder, deleteFolder, deleteRoom, leaveRoom, listRoomsAt, moveFolder,
  moveRoomToFolder, renameFolder, renameRoom, type RoomsAtFolder,
} from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import { CardMenu } from '../../components/CardMenu'
import { MoveToDialog } from '../../components/MoveToDialog'
import { EmptyState, ErrorState } from '../../components/ListState'
import styles from './MyLessons.module.css'

// A folder-scoped level's query key — 'root' rather than `undefined` so
// react-query treats it as a stable, cacheable key (an `undefined` segment
// is dropped from the key, which would collide root's cache entry with
// itself across renders in surprising ways).
function roomsQueryKey(folderId: string | undefined) {
  return ['rooms', 'at', folderId ?? 'root'] as const
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Identifies whichever room/folder is mid inline-rename, mid delete/leave
// confirm, or the target of an open "Move to..." dialog — only one of these
// interactions is ever active across the whole page at a time.
type ItemRef = { kind: 'room' | 'folder'; id: string }

interface RoomCardProps {
  room: Room
  isOwnRoom: boolean
  confirmingAction: boolean
  renaming: boolean
  renameText: string
  onRenameTextChange: (text: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  busy: boolean
  onRenameClick: () => void
  onMoveClick: () => void
  onDeleteOrLeaveClick: () => void
  onConfirmClick: () => void
  onCancelConfirmClick: () => void
}

function RoomCard({
  room, isOwnRoom, confirmingAction, renaming, renameText, onRenameTextChange, onRenameSubmit, onRenameCancel,
  busy, onRenameClick, onMoveClick, onDeleteOrLeaveClick, onConfirmClick, onCancelConfirmClick,
}: RoomCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardMenuOverlay}>
        <CardMenu
          actions={[
            { label: 'Rename', onClick: onRenameClick },
            { label: 'Move to...', onClick: onMoveClick },
            { label: 'Fork/Clone', onClick: () => {}, disabled: true, title: 'Coming soon' },
            {
              label: isOwnRoom ? 'Delete' : 'Leave room',
              onClick: onDeleteOrLeaveClick,
              danger: true,
            },
          ]}
        />
      </div>
      <Link className={styles.cardLink} to={`/room/${room.id}`}>
        {room.thumbnailUpdatedAt && (
          // `v=` is pure cache-busting for when a new thumbnail is uploaded
          // (#210) — same room id would otherwise keep serving a stale
          // browser-cached image forever since the URL never changes.
          <img
            className={styles.cardThumbnail}
            src={`/api/rooms/${room.id}/thumbnail?v=${encodeURIComponent(room.thumbnailUpdatedAt)}`}
            alt=""
            loading="lazy"
          />
        )}
        {renaming ? (
          <input
            className={styles.renameInput}
            autoFocus
            value={renameText}
            onClick={e => e.preventDefault()}
            onChange={e => onRenameTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit() }
              if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
            }}
            onBlur={onRenameSubmit}
          />
        ) : (
          <div className={styles.cardName}>{room.name}</div>
        )}
        <div className={styles.cardMeta}>
          <span>{formatDate(room.createdAt)}</span>
          <span className={styles.dot}>·</span>
          <span>{isOwnRoom ? 'You' : (room.ownerName ?? 'Unknown owner')}</span>
        </div>
      </Link>
      {confirmingAction && (
        <div className={styles.confirmRow}>
          <span className={styles.confirmText}>
            {isOwnRoom ? 'Delete permanently for everyone?' : 'Leave this room? It stays for everyone else.'}
          </span>
          <button type="button" className={styles.confirmButton} onClick={onConfirmClick} disabled={busy}>
            {busy ? 'Working…' : isOwnRoom ? 'Yes, delete' : 'Yes, leave'}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onCancelConfirmClick} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

interface FolderCardProps {
  folder: RoomFolder
  onOpen: () => void
  renaming: boolean
  renameText: string
  onRenameTextChange: (text: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onRenameClick: () => void
  onMoveClick: () => void
  onDeleteClick: () => void
}

function FolderCard({
  folder, onOpen, renaming, renameText, onRenameTextChange, onRenameSubmit, onRenameCancel,
  onRenameClick, onMoveClick, onDeleteClick,
}: FolderCardProps) {
  return (
    <div className={styles.folderCard}>
      {renaming ? (
        <input
          className={styles.renameInput}
          autoFocus
          value={renameText}
          onChange={e => onRenameTextChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit() }
            if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
          }}
          onBlur={onRenameSubmit}
        />
      ) : (
        <button type="button" className={styles.folderOpenButton} onClick={onOpen}>
          <Icon name="folder" />
          <span className={styles.folderName}>{folder.name}</span>
        </button>
      )}
      <CardMenu
        actions={[
          { label: 'Rename', onClick: onRenameClick },
          { label: 'Move to...', onClick: onMoveClick },
          { label: 'Delete', onClick: onDeleteClick, danger: true },
        ]}
      />
    </div>
  )
}

export function MyLessons() {
  const { me, loading: authLoading } = useAuth()
  const loggedIn = isLoggedIn(me)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingItem, setRenamingItem] = useState<ItemRef | null>(null)
  const [renameText, setRenameText] = useState('')
  const [moveTarget, setMoveTarget] = useState<ItemRef | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  // Breadcrumb path from root to the currently open folder — root itself
  // isn't a real RoomFolder (no id), so an empty path means "at root".
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

  const queryClient = useQueryClient()
  const queryKey = roomsQueryKey(currentFolderId)
  const { data, isError: loadFailed, refetch } = useQuery({
    queryKey, queryFn: () => listRoomsAt(currentFolderId), enabled: loggedIn,
  })

  function updateRooms(updater: (rooms: Room[]) => Room[]) {
    queryClient.setQueryData<RoomsAtFolder | undefined>(
      queryKey, prev => prev && { ...prev, rooms: updater(prev.rooms) },
    )
  }
  function updateFolders(updater: (folders: RoomFolder[]) => RoomFolder[]) {
    queryClient.setQueryData<RoomsAtFolder | undefined>(
      queryKey, prev => prev && { ...prev, folders: updater(prev.folders) },
    )
  }

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_, id) => updateRooms(rooms => rooms.filter(r => r.id !== id)),
  })
  const leaveMutation = useMutation({
    mutationFn: leaveRoom,
    onSuccess: (_, id) => updateRooms(rooms => rooms.filter(r => r.id !== id)),
  })
  const renameRoomMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameRoom(id, name),
    onSuccess: updated => updateRooms(rooms => rooms.map(r => r.id === updated.id ? updated : r)),
  })
  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: updated => updateFolders(folders => folders.map(f => f.id === updated.id ? updated : f)),
  })
  const moveRoomMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => moveRoomToFolder(id, folderId),
    onSuccess: (_, { id }) => updateRooms(rooms => rooms.filter(r => r.id !== id)),
  })
  const moveFolderMutation = useMutation({
    mutationFn: ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) =>
      moveFolder(id, parentFolderId),
    onSuccess: updated => updateFolders(folders => folders.filter(f => f.id !== updated.id)),
  })
  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: (_, id) => updateFolders(folders => folders.filter(f => f.id !== id)),
    onError: (err) => {
      setFolderError(
        err instanceof ApiError && err.code === 'not_empty'
          ? 'This folder still has rooms or subfolders in it — move or delete those first.'
          : 'Could not delete the folder',
      )
    },
  })
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name, currentFolderId),
    onSuccess: folder => {
      updateFolders(folders => [folder, ...folders])
      setNewFolderOpen(false)
      setNewFolderName('')
    },
  })

  if (authLoading) return null
  if (!loggedIn) return <Navigate to="/login" replace />

  function openFolder(folder: { id: string; name: string }) {
    setPath(p => [...p, folder])
  }

  // -1 = root (truncate the whole path).
  function goToCrumb(index: number) {
    setPath(p => p.slice(0, index + 1))
  }

  function startRename(item: ItemRef, currentName: string) {
    setRenamingItem(item)
    setRenameText(currentName)
  }
  function submitRename() {
    if (!renamingItem) return
    const name = renameText.trim()
    const item = renamingItem
    setRenamingItem(null)
    if (!name) return
    if (item.kind === 'room') renameRoomMutation.mutate({ id: item.id, name })
    else renameFolderMutation.mutate({ id: item.id, name })
  }

  function handleMoveSelect(folderId: string | null) {
    if (!moveTarget) return
    if (moveTarget.kind === 'room') moveRoomMutation.mutate({ id: moveTarget.id, folderId })
    else moveFolderMutation.mutate({ id: moveTarget.id, parentFolderId: folderId })
    setMoveTarget(null)
  }

  const loadError = loadFailed ? 'Could not load your rooms' : null
  const deleteError = deleteMutation.isError ? 'Could not delete the room' : null
  const leaveError = leaveMutation.isError ? 'Could not leave the room' : null
  const createFolderError = createFolderMutation.isError ? 'Could not create the folder' : null
  const isEmpty = data !== undefined && data.folders.length === 0 && data.rooms.length === 0
  const confirmBusy = deleteMutation.isPending || leaveMutation.isPending

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Art Lessons</div>
        <AccountNav />
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.heading}>My Lessons</h1>
        <Link
          className={styles.newRoomLink}
          to="/create"
          state={currentFolderId ? { folderId: currentFolderId } : undefined}
        >
          <Icon name="add" />
          New room
        </Link>
      </div>

      <nav className={styles.breadcrumbs} aria-label="Folder path">
        <button type="button" className={styles.crumb} onClick={() => goToCrumb(-1)} disabled={path.length === 0}>
          My Lessons
        </button>
        {path.map((crumb, i) => (
          <span key={crumb.id} className={styles.crumbGroup}>
            <span className={styles.crumbSep}>/</span>
            <button
              type="button"
              className={styles.crumb}
              onClick={() => goToCrumb(i)}
              disabled={i === path.length - 1}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className={styles.toolbar}>
        {newFolderOpen ? (
          <form
            className={styles.newFolderForm}
            onSubmit={e => {
              e.preventDefault()
              if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim())
            }}
          >
            <input
              className={styles.newFolderInput}
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              maxLength={50}
            />
            <button type="submit" className={styles.newFolderSubmit} disabled={createFolderMutation.isPending}>
              Create
            </button>
            <button
              type="button"
              className={styles.newFolderCancel}
              onClick={() => { setNewFolderOpen(false); setNewFolderName('') }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className={styles.newFolderButton} onClick={() => setNewFolderOpen(true)}>
            <Icon name="create_new_folder" />
            New folder
          </button>
        )}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => refetch()} />
      ) : deleteError ? (
        <ErrorState message={deleteError} />
      ) : leaveError ? (
        <ErrorState message={leaveError} />
      ) : createFolderError ? (
        <ErrorState message={createFolderError} />
      ) : folderError ? (
        <ErrorState message={folderError} onRetry={() => setFolderError(null)} />
      ) : null}

      <section className={styles.section}>
        {data === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : isEmpty ? (
          <EmptyState
            icon="folder_open"
            message={path.length > 0 ? 'This folder is empty.' : "You don't have any rooms yet."}
          />
        ) : (
          <div className={styles.grid}>
            {data.folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={() => openFolder({ id: folder.id, name: folder.name })}
                renaming={renamingItem?.kind === 'folder' && renamingItem.id === folder.id}
                renameText={renameText}
                onRenameTextChange={setRenameText}
                onRenameSubmit={submitRename}
                onRenameCancel={() => setRenamingItem(null)}
                onRenameClick={() => startRename({ kind: 'folder', id: folder.id }, folder.name)}
                onMoveClick={() => setMoveTarget({ kind: 'folder', id: folder.id })}
                onDeleteClick={() => deleteFolderMutation.mutate(folder.id)}
              />
            ))}
            {data.rooms.map(room => (
              <RoomCard
                key={room.id}
                room={room}
                isOwnRoom={room.ownerId === me?.userId}
                confirmingAction={confirmingId === room.id}
                busy={confirmBusy}
                renaming={renamingItem?.kind === 'room' && renamingItem.id === room.id}
                renameText={renameText}
                onRenameTextChange={setRenameText}
                onRenameSubmit={submitRename}
                onRenameCancel={() => setRenamingItem(null)}
                onRenameClick={() => startRename({ kind: 'room', id: room.id }, room.name)}
                onMoveClick={() => setMoveTarget({ kind: 'room', id: room.id })}
                onDeleteOrLeaveClick={() => setConfirmingId(room.id)}
                onConfirmClick={() => {
                  setConfirmingId(null)
                  if (room.ownerId === me?.userId) deleteMutation.mutate(room.id)
                  else leaveMutation.mutate(room.id)
                }}
                onCancelConfirmClick={() => setConfirmingId(null)}
              />
            ))}
          </div>
        )}
      </section>

      {moveTarget && (
        <MoveToDialog
          title={moveTarget.kind === 'room' ? 'Move room to...' : 'Move folder to...'}
          onCancel={() => setMoveTarget(null)}
          onSelect={handleMoveSelect}
        />
      )}
    </div>
  )
}
