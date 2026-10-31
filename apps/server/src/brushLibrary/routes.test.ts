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

it('serves refreshed operator diagnostics over old room pins without rewriting protected manifests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brush-metadata-refresh-'))
  directories.push(directory)
  const root = join(directory, 'storage'), operator = join(directory, 'operator')
  const storage = new BrushStorage(root), old = empty()
  old.brushes.push({ name: 'Old label', source: 'qa', warnings: ['v41 diagnostics'], descriptor: {
    id: 'imported-' + 'c'.repeat(16), version: 1, model: 'stamp', category: 'paint',
    tip: { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
    paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
    sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
  } })
  storage.install('alice', old, new Map())
  storage.pin('room', 'alice', ['brush:' + old.brushes[0].descriptor.id + '@1'])
  const room = await readFile(storage.path('rooms', 'room'))
  const owner = await readFile(storage.path('owners', 'alice'))
  const current = structuredClone(old)
  current.brushes[0].warnings = ['v42 diagnostics']
  current.brushes[0].name = 'Current label'
  await mkdir(operator)
  await writeFile(join(operator, 'manifest.json'), JSON.stringify(current))
  vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR', root)
  vi.mocked(mayReadBoardContent).mockResolvedValue(true)
  const server = Fastify()
  server.addHook('onRequest', async request => { request.userId = 'alice' })
  try {
    await registerBrushLibraryRoutes(server, operator)
    const response = await server.inject('/api/brush-library?roomId=room')
    expect(response.statusCode).toBe(200)
    expect(response.json().brushes).toEqual(current.brushes)
    expect(await readFile(storage.path('rooms', 'room'))).toEqual(room)
    expect(await readFile(storage.path('owners', 'alice'))).toEqual(owner)
  } finally { await server.close() }
})

it('uses the captured trusted mixed read policy for actual scoped catalog and CAS assets',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'brush-mixed-read-'));directories.push(directory)
 const root=join(directory,'storage'),operator=join(directory,'operator'),bytes=Buffer.from([1,2,3,4]),hash=createHash('sha256').update(bytes).digest('hex'),manifest=empty()
 manifest.assets.push({id:`asset:${hash}`,size:2,file:hash+'.bin'})
 await mkdir(operator);await writeFile(join(operator,'manifest.json'),JSON.stringify(manifest));await writeFile(join(operator,hash+'.bin'),bytes)
 vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR',root)
 vi.mocked(mayReadBoardContent).mockImplementation(async(_room,_user,format)=>format==='mixed-v2')
 const server=Fastify();server.addHook('onRequest',async request=>{request.userId='alice'})
 try{
  await registerBrushLibraryRoutes(server,operator,'mixed-v2')
  const catalog=await server.inject('/api/brush-library?roomId=room')
  expect(catalog.statusCode).toBe(200);expect(catalog.json().assets).toEqual(manifest.assets)
  const asset=await server.inject('/api/brush-library/assets/'+hash+'?roomId=room')
  expect(asset.statusCode).toBe(200);expect(asset.rawPayload).toEqual(bytes)
  expect(mayReadBoardContent).toHaveBeenLastCalledWith('room','alice','mixed-v2')
  vi.mocked(mayReadBoardContent).mockResolvedValue(false)
  expect((await server.inject('/api/brush-library?roomId=room')).statusCode).toBe(403)
  expect((await server.inject('/api/brush-library/assets/'+hash+'?roomId=room')).statusCode).toBe(403)
 }finally{await server.close()}
})

it('allows the existing selection pin and read-only export under mixed policy without changing resource ownership or bypassing revocation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'brush-mixed-pin-'));directories.push(directory)
 const root=join(directory,'storage'),operator=join(directory,'operator'),bytes=Buffer.from([1,2,3,4]),hash=createHash('sha256').update(bytes).digest('hex'),manifest=empty()
 manifest.assets.push({id:`asset:${hash}`,size:2,file:hash+'.bin'})
 manifest.brushes.push({name:'Resource fixture',source:'qa',warnings:[],descriptor:{id:'imported-'+'d'.repeat(16),version:1,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${hash}`,hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,0],[1,1]],flowByPressure:[[0,0],[1,1]],opacityByPressure:[[0,0],[1,1]]}})
 await mkdir(operator);const original=JSON.stringify(manifest);await writeFile(join(operator,'manifest.json'),original);await writeFile(join(operator,hash+'.bin'),bytes)
 vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR',root)
 vi.mocked(mayReadBoardContent).mockImplementation(async(_room,_user,format)=>format==='mixed-v2')
 const server=Fastify();server.addHook('onRequest',async request=>{request.userId='alice'})
 try{
  await registerBrushLibraryRoutes(server,operator,'mixed-v2')
  const preset=`brush:${manifest.brushes[0].descriptor.id}@1`
  expect((await server.inject({method:'POST',url:'/api/rooms/room/brush-library',payload:{presets:[preset]}})).statusCode).toBe(200)
  const storage=new BrushStorage(root),room=await readFile(storage.path('rooms','room'))
  const exported=await server.inject('/api/rooms/room/brush-library/export')
  expect(exported.statusCode).toBe(200);expect(exported.json()).toEqual({library:manifest,assets:{[`asset:${hash}`]:bytes.toString('base64')}})
  expect(await readFile(join(operator,'manifest.json'),'utf8')).toBe(original)
  expect((await server.inject({method:'POST',url:'/api/rooms/room/brush-library',payload:{presets:['brush:imported-missing@1']}})).statusCode).toBe(400)
  vi.mocked(mayReadBoardContent).mockResolvedValue(false)
  expect((await server.inject({method:'POST',url:'/api/rooms/room/brush-library',payload:{presets:[preset]}})).statusCode).toBe(403)
  expect((await server.inject('/api/rooms/room/brush-library/export')).statusCode).toBe(403)
  expect(await readFile(storage.path('rooms','room'))).toEqual(room)
 }finally{await server.close()}
})

it('does not implicitly select mixed resource access for the ordinary registration',async()=>{
 vi.mocked(mayReadBoardContent).mockImplementation(async(_room,_user,format)=>format==='mixed-v2')
 const server=await app()
 try{
  expect((await server.inject('/api/brush-library?roomId=room')).statusCode).toBe(403)
  expect((await server.inject({method:'POST',url:'/api/rooms/room/brush-library',payload:{presets:[]}})).statusCode).toBe(403)
  expect((await server.inject('/api/rooms/room/brush-library/export')).statusCode).toBe(403)
  expect(mayReadBoardContent).toHaveBeenLastCalledWith('room','alice','frames-v1')
 }finally{await server.close()}
})
