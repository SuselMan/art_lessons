import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { CLIENT_UPDATE_REQUIRED, DRAWING_PROTOCOL_HEADER, DRAWING_PROTOCOL_VERSION } from '@grafetto/shared'
import { registerDrawingProtocolGate } from './drawingProtocol.js'

describe('whole-renderer HTTP compatibility barrier', () => {
  it('refuses old independent restore/upload before handlers and varies immutable bytes', async () => {
    const app = Fastify()
    let reads = 0
    app.addHook('onRequest', async (_request, reply) => { reply.header('Vary', 'Origin') })
    registerDrawingProtocolGate(app, true)
    for (const url of ['/api/rooms/:id/snapshots/index', '/api/rooms/:id/snapshots/:layer/:seq', '/api/rooms/:id/operations']) {
      app.get(url, async () => { reads++; return { ok: true } })
    }
    app.post('/api/rooms/:id/snapshots', async () => { reads++; return { ok: true } })
    app.get('/api/rooms/:id/thumbnail', async () => 'bitmap')
    try {
      for (const url of ['/api/rooms/r/snapshots/index', '/api/rooms/r/snapshots/layer/1?x=2', '/api/rooms/r/operations', '/api/rooms/r/%73napshots/index', '/api/rooms/r/%6fperations']) {
        for (const revision of [undefined, '2', '4', '3, 2']) {
          const result = await app.inject({ method: 'GET', url, headers: revision ? { [DRAWING_PROTOCOL_HEADER]: revision } : {} })
          expect(result.statusCode).toBe(426)
          expect(result.json()).toEqual({ error: CLIENT_UPDATE_REQUIRED })
        }
      }
      for (const url of ['/api/rooms/r/snapshots', '/api/rooms/r/%73napshots']) {
        const upload = await app.inject({ method: 'POST', url, payload: { seq: 1 } })
        expect(upload.statusCode).toBe(426)
      }
      expect(reads).toBe(0)
      const admitted = await app.inject({ method: 'GET', url: '/api/rooms/r/snapshots/layer/1', headers: { [DRAWING_PROTOCOL_HEADER]: DRAWING_PROTOCOL_VERSION } })
      expect(admitted.statusCode).toBe(200)
      expect(admitted.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)
      expect(admitted.headers.vary).toContain('Origin')
      expect(reads).toBe(1)
      expect((await app.inject('/api/rooms/r/thumbnail')).statusCode).toBe(200)
    } finally { await app.close() }
  })
  it('keeps old clients admitted when the captured source policy is OFF', async () => {
    const app = Fastify()
    registerDrawingProtocolGate(app, false)
    app.get('/api/rooms/:id/operations', async () => ({ ok: true }))
    try { expect((await app.inject('/api/rooms/r/operations')).statusCode).toBe(200) }
    finally { await app.close() }
  })
})
