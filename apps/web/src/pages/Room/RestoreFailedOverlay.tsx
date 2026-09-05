import { RoomFailureOverlay } from './RoomFailureOverlay'

interface RestoreFailedOverlayProps {
  onRetry: () => void
}

/** (#533) Shown instead of the loading preloader when the room's stored pixels
 *  could not be fetched.
 *
 *  What this replaces is the worst outcome the editor had. On 2026-09-04 a
 *  teacher opened room cdf314dd-153 over a link busy with the video call the
 *  lesson was on; 26 of 28 snapshot blobs never finished transferring, the
 *  restore failed at the `blobs` stage having applied nothing, and the room
 *  opened anyway — preloader gone, pencil live, canvas blank, no message. Only
 *  the 69 operations the server had not counted as covered were replayed,
 *  because the rest of the history is deliberately withheld once a snapshot
 *  claims it. He sat in front of an empty lesson for twenty minutes and the
 *  class was taught over a screen share instead.
 *
 *  A room whose pixels did not arrive is not a room that opened. Saying
 *  otherwise is not a smaller failure than saying nothing — it is a confident
 *  false statement about someone's work, and the reader's only clue that it is
 *  false is that their own drawing is missing.
 *
 *  No `retrying` state: unlike the paper retry, this one hands straight off to
 *  a full resync and the loading overlay takes over on the next render, so a
 *  disabled button would be a frame of nothing. If that resync fails the same
 *  way, this screen comes back. */
export function RestoreFailedOverlay({ onRetry }: RestoreFailedOverlayProps): React.JSX.Element {
  return (
    <RoomFailureOverlay
      icon="cloud_off"
      titleKey="room.restoreFailed.title"
      bodyKey="room.restoreFailed.body"
      retryKey="room.restoreFailed.retry"
      onRetry={onRetry}
    />
  )
}
