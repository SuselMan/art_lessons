import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { BrushStorage, empty } from './storage.js'
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


it('provisions current operator CAS without reading or replacing the protected historical owner archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brush-operator-'))
  directories.push(directory)
  const root = join(directory, 'storage'), operator = join(directory, 'operator')
  const storage = new BrushStorage(root)
  const archive = Buffer.from(JSON.stringify(empty()) + ' '.repeat(4 * 1024 * 1024))
  // Historical archives are not part of the HTTP catalog; even a file above
  // the personal reader limit must not be parsed/merged by operator startup.
  await writeFile(storage.path('owners', '__operator__'), archive)
  const bytes = Buffer.from([1, 2, 3, 4]), hash = createHash('sha256').update(bytes).digest('hex')
  const manifest = empty()
  manifest.assets.push({ id: `asset:${hash}`, size: 2, file: hash + '.bin' })
  await mkdir(operator)
  await writeFile(join(operator, 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(operator, hash + '.bin'), bytes)
  vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR', root)
  const server = Fastify()
  server.addHook('onRequest', async request => { request.userId = 'alice' })
  try {
    await registerBrushLibraryRoutes(server, operator)
    expect((await server.inject('/api/brush-library')).json()).toEqual(manifest)
    const response = await server.inject('/api/brush-library/assets/' + hash)
    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(bytes)
    const preserved = await readFile(storage.path('owners', '__operator__'))
    expect(preserved.length).toBe(archive.length)
    expect(createHash('sha256').update(preserved).digest('hex')).toBe(createHash('sha256').update(archive).digest('hex'))
  } finally { await server.close() }
})
