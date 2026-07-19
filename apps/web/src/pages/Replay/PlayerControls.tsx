import { useRef, useState } from 'react'
import clsx from 'clsx'

import { Icon } from '../../components/Icon'
import { SPEED_OPTIONS, formatDuration, type Speed } from './playback'
import styles from './PlayerControls.module.css'

interface PlayerControlsProps {
  playing: boolean
  onPlay: () => void
  onPause: () => void
  elapsedMs: number
  durationMs: number
  speed: Speed
  onSpeedChange: (speed: Speed) => void
  // `resume`: whether playback was running when the drag started, so
  // releasing the scrubber can pick back up where pausing-to-drag left off.
  onSeekCommit: (targetMs: number, resume: boolean) => void
  disabled: boolean
}

/** Touch-friendly play/pause + scrubber + speed controls for the lesson
 *  replay player (#108). The scrubber only *previews* locally while
 *  dragging (`dragValue`) — committing (which tears down and rebuilds the
 *  whole engine, see index.tsx's rebuildEngine) happens once, on release,
 *  not on every intermediate drag tick, so dragging across a long lesson's
 *  timeline doesn't thrash the GPU with dozens of full replays per second. */
export function PlayerControls({
  playing, onPlay, onPause, elapsedMs, durationMs, speed, onSpeedChange, onSeekCommit, disabled,
}: PlayerControlsProps): React.JSX.Element {
  const [dragValue, setDragValue] = useState<number | null>(null)
  const wasPlayingRef = useRef(false)
  const displayMs = dragValue ?? elapsedMs

  const handleDragStart = () => {
    wasPlayingRef.current = playing
    if (playing) onPause()
  }

  const commitDrag = () => {
    if (dragValue === null) return
    onSeekCommit(dragValue, wasPlayingRef.current)
    setDragValue(null)
  }

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.playButton}
        onClick={playing ? onPause : onPlay}
        disabled={disabled}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <Icon name={playing ? 'pause' : 'play_arrow'} />
      </button>

      <span className={styles.time}>{formatDuration(displayMs)}</span>

      <input
        type="range"
        className={styles.scrubber}
        min={0}
        max={Math.max(durationMs, 1)}
        step={1}
        value={displayMs}
        disabled={disabled}
        aria-label="Lesson timeline"
        onPointerDown={handleDragStart}
        onChange={e => setDragValue(Number(e.target.value))}
        onPointerUp={commitDrag}
        onKeyUp={commitDrag}
      />

      <span className={styles.time}>{formatDuration(durationMs)}</span>

      <div className={styles.speedGroup} role="group" aria-label="Playback speed">
        {SPEED_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            className={clsx(styles.speedButton, option === speed && styles.speedButtonActive)}
            onClick={() => onSpeedChange(option)}
            disabled={disabled}
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  )
}
