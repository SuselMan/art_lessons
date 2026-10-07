/** Explicit DEV-only load experiment; production and ordinary URLs retain the old replay. */
export function clearPrefixElisionRequested(dev: boolean, search: string): boolean {
  return dev && new URLSearchParams(search).get('qaClearPrefixElision') === '1'
}

/** Session URL canonicalisation may remove QA query parameters before restore.
 * Keep this DEV experiment fixed for one room identity, never across rooms. */
export function captureClearPrefixElision(
  previous: { roomId: string | undefined; enabled: boolean } | null,
  roomId: string | undefined, dev: boolean, search: string,
): { roomId: string | undefined; enabled: boolean } {
  return previous?.roomId === roomId && previous !== null
    ? previous : { roomId, enabled: clearPrefixElisionRequested(dev, search) }
}
