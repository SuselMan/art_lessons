import clsx from 'clsx'
import styles from './Room.module.css'

// Shown instead of the canvas when this browser opened a room link directly
// (no creator navigation state — see Room/index.tsx) and hasn't joined yet.
// Visual language mirrors CreateRoom's card/input/error patterns rather than
// inventing new styles.

interface JoinGateProps {
  roomName: string | null
  name: string
  onNameChange: (name: string) => void
  password: string
  onPasswordChange: (password: string) => void
  error: string | null
  submitting: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function JoinGate({
  roomName, name, onNameChange, password, onPasswordChange, error, submitting, onSubmit,
}: JoinGateProps) {
  return (
    <div className={styles.gatePage}>
      <div className={styles.gateLogo}>Art Lessons</div>

      <form className={styles.gateCard} onSubmit={onSubmit} noValidate>
        <h1 className={styles.gateHeading}>{roomName ? `Join "${roomName}"` : 'Join room'}</h1>

        <div className={styles.gateSection}>
          <div className={styles.gateLabel}>Your name</div>
          <input
            className={clsx(styles.gateInput, error && !name.trim() && styles.gateInputError)}
            type="text"
            placeholder="e.g. Alex"
            maxLength={40}
            autoFocus
            value={name}
            onChange={e => onNameChange(e.target.value)}
          />
        </div>

        <div className={styles.gateSection}>
          <div className={styles.gateLabel}>Password (if the room has one)</div>
          <input
            className={styles.gateInput}
            type="password"
            placeholder="Leave blank if none"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <div className={styles.gateError}>{error}</div>}

        <button type="submit" className={styles.gateSubmit} disabled={submitting}>
          {submitting ? 'Joining…' : 'Join room'}
        </button>
      </form>
    </div>
  )
}
