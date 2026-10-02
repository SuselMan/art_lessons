import type { Page, WebSocketRoute } from '@playwright/test'

/** (#690) Offline emulation does not reliably close an already-open WebSocket.
 * Cut the actual transport too, and refuse new sockets until the network is
 * restored. Without this the tests can pass while both people remain online. */
export async function interruptTransport(page: Page): Promise<{ cut(): Promise<void>; restore(): void }> {
  let offline = false
  const sockets = new Set<WebSocketRoute>()
  await page.routeWebSocket(/socket\.io/, ws => {
    if (offline) { void ws.close(); return }
    const server = ws.connectToServer()
    sockets.add(ws)
    ws.onClose(() => { sockets.delete(ws); void server.close() })
    server.onClose(() => { sockets.delete(ws); void ws.close() })
  })
  return {
    async cut() {
      offline = true
      await Promise.all([...sockets].map(ws => ws.close()))
      sockets.clear()
    },
    restore() { offline = false },
  }
}

