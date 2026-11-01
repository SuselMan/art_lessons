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
        for (const revision of [undefined, '2', '6', '3, 2']) {
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

it('requires known4/5 on read4 binary GET/encoded upload BEFORE handlers and preserves Vary',async()=>{
 const app=Fastify();let reached=0;app.addHook('onRequest',async(_q,r)=>{r.header('Vary','Origin')});registerDrawingProtocolGate(app,'4')
 app.get('/api/rooms/:id/snapshots/:layer/:seq',async()=>{reached++;return Buffer.from([1,2,3])});app.post('/api/rooms/:id/snapshots',async()=>{reached++;return{ok:true}});app.get('/api/rooms/:id/operations',async()=>{reached++;return[]})
 try{
  for(const revision of [undefined,'2','3','6','04','4, 3'])for(const url of ['/api/rooms/r/snapshots/l/1','/api/rooms/r/%73napshots/l/1','/api/rooms/r/operations'])expect((await app.inject({url,headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{}})).statusCode).toBe(426)
  expect(reached).toBe(0)
  expect((await app.inject({method:'POST',url:'/api/rooms/r/%73napshots',headers:{[DRAWING_PROTOCOL_HEADER]:'3'},payload:{}})).statusCode).toBe(426);expect(reached).toBe(0)
  for(const revision of ['4','5']){const accepted=await app.inject({url:'/api/rooms/r/snapshots/l/1',headers:{[DRAWING_PROTOCOL_HEADER]:revision}});expect(accepted.statusCode).toBe(200);expect(accepted.headers.vary).toContain('Origin');expect(accepted.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)}
 }finally{await app.close()}
})
it('accepts known3/4/5 on an image3-only captured minimum3',async()=>{
 const app=Fastify();registerDrawingProtocolGate(app,'3');app.get('/api/rooms/:id/operations',async()=>[])
 try{for(const revision of ['3','4','5'])expect((await app.inject({url:'/api/rooms/r/operations',headers:{[DRAWING_PROTOCOL_HEADER]:revision}})).statusCode).toBe(200)}finally{await app.close()}
})
