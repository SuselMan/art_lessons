import { memo } from 'react'
import clsx from 'clsx'
import type { Participant, RoomJoinRequest } from '@grafetto/shared'
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
  /** (#380) People asking to be let in, above the list of people already in.
   *  Only ever non-empty for the owner — see useJoinQueue. */
  joinRequests?: RoomJoinRequest[]
  /** Which request's answer is in flight; that row's buttons go quiet. */
  resolvingRequestId?: string | null
  onResolveJoinRequest?: (requestId: string, approved: boolean) => void
}

interface JoinQueueSectionProps {
  requests: RoomJoinRequest[]
  resolvingId: string | null
  onResolve?: (requestId: string, approved: boolean) => void
}

/** (#380) "Waiting to join", above the participants list.
 *
 *  Exists because the queue was only visible from the access panel, which is
 *  two clicks into settings and therefore somewhere a teacher mid-lesson never
 *  looks — a student five minutes late was knocking on a door nobody could
 *  hear. This is the same queue and the same two endpoints as
 *  `RoomAccessControl`; nothing else about access control is duplicated here,
 *  because nothing else about it needs an answer *now*.
 *
 *  Not rendered at all when nobody is waiting: an empty box explaining its own
 *  emptiness is exactly what the access panel is for. */
function JoinQueueSection({ requests, resolvingId, onResolve }: JoinQueueSectionProps) {
  const t = useT()

  return (
    <section className={styles.queue}>
      <h3 className={styles.queueHeading}>
        {t('room.joinQueue.heading')}
        <span className={styles.queueCount}>{requests.length}</span>
      </h3>
      <ul className={styles.queueList}>
        {requests.map(request => {
          const busy = resolvingId === request.id
          return (
            <li key={request.id} className={styles.queueRow}>
              <span className={styles.queueIdentity}>
                <span className={styles.name} title={request.name}>{request.name}</span>
                {/* The address they are asking with — the difference between
                    recognizing a student and guessing, same as in the access
                    panel's own queue. */}
                {request.email && (
                  <span className={styles.queueEmail} title={request.email}>{request.email}</span>
                )}
              </span>
              {/* Buttons on their own row rather than beside the name: the
                  panel's content column is 256px wide, and two 40px-tall touch
                  targets plus an ellipsised name in one line leaves the name
                  about four characters. */}
              <div className={styles.queueActions}>
                <button
                  type="button"
                  className={styles.approveBtn}
                  disabled={busy}
                  onClick={() => onResolve?.(request.id, true)}
                >
                  <Icon name="check" />
                  {t('access.approve')}
                </button>
                <button
                  type="button"
                  className={styles.denyBtn}
                  disabled={busy}
                  onClick={() => onResolve?.(request.id, false)}
                >
                  <Icon name="close" />
                  {t('access.deny')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
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
  joinRequests, resolvingRequestId = null, onResolveJoinRequest,
}: ParticipantsPanelProps) {
  const t = useT()

  // (#380) Owner-only twice over: the queue only ever arrives non-empty for
  // the owner (the endpoint that fills it is 403 for everyone else), and this
  // re-states it so a future caller passing the prop unconditionally can't
  // show a student who else is knocking.
  const queue = isOwner ? joinRequests ?? [] : []

  // Deliberately not an early return the way the empty list used to be: with
  // nobody in the room yet but someone waiting at the door, the door is the
  // part that matters.
  return (
    <>
      {queue.length > 0 && (
        <JoinQueueSection
          requests={queue}
          resolvingId={resolvingRequestId}
          onResolve={onResolveJoinRequest}
        />
      )}

      {participants.length === 0 ? (
        <p className={styles.empty}>{t('room.participants.empty')}</p>
      ) : (
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
      )}
    </>
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
