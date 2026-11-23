import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { Server } from 'socket.io'
import { io as clientIo } from 'socket.io-client'
import { once } from 'node:events'
import { QaActivityGate, tryRunQaActivity } from './qaActivityGate.js'

describe('QA gate with a real Socket.IO transport', () => {
  it('excludes a collection while an async join is running and rejects joins during collection', async () => {
    const app = Fastify(), gate = new QaActivityGate(), io = new Server(app.server)
    let started!: () => void, finish!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const pending = new Promise<void>(resolve => { finish = resolve })
    io.on('connection', socket => {
      socket.on('test_join', (ack: (ok: boolean) => void) => {
        const result = tryRunQaActivity(gate, async () => { started(); await pending })
        if (!result.admitted) { ack(false); return }
        void result.result.then(() => ack(true))
      })
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw Error('missing test port')
    const client = clientIo(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] })
    try {
      await once(client, 'connect')
      const joining = client.timeout(3000).emitWithAck('test_join')
      await didStart
      expect(gate.tryStartCollection()).toBeUndefined()
      finish()
      expect(await joining).toBe(true)
      const end = gate.tryStartCollection()!
      expect(end).toBeDefined()
      expect(await client.timeout(3000).emitWithAck('test_join')).toBe(false)
      end()
    } finally {
      finish()
      client.disconnect()
      await new Promise<void>(resolve => io.close(() => resolve()))
      await app.close()
    }
  })
})
