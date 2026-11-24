/** Isolate the E2E environment-report IP quota for each simulated device.
 * This map exists only in the disposable Vite process, never in the backend. */
export function createE2eEnvironmentAddress(enabled: boolean) {
  const devices = new Map<string, number>()
  return (method: string | undefined, url: string | undefined, cookie: string | undefined): string | undefined => {
    if (!enabled || method !== 'POST' || url?.split('?')[0] !== '/api/me/environment') return
    const raw = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('al_dev='))?.slice(7)
    if (!raw || !/^[0-9a-f-]{36}$/.test(raw)) return
    let index = devices.get(raw)
    if (index === undefined) {
      index = devices.size
      if (index >= 131072) throw new Error('E2E device address range exhausted')
      devices.set(raw, index)
    }
    return `198.${18 + (index >> 16)}.${(index >> 8) & 255}.${index & 255}`
  }
}
