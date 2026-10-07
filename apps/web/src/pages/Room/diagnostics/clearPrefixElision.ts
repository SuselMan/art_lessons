/** Explicit DEV-only load experiment; production and ordinary URLs retain the old replay. */
export function clearPrefixElisionRequested(dev: boolean, search: string): boolean {
  return dev && new URLSearchParams(search).get('qaClearPrefixElision') === '1'
}
