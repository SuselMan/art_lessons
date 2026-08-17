import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Room, RoomFolder } from '@grafetto/shared'
import {
  ApiError, createFolder, deleteFolder, deleteRoom, forkRoom, leaveRoom, listRoomsAt, moveFolder,
  moveRoomToFolder, renameFolder, renameRoom, searchRooms, setRoomClosed, type RoomsAtFolder,
} from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { preloadRoomPage } from '../../lib/roomChunk'
import { notifyError } from '../../stores/noticeStore'
import { useSettingsStore, type LessonsView } from '../../stores/settingsStore'
import { useLocale, useT, type TFunction, type TranslationKey } from '../../i18n'
import { AppHeader } from '../../components/AppHeader'
import { Icon } from '../../components/Icon'
import { CardMenu } from '../../components/CardMenu'
import { TextInput } from '../../components/TextInput'
import { MoveToDialog } from '../../components/MoveToDialog'
import { Modal } from '../../components/Modal'
import { RoomAccessControl } from '../../components/RoomAccessControl'
import { EmptyState, ErrorState } from '../../components/ListState'
import styles from './MyLessons.module.css'
import type { IconName } from '../../icons/iconNames'

// (#217) dnd-kit ids are flat strings — encode kind+id so one onDragEnd can
// dispatch to the right mutation regardless of what's dragged/dropped onto
// (a room, a folder, or a breadcrumb level standing in for "move up to
// here"). Reuses the same moveRoomToFolder/moveFolder mutations #216's
// "Move to..." dialog already calls — this is just a second way to trigger
// them, not a new API.
type DragTarget = { kind: 'room' | 'folder' | 'crumb'; id: string | null }

/** (#331) How long a finger has to rest on a card before it comes loose for
 *  dragging. Everything below this stays the browser's, so the list scrolls
 *  normally — which it could not do at all while the cards carried
 *  `touch-action: none`. */
const LONG_PRESS_MS = 400

/** (#331) A single short buzz at the moment a card detaches. This is what
 *  makes press-and-hold legible without anyone being taught it: the finger
 *  hasn't moved yet, so nothing on screen has told you the gesture landed.
 *
 *  Touch activations only — a mouse drag has no such moment, it starts when
 *  you're already moving. Feature-detected because iOS Safari has no
 *  Vibration API at all; there the overlay's lift is the whole feedback, and
 *  that's why it exists rather than being decoration. */
function pulseOnDetach(activatorEvent: Event | null): void {
  const fromTouch = typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent
  if (!fromTouch || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(15)
}

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

// Month names and field order follow the app's language, not the browser's
// — someone reading a Russian UI expects "27 июл. 2026", whatever their OS
// locale happens to be (#208).
function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Identifies whichever room/folder is mid inline-rename, mid delete/leave
// confirm, or the target of an open "Move to..." dialog — only one of these
// interactions is ever active across the whole page at a time.
type ItemRef = { kind: 'room' | 'folder'; id: string }

// (#360) The move dialog also needs to know where the item sits *now*, so it
// can stop offering "move here" into the folder it's already in. Carried on
// the ref rather than derived at render time: in search results a room can
// live anywhere, not necessarily in the folder currently open.
type MoveTarget = ItemRef & { parentFolderId: string | null }

interface RoomCardProps {
  t: TFunction
  locale: string
  view: LessonsView
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
  onForkClick: () => void
  onAccessClick: () => void
  onToggleClosedClick: () => void
  onDeleteOrLeaveClick: () => void
  onConfirmClick: () => void
  onCancelConfirmClick: () => void
}

function RoomCard({
  t, locale, view, room, isOwnRoom, confirmingAction, renaming, renameText, onRenameTextChange, onRenameSubmit,
  onRenameCancel, busy, onRenameClick, onMoveClick, onForkClick, onAccessClick, onToggleClosedClick,
  onDeleteOrLeaveClick, onConfirmClick, onCancelConfirmClick,
}: RoomCardProps) {
  // (#222) Closed for editing — homework that has been handed out, or a
  // template kept from drifting. Owner-only to toggle; visible to everyone,
  // since it changes what the room does when you open it.
  const closed = room.closedAt !== undefined
  // (#217) Draggable only — a room is never a drop target itself.
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: encodeDragId('room', room.id),
  })
  const dragStyle: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={clsx(styles.card, view === 'list' && styles.cardListItem)}
      {...listeners}
      {...attributes}
    >
      <div className={styles.cardMenuOverlay}>
        <CardMenu
          actions={[
            { label: t('common.rename'), onClick: onRenameClick },
            { label: t('common.moveTo'), onClick: onMoveClick },
            { label: t('lessons.fork'), onClick: onForkClick, disabled: busy },
            // Only the owner can toggle it, and the server enforces that
            // independently (#222) — hiding the item for everyone else keeps
            // the menu honest rather than offering an action that 403s.
            // (#229) Access is reachable from the list, not only from inside
            // the room: inviting a student, or revoking a link that spread
            // further than intended, is something a teacher does *between*
            // lessons. Owner-only for the same reason as the toggle below —
            // the endpoints 403 anyone else, and a menu that offers actions
            // which fail is a menu that lies.
            ...(isOwnRoom
              ? [
                { label: t('access.title'), onClick: onAccessClick },
                { label: t(closed ? 'lessons.reopen' : 'lessons.close'), onClick: onToggleClosedClick, disabled: busy },
              ]
              : []),
            {
              label: t(isOwnRoom ? 'common.delete' : 'lessons.leaveRoom'),
              onClick: onDeleteOrLeaveClick,
              danger: true,
            },
          ]}
        />
      </div>
      {/* (#217 follow-up) draggable={false} on both the link and the image —
          without it, starting a drag on either triggers the browser's own
          native link/image drag (an <a>/<img> is draggable by default),
          which swallows the pointer gesture before dnd-kit's PointerSensor
          ever sees it. That's what made room→folder drag-and-drop silently
          do nothing. */}
      <Link className={styles.cardLink} to={`/room/${room.id}`} draggable={false}>
        {room.thumbnailUpdatedAt ? (
          // `v=` is pure cache-busting for when a new thumbnail is uploaded
          // (#210) — same room id would otherwise keep serving a stale
          // browser-cached image forever since the URL never changes.
          <img
            className={styles.cardThumbnail}
            src={`/api/rooms/${room.id}/thumbnail?v=${encodeURIComponent(room.thumbnailUpdatedAt)}`}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className={styles.cardThumbnailPlaceholder}>
            <Icon name="image_not_supported" />
          </div>
        )}
        {/* Name+meta share a wrapper so the two layouts differ by one axis
            flip: in 'grid' this column sits *under* the hero thumbnail, in
            'list' it sits *beside* a small one. Without it, a row-direction
            .cardLink would put the thumbnail, the name and the meta line all
            side by side. */}
        <div className={styles.cardText}>
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
            <span>{formatDate(room.createdAt, locale)}</span>
            <span className={styles.dot}>·</span>
            <span>{isOwnRoom ? t('lessons.ownerYou') : (room.ownerName ?? t('lessons.ownerUnknown'))}</span>
            {closed && (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.closedBadge}>
                  <Icon name="lock" />
                  {t('lessons.closedBadge')}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
      {confirmingAction && (
        <div className={styles.confirmRow}>
          <span className={styles.confirmText}>
            {t(isOwnRoom ? 'lessons.confirmDelete' : 'lessons.confirmLeave')}
          </span>
          <button type="button" className={styles.confirmButton} onClick={onConfirmClick} disabled={busy}>
            {busy ? t('common.working') : t(isOwnRoom ? 'lessons.yesDelete' : 'lessons.yesLeave')}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onCancelConfirmClick} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

interface FolderCardProps {
  t: TFunction
  view: LessonsView
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
  t, view, folder, onOpen, renaming, renameText, onRenameTextChange, onRenameSubmit, onRenameCancel,
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
      className={clsx(
        styles.folderCard,
        view === 'list' && styles.folderListItem,
        isOver && styles.folderCardDropActive,
      )}
      {...listeners}
      {...attributes}
    >
      {/* Same top-right overlay position as RoomCard's menu (#211 feedback:
          keep the ⋮ in one consistent spot regardless of card kind). */}
      <div className={styles.cardMenuOverlay}>
        <CardMenu
          actions={[
            { label: t('common.rename'), onClick: onRenameClick },
            { label: t('common.moveTo'), onClick: onMoveClick },
            { label: t('common.delete'), onClick: onDeleteClick, danger: true },
          ]}
        />
      </div>
      {/* Mirrors RoomCard's thumbnail(4:3 hero)+name structure exactly (same
          padding/aspect-ratio math) so a folder tile and a room tile are
          always the same height, regardless of what else shares their grid
          row (#211 feedback: folder-only rows were shrinking otherwise). */}
      <button type="button" className={styles.folderOpenButton} onClick={onOpen}>
        <div className={styles.folderIconArea}>
          <Icon name="folder" />
        </div>
        {renaming ? (
          // Unlike RoomCard's Link (preventDefault alone stops react-router
          // navigation), this input lives inside a plain <button
          // onClick={onOpen}> — a click bubbles straight to that handler
          // regardless of preventDefault, so it needs stopPropagation too or
          // every click to place the cursor would also open the folder.
          <input
            className={styles.renameInput}
            autoFocus
            value={renameText}
            onClick={e => e.stopPropagation()}
            onChange={e => onRenameTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit() }
              if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
            }}
            onBlur={onRenameSubmit}
          />
        ) : (
          <span className={styles.folderName}>{folder.name}</span>
        )}
      </button>
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

/** Tiles ⇄ list. Two buttons rather than one toggling button: which layout
 *  you're in and which one you'd switch to are both visible at rest, and the
 *  choice stays a choice rather than a mystery state you have to click to
 *  discover. */
function ViewToggle({ t, view, onChange }: {
  t: TFunction
  view: LessonsView
  onChange: (view: LessonsView) => void
}) {
  const options: { value: LessonsView; icon: IconName; label: TranslationKey }[] = [
    { value: 'grid', icon: 'grid_view', label: 'lessons.viewGrid' },
    { value: 'list', icon: 'view_list', label: 'lessons.viewList' },
  ]
  return (
    <div className={styles.viewToggle} role="group" aria-label={t('lessons.viewLabel')}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={clsx(styles.viewButton, view === option.value && styles.viewButtonActive)}
          onClick={() => onChange(option.value)}
          aria-pressed={view === option.value}
          aria-label={t(option.label)}
          title={t(option.label)}
        >
          <Icon name={option.icon} />
        </button>
      ))}
    </div>
  )
}

export function MyLessons() {
  const t = useT()
  const locale = useLocale()
  const view = useSettingsStore(s => s.lessonsView)
  const setView = useSettingsStore(s => s.setLessonsView)
  const { me, loading: authLoading } = useAuth()
  const loggedIn = isLoggedIn(me)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // (#351) Every card on this page is a door into the Room chunk, so start
  // fetching it now rather than on whichever card gets clicked — see
  // lib/roomChunk.ts for why that click is otherwise a multi-second wait
  // with the old page still on screen.
  useEffect(preloadRoomPage, [])
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingItem, setRenamingItem] = useState<ItemRef | null>(null)
  const [renameText, setRenameText] = useState('')
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)
  // (#229) The room whose access panel is open, with its name for the modal
  // title — the panel itself only needs the id.
  const [accessRoom, setAccessRoom] = useState<{ id: string; name: string } | null>(null)
  // Breadcrumb path from root to the currently open folder — root itself
  // isn't a real RoomFolder (no id), so an empty path means "at root".
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

  // (#217) Name of whatever's currently being dragged, for the DragOverlay —
  // looked up once at drag start rather than tracked live, since the
  // dragged item's own card is already rendering its own dimmed state.
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null)
  // (#331) MouseSensor + TouchSensor, deliberately *not* PointerSensor.
  // Pointer events cover mouse and touch alike, so a single PointerSensor was
  // racing the delayed TouchSensor on every tablet gesture and winning it
  // after 5 px of movement — which on a list is a scroll, not a drag. Split
  // by event family and the two can never contend, which is the general shape
  // ADR #318 settles on: both control schemes registered at all times, kept
  // apart by the events they listen to rather than by a device flag, so a
  // wrong guess about the device can't take a gesture away.
  //
  // On touch a drag now has to be asked for: press and hold, and any movement
  // past `tolerance` before the delay is up cancels it and stays a scroll.
  // The delay is long enough not to fire while flicking through a list and
  // short enough not to feel stuck — the same range the OS itself uses for
  // press-and-hold.
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 5 } }),
  )
  // pointerWithin catches small/edge drop targets (a breadcrumb button) that
  // a pure rect-intersection check can miss when the pointer's exactly on a
  // shared border. Falls back to rectIntersection — NOT closestCenter — for
  // the rest: closestCenter always returns *some* droppable, however far
  // away the pointer actually is (it has no distance cutoff, just picks the
  // nearest), which was the bug (#211 feedback round 4) behind "dragging a
  // room away from a folder doesn't clear the target" — the last folder the
  // pointer had been near stayed the closestCenter "winner" for the entire
  // rest of the drag, so it always got the drop regardless of where the
  // pointer was released. rectIntersection only matches when the dragged
  // item's rect actually overlaps a droppable's, so moving away from every
  // folder/breadcrumb correctly clears `over` back to nothing.
  const dndCollision: CollisionDetection = useCallback(args => {
    const hits = pointerWithin(args)
    return hits.length > 0 ? hits : rectIntersection(args)
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

  // (#343) Every failure below reports itself as a pushed notice, and the
  // `key` is what keeps a retried action from stacking copies of the same
  // sentence — a second failed delete replaces the first report rather than
  // adding to it.
  //
  // These are events, not state: nothing in the page implies "the delete
  // failed" once the request has settled, which is exactly the half of the
  // system that needs an id and a store. Contrast the two query failures
  // further down, which stay inline — a list that could not load has no
  // content to show, so its error belongs in the space the list would have
  // occupied, with the retry that fixes it.
  const notifyFailure = (message: string, key: string) => notifyError(message, { key })

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_, id) => updateRoomsEverywhere(rooms => rooms.filter(r => r.id !== id)),
    onError: () => notifyFailure(t('lessons.error.delete'), 'delete-room'),
  })
  const leaveMutation = useMutation({
    mutationFn: leaveRoom,
    onSuccess: (_, id) => updateRoomsEverywhere(rooms => rooms.filter(r => r.id !== id)),
    onError: () => notifyFailure(t('lessons.error.leave'), 'leave-room'),
  })
  const renameRoomMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameRoom(id, name),
    onSuccess: updated => updateRoomsEverywhere(rooms => rooms.map(r => r.id === updated.id ? updated : r)),
    onError: () => notifyFailure(t('lessons.error.renameRoom'), 'rename-room'),
  })
  // (#317) Lands the copy in the list rather than navigating into it: forking
  // is usually done to *hand out* a copy, and being dropped inside it would
  // make forking three of them a matter of going back twice.
  const forkMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => forkRoom(id, name),
    onSuccess: ({ room }) => updateRoomsInFolder(rooms => [room, ...rooms]),
    onError: () => notifyFailure(t('lessons.error.fork'), 'fork-room'),
  })
  // (#222) The room comes back with its new `closedAt`, so the card updates
  // from the server's answer rather than from an assumption about it.
  const closedMutation = useMutation({
    mutationFn: ({ id, closed }: { id: string; closed: boolean }) => setRoomClosed(id, closed),
    onSuccess: updated => updateRoomsEverywhere(rooms => rooms.map(r => r.id === updated.id ? updated : r)),
    onError: () => notifyFailure(t('lessons.error.close'), 'close-room'),
  })
  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: updated => updateFolders(folders => folders.map(f => f.id === updated.id ? updated : f)),
    onError: () => notifyFailure(t('lessons.error.renameFolder'), 'rename-folder'),
  })
  const moveRoomMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => moveRoomToFolder(id, folderId),
    onSuccess: (_, { id }) => updateRoomsInFolder(rooms => rooms.filter(r => r.id !== id)),
    onError: () => notifyFailure(t('lessons.error.moveRoom'), 'move-room'),
  })
  const moveFolderMutation = useMutation({
    mutationFn: ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) =>
      moveFolder(id, parentFolderId),
    onSuccess: updated => updateFolders(folders => folders.filter(f => f.id !== updated.id)),
    onError: (err) => {
      notifyFailure(t(
        err instanceof ApiError && err.code === 'cycle'
          ? 'lessons.error.moveFolderCycle'
          : 'lessons.error.moveFolder',
      ), 'move-folder')
    },
  })
  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: (_, id) => updateFolders(folders => folders.filter(f => f.id !== id)),
    onError: (err) => {
      notifyFailure(t(
        err instanceof ApiError && err.code === 'not_empty'
          ? 'lessons.error.folderNotEmpty'
          : 'lessons.error.deleteFolder',
      ), 'delete-folder')
    },
  })
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name, currentFolderId),
    onSuccess: folder => {
      updateFolders(folders => [folder, ...folders])
      setNewFolderOpen(false)
      setNewFolderName('')
    },
    onError: () => notifyFailure(t('lessons.error.createFolder'), 'create-folder'),
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
    pulseOnDetach(e.activatorEvent)
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

  // (#343) Only the two *query* failures are still rendered from state. Both
  // mean there is no list to show, so the message belongs where the list
  // would have been, together with the retry that resolves it — a strip that
  // floats over the page and then times out would leave an empty list behind
  // it with no explanation and no way to try again. The six mutation failures
  // that used to live here are pushed from their own `onError` instead.
  const loadError = loadFailed ? t('lessons.error.load') : null
  const searchError = searchFailed ? t('lessons.error.search') : null
  const isEmpty = data !== undefined && data.folders.length === 0 && data.rooms.length === 0
  const isSearchEmpty = searchData !== undefined && searchData.rooms.length === 0
  const confirmBusy = deleteMutation.isPending || leaveMutation.isPending

  function renderRoomCard(room: Room) {
    return (
      <RoomCard
        key={room.id}
        t={t}
        locale={locale}
        view={view}
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
        onMoveClick={() => setMoveTarget({ kind: 'room', id: room.id, parentFolderId: room.folderId ?? null })}
        onForkClick={() => forkMutation.mutate({ id: room.id, name: t('lessons.forkedName', { name: room.name }) })}
        onAccessClick={() => setAccessRoom({ id: room.id, name: room.name })}
        onToggleClosedClick={() => closedMutation.mutate({ id: room.id, closed: room.closedAt === undefined })}
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
      <AppHeader />

      <div className={styles.titleRow}>
        <div className={styles.searchRow}>
          <TextInput
            icon="search"
            type="search"
            placeholder={t('lessons.searchPlaceholder')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            aria-label={t('lessons.searchLabel')}
          />
        </div>
        <ViewToggle t={t} view={view} onChange={setView} />
        <Link
          className={styles.newRoomLink}
          to="/create"
          state={currentFolderId ? { folderId: currentFolderId } : undefined}
        >
          <Icon name="add" />
          {t('lessons.newRoom')}
        </Link>
      </div>

      {isSearching ? (
        <>
          {searchError && <ErrorState message={searchError} onRetry={() => refetchSearch()} />}
          <section className={styles.section}>
            {searchData === undefined ? (
              <div className={styles.empty}>{t('lessons.searching')}</div>
            ) : isSearchEmpty ? (
              <EmptyState icon="search_off" message={t('lessons.noMatches', { query: debouncedSearch })} />
            ) : (
              <div className={view === 'list' ? styles.list : styles.grid}>
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
          <nav className={styles.breadcrumbs} aria-label={t('lessons.breadcrumbLabel')}>
            <CrumbButton
              label={t('lessons.root')}
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
                  placeholder={t('lessons.folderNamePlaceholder')}
                  maxLength={50}
                />
                <button type="submit" className={styles.newFolderSubmit} disabled={createFolderMutation.isPending}>
                  {t('common.create')}
                </button>
                <button
                  type="button"
                  className={styles.newFolderCancel}
                  onClick={() => { setNewFolderOpen(false); setNewFolderName('') }}
                >
                  {t('common.cancel')}
                </button>
              </form>
            ) : (
              <button type="button" className={styles.newFolderButton} onClick={() => setNewFolderOpen(true)}>
                <Icon name="create_new_folder" />
                {t('lessons.newFolder')}
              </button>
            )}
          </div>

          {loadError && <ErrorState message={loadError} onRetry={() => refetch()} />}

          <section className={styles.section}>
            {data === undefined ? (
              <div className={styles.empty}>{t('common.loading')}</div>
            ) : isEmpty ? (
              <EmptyState
                icon="folder_open"
                message={t(path.length > 0 ? 'lessons.folderEmpty' : 'lessons.empty')}
              />
            ) : (
              <div className={view === 'list' ? styles.list : styles.grid}>
                {data.folders.map(folder => (
                  <FolderCard
                    key={folder.id}
                    t={t}
                    view={view}
                    folder={folder}
                    onOpen={() => openFolder({ id: folder.id, name: folder.name })}
                    renaming={renamingItem?.kind === 'folder' && renamingItem.id === folder.id}
                    renameText={renameText}
                    onRenameTextChange={setRenameText}
                    onRenameSubmit={submitRename}
                    onRenameCancel={() => setRenamingItem(null)}
                    onRenameClick={() => startRename({ kind: 'folder', id: folder.id }, folder.name)}
                    onMoveClick={() => setMoveTarget({ kind: 'folder', id: folder.id, parentFolderId: folder.parentFolderId })}
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

      {accessRoom && (
        <Modal
          title={`${t('access.title')} — ${accessRoom.name}`}
          size="md"
          onClose={() => setAccessRoom(null)}
        >
          <RoomAccessControl roomId={accessRoom.id} />
        </Modal>
      )}

      {moveTarget && (
        <MoveToDialog
          title={t(moveTarget.kind === 'room' ? 'lessons.moveRoomTitle' : 'lessons.moveFolderTitle')}
          currentParentId={moveTarget.parentFolderId}
          excludeFolderId={moveTarget.kind === 'folder' ? moveTarget.id : undefined}
          onCancel={() => setMoveTarget(null)}
          onSelect={handleMoveSelect}
        />
      )}
    </div>
  )
}
