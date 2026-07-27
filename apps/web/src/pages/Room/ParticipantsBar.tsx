import { memo } from 'react'
import clsx from 'clsx'
import type { Participant } from '@grafetto/shared'
import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import styles from './Room.module.css'

interface ParticipantsBarProps {
  participants: Participant[]
  drawingIds: string[]
  connected: boolean
  // (#254/#257/#259) Only the owner gets the freeze action on each dot —
  // everyone else still sees the frozen indicator (participantDotFrozen
  // below), just without the control to change it.
  isOwner: boolean
  onToggleFreeze?: (userId: string, frozen: boolean) => void
}

/** Toolbar-area participants list (#38): one dot per participant, initial
 *  letter, colored by their `color`; a dot pulses while its owner is
 *  currently drawing (see `drawingIndicator.ts` for how that's inferred).
 *  (#254/#259) Also carries a per-participant freeze indicator/action —
 *  frozen dots dim and get a snowflake badge; the room owner additionally
 *  gets a small freeze/unfreeze button on every non-owner dot (never on
 *  their own, and never on another owner — there is only ever one, but the
 *  guard stays explicit rather than assuming that). Wrapped in memo (#127):
 *  Room re-renders far more often than these props actually change (e.g.
 *  every pointermove while panning, #126) — so this skips re-rendering
 *  unless participants/drawingIds/connected/isOwner themselves changed
 *  (onToggleFreeze is a useCallback in Room/index.tsx, stable across those
 *  re-renders). */
export const ParticipantsBar = memo(function ParticipantsBar({
  participants, drawingIds, connected, isOwner, onToggleFreeze,
}: ParticipantsBarProps) {
  const t = useT()
  if (!participants.length) return null
  return (
    <div className={styles.participantsBar}>
      {!connected && <span className={styles.connectionDot} title={t('room.reconnecting')} />}
      {participants.map(p => {
        const drawing = drawingIds.includes(p.userId)
        const canFreeze = isOwner && p.role !== 'owner'
        // Built by joining parts rather than concatenating suffix strings —
        // a translated suffix would have to carry its own leading separator,
        // which is exactly the kind of thing that gets lost in translation.
        const tags = [
          ...(p.role === 'owner' ? [t('room.participant.owner')] : []),
          ...(drawing ? [t('room.participant.drawing')] : []),
          ...(p.frozen ? [t('room.participant.frozen')] : []),
        ]
        return (
          <div key={p.userId} className={styles.participantDotWrap}>
            <div
              className={clsx(
                styles.participantDot,
                drawing && styles.participantDotDrawing,
                p.frozen && styles.participantDotFrozen,
              )}
              style={{ backgroundColor: p.color }}
              title={[p.name, ...tags].join(' — ')}
            >
              {p.frozen ? <Icon name="ac_unit" /> : p.name.slice(0, 1).toUpperCase()}
            </div>
            {canFreeze && (
              <button
                type="button"
                className={styles.participantFreezeBtn}
                onClick={() => onToggleFreeze?.(p.userId, !p.frozen)}
                title={t(p.frozen ? 'room.participant.unfreeze' : 'room.participant.freeze', { name: p.name })}
                aria-label={t(p.frozen ? 'room.participant.unfreeze' : 'room.participant.freeze', { name: p.name })}
              >
                <Icon name="ac_unit" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
})
