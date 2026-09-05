import { RoomFailureOverlay } from './RoomFailureOverlay'

interface PaperFailedOverlayProps {
  /** A retry is in flight — the button stays put and goes un-clickable rather
   *  than the overlay flipping back to the spinner and returning here. */
  retrying: boolean
  onRetry: () => void
}

/** (#346) Shown instead of the loading preloader once the paper texture has
 *  failed to load.
 *
 *  Without that texture the engine cannot draw at all: `_paperTexLoaded` stays
 *  false and every pointer-down is dropped on the floor (see engine's
 *  `_onStart`). Until this existed the room opened anyway and simply did not
 *  respond to the pencil, with the actual error — which names the file, the
 *  status and the fix — going nowhere but an unhandled rejection in the
 *  console. An open room that ignores the stylus is the worst of the available
 *  lies: it looks like the app working and behaves like the app broken.
 *
 *  So the room deliberately stays *unopened* here rather than opening with a
 *  toast over it. That is not only honesty about drawing — the replay that
 *  restores this room's content is downstream of the same await, so a room
 *  opened in this state would also be showing an empty canvas for a room that
 *  is not empty. (#533) That second half turned out to be a screen of its own:
 *  see RestoreFailedOverlay.
 *
 *  The screen itself is RoomFailureOverlay, shared with that one. */
export function PaperFailedOverlay({ retrying, onRetry }: PaperFailedOverlayProps): React.JSX.Element {
  return (
    <RoomFailureOverlay
      icon="image_not_supported"
      titleKey="room.paperFailed.title"
      bodyKey="room.paperFailed.body"
      retryKey="room.paperFailed.retry"
      retryingKey="room.paperFailed.retrying"
      retrying={retrying}
      onRetry={onRetry}
    />
  )
}
