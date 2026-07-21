import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import type { Room, RoomFolder } from '@art-lessons/shared'
import { createFolder, deleteRoom, listRoomsAt, searchRooms, type RoomsAtFolder } from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import { EmptyState, ErrorState } from '../../components/ListState'
import styles from './MyLessons.module.css'

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

interface RoomCardProps {
  room: Room
  isOwnRoom: boolean
  confirming: boolean
  deleting: boolean
  onDeleteClick: () => void
  onCancelClick: () => void
}

function RoomCard({ room, isOwnRoom, confirming, deleting, onDeleteClick, onCancelClick }: RoomCardProps) {
  return (
    <div className={styles.card}>
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
        <div className={styles.cardName}>{room.name}</div>
        <div className={styles.cardMeta}>
          <span>{formatDate(room.createdAt)}</span>
          <span className={styles.dot}>·</span>
          <span>{isOwnRoom ? 'You' : (room.ownerName ?? 'Unknown owner')}</span>
        </div>
      </Link>
      {isOwnRoom && (
        confirming ? (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>Delete permanently?</span>
            <button type="button" className={styles.confirmButton} onClick={onDeleteClick} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" className={styles.cancelButton} onClick={onCancelClick} disabled={deleting}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={styles.deleteButton} onClick={onDeleteClick}>
            <Icon name="delete" />
            Delete
          </button>
        )
      )}
    </div>
  )
}

interface FolderCardProps {
  folder: RoomFolder
  onOpen: () => void
}

function FolderCard({ folder, onOpen }: FolderCardProps) {
  return (
    <button type="button" className={styles.folderCard} onClick={onOpen}>
      <Icon name="folder" />
      <span className={styles.folderName}>{folder.name}</span>
    </button>
  )
}

export function MyLessons() {
  const { me, loading: authLoading } = useAuth()
  const loggedIn = isLoggedIn(me)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  // Breadcrumb path from root to the currently open folder — root itself
  // isn't a real RoomFolder (no id), so an empty path means "at root".
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

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

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_, id) => {
      // Delete can happen from either view (folder browsing or search
      // results) — update whichever cache entry currently holds this room;
      // setQueryData is a no-op for a key that isn't cached.
      queryClient.setQueryData<RoomsAtFolder | undefined>(
        queryKey, prev => prev && { ...prev, rooms: prev.rooms.filter(r => r.id !== id) },
      )
      queryClient.setQueryData<{ rooms: Room[] } | undefined>(
        searchKey, prev => prev && { ...prev, rooms: prev.rooms.filter(r => r.id !== id) },
      )
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name, currentFolderId),
    onSuccess: folder => {
      queryClient.setQueryData<RoomsAtFolder | undefined>(
        queryKey, prev => prev && { ...prev, folders: [folder, ...prev.folders] },
      )
      setNewFolderOpen(false)
      setNewFolderName('')
    },
  })

  if (authLoading) return null
  if (!loggedIn) return <Navigate to="/login" replace />

  function handleDelete(id: string) {
    setConfirmingId(null)
    deleteMutation.mutate(id)
  }

  function openFolder(folder: { id: string; name: string }) {
    setPath(p => [...p, folder])
  }

  // -1 = root (truncate the whole path).
  function goToCrumb(index: number) {
    setPath(p => p.slice(0, index + 1))
  }

  const loadError = loadFailed ? 'Could not load your rooms' : null
  const deleteError = deleteMutation.isError ? 'Could not delete the room' : null
  const createFolderError = createFolderMutation.isError ? 'Could not create the folder' : null
  const searchError = searchFailed ? 'Search failed' : null
  const isEmpty = data !== undefined && data.folders.length === 0 && data.rooms.length === 0
  const isSearchEmpty = searchData !== undefined && searchData.rooms.length === 0

  function renderRoomCard(room: Room) {
    return (
      <RoomCard
        key={room.id}
        room={room}
        isOwnRoom={room.ownerId === me?.userId}
        confirming={confirmingId === room.id}
        deleting={deleteMutation.isPending && deleteMutation.variables === room.id}
        onDeleteClick={() => confirmingId === room.id ? handleDelete(room.id) : setConfirmingId(room.id)}
        onCancelClick={() => setConfirmingId(null)}
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
        <>
          <nav className={styles.breadcrumbs} aria-label="Folder path">
            <button
              type="button" className={styles.crumb} onClick={() => goToCrumb(-1)} disabled={path.length === 0}
            >
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
          ) : createFolderError ? (
            <ErrorState message={createFolderError} />
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
                  />
                ))}
                {data.rooms.map(renderRoomCard)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
