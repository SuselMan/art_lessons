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
        for (const revision of [undefined, '2', '9', '3, 2']) {
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

it('requires known4/5/6/7 on read4 binary GET/encoded upload BEFORE handlers and preserves Vary',async()=>{
 const app=Fastify();let reached=0;app.addHook('onRequest',async(_q,r)=>{r.header('Vary','Origin')});registerDrawingProtocolGate(app,'4')
 app.get('/api/rooms/:id/snapshots/:layer/:seq',async()=>{reached++;return Buffer.from([1,2,3])});app.post('/api/rooms/:id/snapshots',async()=>{reached++;return{ok:true}});app.get('/api/rooms/:id/operations',async()=>{reached++;return[]})
 try{
  for(const revision of [undefined,'2','3','9','04','4, 3'])for(const url of ['/api/rooms/r/snapshots/l/1','/api/rooms/r/%73napshots/l/1','/api/rooms/r/operations'])expect((await app.inject({url,headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{}})).statusCode).toBe(426)
  expect(reached).toBe(0)
  expect((await app.inject({method:'POST',url:'/api/rooms/r/%73napshots',headers:{[DRAWING_PROTOCOL_HEADER]:'3'},payload:{}})).statusCode).toBe(426);expect(reached).toBe(0)
  for(const revision of ['4','5','6','7']){const accepted=await app.inject({url:'/api/rooms/r/snapshots/l/1',headers:{[DRAWING_PROTOCOL_HEADER]:revision}});expect(accepted.statusCode).toBe(200);expect(accepted.headers.vary).toContain('Origin');expect(accepted.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)}
 }finally{await app.close()}
})
it('accepts known3/4/5/6/7 on an image3-only captured minimum3',async()=>{
 const app=Fastify();registerDrawingProtocolGate(app,'3');app.get('/api/rooms/:id/operations',async()=>[])
 try{for(const revision of ['3','4','5','6','7'])expect((await app.inject({url:'/api/rooms/r/operations',headers:{[DRAWING_PROTOCOL_HEADER]:revision}})).statusCode).toBe(200)}finally{await app.close()}
})


it('requires known literal6/7 at captured minimum6 before HTTP handler access',async()=>{
 const app=Fastify();let reached=0;registerDrawingProtocolGate(app,'6');app.get('/api/rooms/:id/operations',async()=>{reached++;return[]})
 try{for(const revision of[undefined,'3','4','5','9','06','6, 5']){const r=await app.inject({url:'/api/rooms/r/%6fperations',headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{}});expect(r.statusCode).toBe(426);expect(reached).toBe(0)}for(const revision of ['6','7'])expect((await app.inject({url:'/api/rooms/r/operations',headers:{[DRAWING_PROTOCOL_HEADER]:revision}})).statusCode).toBe(200);expect(reached).toBe(2)}finally{await app.close()}
})


it('requires literal7 minimum before HTTP identity/cold handlers and preserves encoded aliases/Vary',async()=>{
 const app=Fastify();let identities=0,loads=0
 app.addHook('onRequest',async(_q,r)=>{r.header('Vary','Origin')});registerDrawingProtocolGate(app,'7');app.addHook('preHandler',async()=>{identities++})
 app.get('/api/rooms/:id/snapshots/index',async()=>{loads++;return{snapshots:[]}});app.get('/api/rooms/:id/snapshots/:layer/:seq',async()=>{loads++;return Buffer.from([1,2,3])});app.get('/api/rooms/:id/operations',async()=>{loads++;return[]});app.post('/api/rooms/:id/snapshots',async()=>{loads++;return{ok:true}})
 try{
  const cold=['/api/rooms/r/snapshots/index','/api/rooms/r/%73napshots/index','/api/rooms/r/snapshots/l/1','/api/rooms/r/%73napshots/l/1','/api/rooms/r/operations','/api/rooms/r/%6fperations']
  for(const revision of[undefined,'3','4','5','6','9','07','7, 6'])for(const url of cold){
   const response=await app.inject({url,headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{}});expect(response.statusCode).toBe(426);expect(response.json()).toEqual({error:CLIENT_UPDATE_REQUIRED});expect(response.headers.vary).toContain('Origin');expect(response.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)
  }
  for(const url of['/api/rooms/r/snapshots','/api/rooms/r/%73napshots'])expect((await app.inject({method:'POST',url,headers:{[DRAWING_PROTOCOL_HEADER]:'6'},payload:{}})).statusCode).toBe(426)
  expect(identities).toBe(0);expect(loads).toBe(0)
  for(const url of cold){const response=await app.inject({url,headers:{[DRAWING_PROTOCOL_HEADER]:'7'}});expect(response.statusCode).toBe(200);expect(response.headers.vary).toContain('Origin');expect(response.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)}
  expect(identities).toBe(cold.length);expect(loads).toBe(cold.length)
 }finally{await app.close()}
})


it('requires literal8 before HTTP identity/read/upload on normal and encoded routes',async()=>{
 const app=Fastify();let identities=0,accesses=0
 app.addHook('onRequest',async(_q,r)=>{r.header('Vary','Origin')});registerDrawingProtocolGate(app,'8');app.addHook('preHandler',async()=>{identities++})
 app.get('/api/rooms/:id/operations',async()=>{accesses++;return[]});app.get('/api/rooms/:id/snapshots/:layer/:seq',async()=>{accesses++;return Buffer.from([1])});app.post('/api/rooms/:id/snapshots',async()=>{accesses++;return{ok:true}})
 app.get('/api/rooms/:id/thumbnail',async()=> 'bitmap')
 try{
  const reads=['/api/rooms/r/operations','/api/rooms/r/%6fperations','/api/rooms/r/snapshots/l/1','/api/rooms/r/%73napshots/l/1']
  for(const revision of[undefined,'2','3','4','5','6','7','9','8.0','08','8, 7']){
   for(const url of reads){const r=await app.inject({url,headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{}});expect(r.statusCode).toBe(426);expect(r.json()).toEqual({error:CLIENT_UPDATE_REQUIRED});expect(r.headers.vary).toContain('Origin');expect(r.headers.vary).toContain(DRAWING_PROTOCOL_HEADER)}
   for(const url of ['/api/rooms/r/snapshots','/api/rooms/r/%73napshots'])expect((await app.inject({method:'POST',url,headers:revision?{[DRAWING_PROTOCOL_HEADER]:revision}:{},payload:{}})).statusCode).toBe(426)
  }
  expect(identities).toBe(0);expect(accesses).toBe(0)
  for(const url of reads)expect((await app.inject({url,headers:{[DRAWING_PROTOCOL_HEADER]:'8'}})).statusCode).toBe(200)
  expect(accesses).toBe(reads.length);expect(identities).toBe(reads.length)
  expect((await app.inject('/api/rooms/r/thumbnail')).statusCode).toBe(200)
 }finally{await app.close()}
})
