/** The common Grafetto engine writes its original premultiplied storage.
 * Missing historical metadata means that same format. Archived experimental
 * boards must never be read or snapshotted as if they contained these pixels. */
export function supportsRoomStorage(version: unknown): boolean {
  return version === undefined || version === 'legacy-pm8-v1'
}
