import { memo } from 'react'
import clsx from 'clsx'
import type { Participant } from '@art-lessons/shared'
import styles from './Room.module.css'

interface ParticipantsBarProps {
  participants: Participant[]
  drawingIds: string[]
  connected: boolean
}

/** Toolbar-area participants list (#38): one dot per participant, initial
 *  letter, colored by their `color`; a dot pulses while its owner is
 *  currently drawing (see `drawingIndicator.ts` for how that's inferred).
 *  Wrapped in memo (#127): all three props are plain data (no callbacks) —
 *  Room re-renders far more often than these actually change (e.g. every
 *  pointermove while panning, #126) — so this skips re-rendering unless
 *  participants/drawingIds/connected themselves changed. */
export const ParticipantsBar = memo(function ParticipantsBar({ participants, drawingIds, connected }: ParticipantsBarProps) {
  if (!participants.length) return null
  return (
    <div className={styles.participantsBar}>
      {!connected && <span className={styles.connectionDot} title="Reconnecting…" />}
      {participants.map(p => {
        const drawing = drawingIds.includes(p.userId)
        return (
          <div
            key={p.userId}
            className={clsx(styles.participantDot, drawing && styles.participantDotDrawing)}
            style={{ backgroundColor: p.color }}
            title={`${p.name}${p.role === 'teacher' ? ' — teacher' : ''}${drawing ? ' — drawing' : ''}`}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        )
      })}
    </div>
  )
})
