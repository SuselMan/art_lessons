import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Room, RoomFolder } from '@art-lessons/shared'
import {
  ApiError, createFolder, deleteFolder, deleteRoom, leaveRoom, listRoomsAt, moveFolder,
  moveRoomToFolder, renameFolder, renameRoom, searchRooms, type RoomsAtFolder,
} from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import { CardMenu } from '../../components/CardMenu'
import { MoveToDialog } from '../../components/MoveToDialog'
import { EmptyState, ErrorState } from '../../components/ListState'
import styles from './MyLessons.module.css'

// (#217) dnd-kit ids are flat strings — encode kind+id so one onDragEnd can
// dispatch to the right mutation regardless of what's dragged/dropped onto
// (a room, a folder, or a breadcrumb level standing in for "move up to
// here"). Reuses the same moveRoomToFolder/moveFolder mutations #216's
// "Move to..." dialog already calls — this is just a second way to trigger
// them, not a new API.
type DragTarget = { kind: 'room' | 'folder' | 'crumb'; id: string | null }

function encodeDragId(kind: 'room' | 'folder', id: string): string {
  return `${kind}:${id}`
}
function encodeCrumbId(id: string | null): string {
  return `crumb:${id ?? ''}`
}
function decodeDragId(raw: string): DragTarget {
  const sep = raw.indexOf(':')
  const kind = raw.slice(0, sep)
  const id = raw.slice(sep + 1)
  if (kind === 'crumb') return { kind: 'crumb', id: id || null }
  return { kind: kind as 'room' | 'folder', id }
}

/** A folder card is simultaneously a drag source (it can itself be moved)
 *  and a drop target (rooms/folders can be dropped onto it) — dnd-kit hands
 *  out a separate ref-setter for each role, so both need to land on the same
 *  DOM node. */
function useCombinedRefs(
  ...refs: Array<(node: HTMLElement | null) => void>
): (node: HTMLElement | null) => void {
  return useCallback((node: HTMLElement | null) => {
    for (const ref of refs) ref(node)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs)
}

// A folder-scoped level's query key — 'root' rather than `undefined` so
// react-query treats it as a stable, cacheable key (an `undefined` segment
// is dropped from the key, which would collide root's cache entry with
// itself across renders in surprising ways).
function roomsQueryKey(folderId: string | undefined) {
  return ['rooms', 'at', folderId ?? 'root'] as const
}

function searchQueryKey(q: string) {
  return ['rooms', 'search', q] as const
}

const SEARCH_DEBOUNCE_MS = 300

/** Delays reacting to a fast-changing value (keystrokes) until it's been
 *  stable for `delayMs` — keeps #218's search box from firing a request per
 *  keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
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
  // (#217) Draggable only — a room is never a drop target itself.
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: encodeDragId('room', room.id),
  })
  const dragStyle: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined

  return (
    <div ref={setNodeRef} style={dragStyle} className={styles.card} {...listeners} {...attributes}>
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
  // (#217) Both a drag source (this folder can be moved) and a drop target
  // (rooms/other folders can be dropped onto it to move inside) — same id
  // serves both registries, dnd-kit keeps them separate internally.
  const dragId = encodeDragId('folder', folder.id)
  const { setNodeRef: setDragRef, attributes, listeners, transform, isDragging } = useDraggable({ id: dragId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId })
  const setRefs = useCombinedRefs(setDragRef, setDropRef)
  const dragStyle: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined

  return (
    <div
      ref={setRefs}
      style={dragStyle}
      className={clsx(styles.folderCard, isOver && styles.folderCardDropActive)}
      {...listeners}
      {...attributes}
    >
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

interface CrumbButtonProps {
  label: string
  onClick: () => void
  navDisabled: boolean
  // (#217) The current (last) crumb is always nav-disabled AND drop-disabled
  // — dropping something "here" would be a no-op, it's already at this
  // level. Every ancestor crumb (including root) is a valid "move up to
  // this level" target.
  dropDisabled: boolean
  dropId: string
}

function CrumbButton({ label, onClick, navDisabled, dropDisabled, dropId }: CrumbButtonProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: dropDisabled })
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={clsx(styles.crumb, isOver && !dropDisabled && styles.crumbDropActive)}
      onClick={onClick}
      disabled={navDisabled}
    >
      {label}
    </button>
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

  // (#217) Name of whatever's currently being dragged, for the DragOverlay —
  // looked up once at drag start rather than tracked live, since the
  // dragged item's own card is already rendering its own dimmed state.
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  // pointerWithin catches small/edge drop targets (a breadcrumb button)
  // that closestCenter tends to skip in favor of a nearby larger card;
  // falls back to closestCenter when the pointer isn't over any droppable
  // at all (e.g. released past the edge of the grid) — same pattern as
  // LayerPanel's own collisionDetection.
  const dndCollision: CollisionDetection = useCallback(args => {
    const hits = pointerWithin(args)
    return hits.length > 0 ? hits : closestCenter(args)
  }, [])

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS).trim()
  const isSearching = debouncedSearch.length > 0

  const queryClient = useQueryClient()
  const queryKey = roomsQueryKey(currentFolderId)
  const { data, isError: loadFailed, refetch } = useQuery({
    queryKey, queryFn: () => listRoomsAt(currentFolderId), enabled: loggedIn && !isSearching,
  })

  const searchKey = searchQueryKey(debouncedSearch)
  const { data: searchData, isError: searchFailed, refetch: refetchSearch } = useQuery({
    queryKey: searchKey, queryFn: () => searchRooms(debouncedSearch), enabled: loggedIn && isSearching,
  })

  // Room actions (delete/leave/rename) can happen from either the
  // folder-scoped view or the search-results view, so their outcome must be
  // reflected in whichever cache(s) currently hold that room — `setQueryData`
  // is a no-op for a key that isn't cached, so touching both is always safe.
  // Move is the one exception: it only ever changes membership of the
  // *current folder* level, so it only needs to touch `queryKey` — a moved
  // room is still a valid search match regardless of which folder it's in.
  function updateRoomsInFolder(updater: (rooms: Room[]) => Room[]) {
    queryClient.setQueryData<RoomsAtFolder | undefined>(
      queryKey, prev => prev && { ...prev, rooms: updater(prev.rooms) },
    )
  }
  function updateRoomsEverywhere(updater: (rooms: Room[]) => Room[]) {
    updateRoomsInFolder(updater)
    queryClient.setQueryData<{ rooms: Room[] } | undefined>(
      searchKey, prev => prev && { ...prev, rooms: updater(prev.rooms) },
    )
  }
  function updateFolders(updater: (folders: RoomFolder[]) => RoomFolder[]) {
    queryClient.setQueryData<RoomsAtFolder | undefined>(
      queryKey, prev => prev && { ...prev, folders: updater(prev.folders) },
    )
  }

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_, id) => updateRoomsEverywhere(rooms => rooms.filter(r => r.id !== id)),
  })
  const leaveMutation = useMutation({
    mutationFn: leaveRoom,
    onSuccess: (_, id) => updateRoomsEverywhere(rooms => rooms.filter(r => r.id !== id)),
  })
  const renameRoomMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameRoom(id, name),
    onSuccess: updated => updateRoomsEverywhere(rooms => rooms.map(r => r.id === updated.id ? updated : r)),
  })
  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: updated => updateFolders(folders => folders.map(f => f.id === updated.id ? updated : f)),
  })
  const moveRoomMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => moveRoomToFolder(id, folderId),
    onSuccess: (_, { id }) => updateRoomsInFolder(rooms => rooms.filter(r => r.id !== id)),
  })
  const moveFolderMutation = useMutation({
    mutationFn: ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) =>
      moveFolder(id, parentFolderId),
    onSuccess: updated => updateFolders(folders => folders.filter(f => f.id !== updated.id)),
    onError: (err) => {
      setFolderError(
        err instanceof ApiError && err.code === 'cycle'
          ? "Can't move a folder into its own subfolder."
          : 'Could not move the folder',
      )
    },
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

  // (#217) Drag & drop — a second way to trigger the same move mutations
  // "Move to..." (#216) already uses. Same-level reordering is out of scope:
  // there's no `order` field on Room/RoomFolder to persist it against, so
  // only "drop onto a folder = move inside" and "drop onto a breadcrumb =
  // move up to that level" are supported.
  function handleDragStart(e: DragStartEvent) {
    const dragged = decodeDragId(String(e.active.id))
    const label = dragged.kind === 'room'
      ? data?.rooms.find(r => r.id === dragged.id)?.name
      : dragged.kind === 'folder'
        ? data?.folders.find(f => f.id === dragged.id)?.name
        : undefined
    setDraggingLabel(label ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingLabel(null)
    const { active, over } = e
    if (!over) return

    const dragged = decodeDragId(String(active.id))
    const target = decodeDragId(String(over.id))
    if (dragged.kind === 'crumb' || dragged.id === null) return // crumbs aren't draggable

    const destinationFolderId = target.id // null for both target.kind 'crumb' at root and n/a cases

    if (target.kind === 'folder') {
      if (dragged.kind === 'folder' && dragged.id === target.id) return // dropped on itself, no-op
      if (dragged.kind === 'room') moveRoomMutation.mutate({ id: dragged.id, folderId: target.id })
      else moveFolderMutation.mutate({ id: dragged.id, parentFolderId: target.id })
      return
    }

    if (target.kind === 'crumb') {
      if (dragged.kind === 'room') moveRoomMutation.mutate({ id: dragged.id, folderId: destinationFolderId })
      else moveFolderMutation.mutate({ id: dragged.id, parentFolderId: destinationFolderId })
    }
  }

  const loadError = loadFailed ? 'Could not load your rooms' : null
  const deleteError = deleteMutation.isError ? 'Could not delete the room' : null
  const leaveError = leaveMutation.isError ? 'Could not leave the room' : null
  const createFolderError = createFolderMutation.isError ? 'Could not create the folder' : null
  const searchError = searchFailed ? 'Search failed' : null
  const isEmpty = data !== undefined && data.folders.length === 0 && data.rooms.length === 0
  const isSearchEmpty = searchData !== undefined && searchData.rooms.length === 0
  const confirmBusy = deleteMutation.isPending || leaveMutation.isPending

  function renderRoomCard(room: Room) {
    return (
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
    )
  }

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

      <div className={styles.searchRow}>
        <Icon name="search" />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search rooms…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          aria-label="Search rooms"
        />
      </div>

      {isSearching ? (
        <>
          {searchError ? (
            <ErrorState message={searchError} onRetry={() => refetchSearch()} />
          ) : deleteError ? (
            <ErrorState message={deleteError} />
          ) : leaveError ? (
            <ErrorState message={leaveError} />
          ) : null}
          <section className={styles.section}>
            {searchData === undefined ? (
              <div className={styles.empty}>Searching…</div>
            ) : isSearchEmpty ? (
              <EmptyState icon="search_off" message={`No rooms match "${debouncedSearch}".`} />
            ) : (
              <div className={styles.grid}>
                {searchData.rooms.map(renderRoomCard)}
              </div>
            )}
          </section>
        </>
      ) : (
        <DndContext
          sensors={dndSensors}
          collisionDetection={dndCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <nav className={styles.breadcrumbs} aria-label="Folder path">
            <CrumbButton
              label="My Lessons"
              onClick={() => goToCrumb(-1)}
              navDisabled={path.length === 0}
              dropDisabled={path.length === 0}
              dropId={encodeCrumbId(null)}
            />
            {path.map((crumb, i) => (
              <span key={crumb.id} className={styles.crumbGroup}>
                <span className={styles.crumbSep}>/</span>
                <CrumbButton
                  label={crumb.name}
                  onClick={() => goToCrumb(i)}
                  navDisabled={i === path.length - 1}
                  dropDisabled={i === path.length - 1}
                  dropId={encodeCrumbId(crumb.id)}
                />
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
                {data.rooms.map(renderRoomCard)}
              </div>
            )}
          </section>

          <DragOverlay>
            {draggingLabel && <div className={styles.dragOverlay}>{draggingLabel}</div>}
          </DragOverlay>
        </DndContext>
      )}

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
