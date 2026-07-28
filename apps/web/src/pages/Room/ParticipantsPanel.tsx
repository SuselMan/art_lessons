import { memo } from 'react'
import clsx from 'clsx'
import type { Participant } from '@grafetto/shared'
import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import { Menu } from '../../components/Menu'
import styles from './ParticipantsPanel.module.css'

interface ParticipantsPanelProps {
  participants: Participant[]
  drawingIds: string[]
  /** The viewer's own userId — their row is labelled and never gets actions. */
  myUserId: string | null
  // (#254/#257/#259) Only the owner gets the per-participant actions — everyone
  // else still sees the same list and the same statuses, just without controls.
  isOwner: boolean
  onToggleFreeze?: (userId: string, frozen: boolean) => void
}

/** (#328) The participants tab of the right-hand SidePanel: one row per person
 *  in the room, their live status, and — for the owner — a "⋮" of moderation
 *  actions on each of them.
 *
 *  Replaces the row of colored dots that used to live in the top header
 *  (`ParticipantsBar`, #38). The dots carried the same three states, but a
 *  22px circle can only ever *hint* at them: the name lived in a tooltip a
 *  tablet has no way to show, and the freeze control was a 14px badge that
 *  appeared on hover — also not a thing on a tablet. They also grew the header
 *  without bound as a class filled up, which is exactly what #320 is
 *  unpicking.
 *
 *  Wrapped in memo for the same reason ParticipantsBar was (#127): Room
 *  re-renders on every pointermove while panning (#126), and none of these
 *  props change during one. */
export const ParticipantsPanel = memo(function ParticipantsPanel({
  participants, drawingIds, myUserId, isOwner, onToggleFreeze,
}: ParticipantsPanelProps) {
  const t = useT()

  if (!participants.length) {
    return <p className={styles.empty}>{t('room.participants.empty')}</p>
  }

  return (
    <ul className={styles.list}>
      {participants.map(p => {
        const drawing = drawingIds.includes(p.userId)
        const isSelf  = p.userId === myUserId
        // The owner can't be frozen server-side (rooms.ts's
        // setParticipantFrozen), so there is nothing to offer on their row —
        // including the viewer's own row when the viewer is the owner. The
        // room-wide freeze in the panel header is the owner's own control.
        const canModerate = isOwner && p.role !== 'owner' && !isSelf

        // Status caption. Frozen wins over drawing: a frozen participant whose
        // last cursor packet is still inside the drawing window would otherwise
        // read as "drawing" while the server is dropping everything they send.
        const status = p.frozen
          ? t('room.participant.frozen')
          : drawing
            ? t('room.participant.drawing')
            : t('room.participants.idle')
        const tags = p.role === 'owner' ? [t('room.participant.owner'), status] : [status]

        return (
          <li key={p.userId} className={styles.row}>
            <span
              className={clsx(
                styles.dot,
                drawing && !p.frozen && styles.dotDrawing,
                p.frozen && styles.dotFrozen,
              )}
              style={{ backgroundColor: p.color }}
              aria-hidden="true"
            >
              {p.frozen ? <Icon name="ac_unit" /> : p.name.slice(0, 1).toUpperCase()}
            </span>

            <span className={styles.identity}>
              <span className={styles.name} title={p.name}>
                {p.name}
                {isSelf && <span className={styles.selfTag}>{t('room.participants.you')}</span>}
              </span>
              {/* Joined rather than concatenated with a translated separator —
                  same reasoning as the old ParticipantsBar tooltip: a suffix
                  that carries its own punctuation is the kind of thing that
                  gets lost in translation. */}
              <span className={clsx(styles.status, p.frozen && styles.statusFrozen)}>
                {tags.join(' · ')}
              </span>
            </span>

            {canModerate && (
              <Menu
                triggerClassName={styles.rowMenuBtn}
                triggerLabel={t('common.moreActions')}
                trigger={<Icon name="more_vert" />}
                actions={[
                  {
                    label: t(p.frozen ? 'room.participants.unfreeze' : 'room.participants.freeze'),
                    onClick: () => onToggleFreeze?.(p.userId, !p.frozen),
                  },
                  // Room access control (block/kick — one action, see #226:
                  // the kick endpoint is what writes the RoomBlock) has no
                  // server side yet. Listed disabled rather than hidden so the
                  // moderation menu reads as a complete set from the start.
                  {
                    label: t('room.participants.ban'),
                    onClick: () => {},
                    danger: true,
                    disabled: true,
                    title: t('room.participants.banUnavailable'),
                  },
                ]}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
})

interface RoomActionsProps {
  isOwner: boolean
  roomFrozen: boolean
  onToggleRoomFrozen: () => void
}

/** (#328) Room-wide actions for the participants tab's header — currently just
 *  the freeze, moved out of the top header (#320: decide what belongs there,
 *  then move things, rather than adding one more button to it). It belongs
 *  next to the people it acts on: freezing is about the class, not about the
 *  canvas.
 *
 *  Non-owners get nothing here — the tab header is then just its title. */
export function ParticipantsRoomActions({ isOwner, roomFrozen, onToggleRoomFrozen }: RoomActionsProps) {
  const t = useT()
  if (!isOwner) return null
  return (
    <button
      type="button"
      className={clsx(styles.headerBtn, roomFrozen && styles.headerBtnActive)}
      onClick={onToggleRoomFrozen}
      title={t(roomFrozen ? 'room.unfreeze' : 'room.freeze')}
      aria-label={t(roomFrozen ? 'room.unfreezeShort' : 'room.freezeShort')}
      aria-pressed={roomFrozen}
    >
      <Icon name="ac_unit" />
    </button>
  )
}
