/** Isolated iframe realm: reuses the editor renderer without seating a second
 * participant, editing, local outbox recovery or publishing snapshots. */
export function observerLessonId(): string | null {
  return typeof window !== 'undefined' && window.parent !== window
    ? new URLSearchParams(window.location.search).get('observe') : null
}
export const isBoardObserver = (): boolean => observerLessonId() !== null
