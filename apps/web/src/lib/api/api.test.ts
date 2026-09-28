import { afterEach, describe, expect, it, vi } from 'vitest'

const noteBanned = vi.hoisted(() => vi.fn())
vi.mock('./banned', () => ({ BANNED_ERROR_CODE: 'banned', noteBanned }))

const { api, ApiError, apiPath } = await import('./api')

/** (#623) The client end of the route table: what a key turns into on the
 *  wire, and what comes back. */

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch; noteBanned.mockReset() })

function respond(status: number, body?: unknown) {
  global.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

describe('api()', () => {
  it('sends the route’s method, filled path and JSON body, and returns the body', async () => {
    respond(200, { closedAt: '2026-09-28T00:00:00.000Z' })
    const room = await api('PATCH /api/rooms/:id/closed', { params: { id: 'r 1' }, body: { closed: true } })
    expect(room).toEqual({ closedAt: '2026-09-28T00:00:00.000Z' })
    expect(global.fetch).toHaveBeenCalledWith('/api/rooms/r%201/closed', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed: true }),
    })
  })

  // Fastify refuses a bodyless request that still claims JSON.
  it('sends no Content-Type and no body for a route without one', async () => {
    respond(200, { userId: 'u', email: null, name: null })
    await api('POST /api/auth/logout')
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST', credentials: 'include' })
  })

  it('reads a 204 as null on a route that may answer it', async () => {
    respond(204)
    expect(await api('GET /api/rooms/:roomId/snapshots/index', { params: { roomId: 'r' } })).toBeNull()
  })

  it('throws ApiError with the code and the retry hint', async () => {
    respond(429, { error: 'code_cooldown', retryAfterSeconds: 30 })
    const error = await api('POST /api/auth/code/request', { body: { email: 'a@b.c' } }).catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, code: 'code_cooldown', retryAfterSeconds: 30 })
  })

  // (#587) Whichever request hears it first tells the whole app.
  it('tells the app when a request is refused for a ban', async () => {
    respond(403, { error: 'banned' })
    await api('GET /api/me').catch(() => {})
    expect(noteBanned).toHaveBeenCalledOnce()
  })
})

describe('apiPath()', () => {
  it('builds the URL of a binary route for an <img src>', () => {
    expect(apiPath('GET /api/rooms/:roomId/thumbnail', { params: { roomId: 'b1' }, query: { v: '2026-09-28T10:00' } }))
      .toBe('/api/rooms/b1/thumbnail?v=2026-09-28T10%3A00')
  })
})
