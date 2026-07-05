import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Room } from '@art-lessons/shared'
import { deleteRoom, listMyRooms, type MyRooms } from '../../lib/api'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import styles from './MyLessons.module.css'

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
  const [rooms, setRooms] = useState<MyRooms | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loggedIn = isLoggedIn(me)

  const load = useCallback(() => {
    listMyRooms().then(setRooms).catch(() => setLoadError('Could not load your rooms'))
  }, [])

  useEffect(() => {
    if (loggedIn) load()
  }, [loggedIn, load])

  if (authLoading) return null
  if (!loggedIn) return <Navigate to="/login" replace />

  function handleDelete(id: string) {
    setDeletingId(id)
    setConfirmingId(null)
    deleteRoom(id)
      .then(() => setRooms(prev => prev && { ...prev, owned: prev.owned.filter(r => r.id !== id) }))
      .catch(() => setLoadError('Could not delete the room'))
      .finally(() => setDeletingId(null))
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Art Lessons</div>
        <AccountNav />
      </header>

      <h1 className={styles.heading}>My Lessons</h1>

      {loadError && <div className={styles.error}>{loadError}</div>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Created by me</h2>
        {rooms === null ? (
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
                deleting={deletingId === room.id}
                onDeleteClick={() => confirmingId === room.id ? handleDelete(room.id) : setConfirmingId(room.id)}
                onCancelClick={() => setConfirmingId(null)}
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invited to</h2>
        {rooms === null ? (
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
