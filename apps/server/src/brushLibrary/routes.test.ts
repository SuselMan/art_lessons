import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerBrushLibraryRoutes } from './routes.js'
import { mayReadBoardContent } from '../rooms/boardContentAccess.js'
vi.mock('../rooms/boardContentAccess.js',()=>({mayReadBoardContent:vi.fn()}))
const directories:string[]=[]
afterEach(async()=>{vi.unstubAllEnvs();vi.resetAllMocks();await Promise.all(directories.splice(0).map(d=>rm(d,{force:true,recursive:true})))})
async function app() {
  const directory=await mkdtemp(join(tmpdir(),'brush-routes-'));directories.push(directory)
  vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR',directory)
  const instance=Fastify()
  instance.addHook('onRequest',async req=>{req.userId='alice'})
  await registerBrushLibraryRoutes(instance,'')
  return instance
}
describe('brush resource HTTP authorization',()=> {
  it('requires durable room access before metadata, assets, pin or export',async()=> {
    vi.mocked(mayReadBoardContent).mockResolvedValue(false)
    const server=await app()
    try {
      for(const url of ['/api/brush-library?roomId=secret','/api/brush-library/assets/'+ 'a'.repeat(64)+'?roomId=secret','/api/rooms/secret/brush-library/export']) expect((await server.inject(url)).statusCode).toBe(403)
      expect((await server.inject({method:'POST',url:'/api/rooms/secret/brush-library',payload:{presets:[]}})).statusCode).toBe(403)
    } finally {await server.close()}
  })
  it('does not grant another owner job access and rejects traversal before queueing',async()=> {
    const server=await app()
    try {
      expect((await server.inject('/api/brush-library/imports/missing')).statusCode).toBe(404)
      expect((await server.inject({method:'POST',url:'/api/brush-library/imports',headers:{'content-type':'application/octet-stream','x-brush-filename':'..%2fprivate.abr'},payload:Buffer.from('bad')})).statusCode).toBe(400)
      expect((await server.inject('/api/brush-library/assets/'+'a'.repeat(64))).statusCode).toBe(404)
    } finally {await server.close()}
  })
})
