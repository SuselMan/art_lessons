import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import type { Room } from '@art-lessons/shared'
import { deleteRoom, listMyRooms, type MyRooms } from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import styles from './MyLessons.module.css'

const ROOMS_QUERY_KEY = ['rooms', 'mine'] as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface RoomCardProps {
  room: Room
  confirming: boolean
  deleting: boolean
  onDeleteClick?: () => void
  onCancelClick?: () => void
}

function RoomCard({ room, confirming, deleting, onDeleteClick, onCancelClick }: RoomCardProps) {
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
          <span className={styles.paper}>{room.paper}</span>
        </div>
      </Link>
      {onDeleteClick && (
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

export function MyLessons() {
  const { me, loading: authLoading } = useAuth()
  const loggedIn = isLoggedIn(me)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { data: rooms, isError: loadFailed } = useQuery({
    queryKey: ROOMS_QUERY_KEY, queryFn: listMyRooms, enabled: loggedIn,
  })
  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_, id) => {
      queryClient.setQueryData<MyRooms | undefined>(
        ROOMS_QUERY_KEY, prev => prev && { ...prev, owned: prev.owned.filter(r => r.id !== id) },
      )
    },
  })

  if (authLoading) return null
  if (!loggedIn) return <Navigate to="/login" replace />

  function handleDelete(id: string) {
    setConfirmingId(null)
    deleteMutation.mutate(id)
  }

  const loadError = loadFailed ? 'Could not load your rooms' : null
  const deleteError = deleteMutation.isError ? 'Could not delete the room' : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Art Lessons</div>
        <AccountNav />
      </header>

      <h1 className={styles.heading}>My Lessons</h1>

      {(loadError || deleteError) && <div className={styles.error}>{loadError ?? deleteError}</div>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Created by me</h2>
        {rooms === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : rooms.owned.length === 0 ? (
          <div className={styles.empty}>You haven't created any rooms yet.</div>
        ) : (
          <div className={styles.grid}>
            {rooms.owned.map(room => (
              <RoomCard
                key={room.id}
                room={room}
                confirming={confirmingId === room.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === room.id}
                onDeleteClick={() => confirmingId === room.id ? handleDelete(room.id) : setConfirmingId(room.id)}
                onCancelClick={() => setConfirmingId(null)}
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invited to</h2>
        {rooms === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : rooms.participated.length === 0 ? (
          <div className={styles.empty}>No rooms you've joined yet.</div>
        ) : (
          <div className={styles.grid}>
            {rooms.participated.map(room => (
              <RoomCard key={room.id} room={room} confirming={false} deleting={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
