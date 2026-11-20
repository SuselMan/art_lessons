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
vi.mock('../db/prisma.js', () => ({ prisma: { room: { findUnique: vi.fn(async () => null) } } }))
const directories:string[]=[]
afterEach(async()=>{vi.unstubAllEnvs();vi.resetAllMocks();await Promise.all(directories.splice(0).map(d=>rm(d,{force:true,recursive:true})))})
async function app(user = 'alice') {
  const directory=await mkdtemp(join(tmpdir(),'brush-routes-'));directories.push(directory)
  vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR',directory)
  const instance=Fastify()
  instance.addHook('onRequest',async req=>{req.userId=user})
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


it('shutdown terminates active decoder descendants before removing importer work', async()=>{
  const directory=await mkdtemp(join(tmpdir(),'brush-route-process-'));directories.push(directory)
  const script=join(directory,'own-importer.cjs'),receipt=join(directory,'pids.json')
  await writeFile(script,`const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(receipt)},JSON.stringify({parent:process.pid,child:c.pid}));setInterval(()=>{},1000)`)
  vi.stubEnv('GRAFETTO_BRUSH_IMPORT_PYTHON',process.execPath);vi.stubEnv('GRAFETTO_BRUSH_IMPORT_SCRIPT',script)
  const server=await app()
  let p:{parent:number;child:number}|undefined
  try{
    const response=await server.inject({method:'POST',url:'/api/brush-library/imports',headers:{'content-type':'application/octet-stream','x-brush-filename':'own.kpp'},payload:Buffer.from('own-test')});expect(response.statusCode).toBe(202)
    for(let i=0;i<150;i++){try{p=JSON.parse(await readFile(receipt,'utf8'));break}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await new Promise(r=>setTimeout(r,20))}}
    if(!p)throw Error('Own route worker did not start')
    await server.close()
    const live=async(pid:number)=>{try{const stat=await readFile(`/proc/${pid}/stat`,'utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]!=='Z'}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}}
    expect(await live(p.parent)).toBe(false);expect(await live(p.child)).toBe(false)
    const storageRoot=process.env.GRAFETTO_BRUSH_STORAGE_DIR;if(!storageRoot)throw Error('Missing own test storage');const status=await readFile(new BrushStorage(storageRoot).path('jobs',response.json().id),'utf8');expect(JSON.parse(status).job.status).toBe('failed')
  }finally{await server.close();if(p)for(const pid of [p.parent,p.child]){try{process.kill(pid,'SIGKILL')}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error}}}
})

it('authorizes a pinned room mask without reading an unrelated personal catalog', async () => {
  vi.mocked(mayReadBoardContent).mockResolvedValue(true)
  const server = await app(), storage = new BrushStorage(process.env.GRAFETTO_BRUSH_STORAGE_DIR!)
  const bytes = Buffer.from([5, 6, 7, 8]), hash = createHash('sha256').update(bytes).digest('hex')
  const manifest = empty(); manifest.assets.push({ id: `asset:${hash}`, size: 2, file: `${hash}.bin` })
  storage.provision(new Map([[hash, bytes]])); storage.atomic(storage.path('rooms', 'shared'), manifest)
  // This catalog is irrelevant to an already pinned immutable room resource.
  await writeFile(storage.path('owners', 'alice'), '{damaged unrelated personal catalog')
  const read = vi.spyOn(BrushStorage.prototype, 'library')
  try {
    const response = await server.inject('/api/brush-library/assets/' + hash + '?roomId=shared')
    expect(response.statusCode).toBe(200); expect(response.rawPayload).toEqual(bytes)
    expect(read).toHaveBeenCalledWith('rooms', 'shared')
    expect(read).not.toHaveBeenCalledWith('owners', 'alice')
    vi.mocked(mayReadBoardContent).mockResolvedValue(false); read.mockClear()
    expect((await server.inject('/api/brush-library/assets/' + hash + '?roomId=shared')).statusCode).toBe(403)
    expect(read).not.toHaveBeenCalled()
  } finally { read.mockRestore(); await server.close() }
})

it('keeps personal mask ownership and CAS verification when no public or room reference authorizes it', async () => {
  const server = await app(), storage = new BrushStorage(process.env.GRAFETTO_BRUSH_STORAGE_DIR!)
  const own = Buffer.from([9, 10, 11, 12]), foreign = Buffer.from([13, 14, 15, 16])
  const ownHash = createHash('sha256').update(own).digest('hex'), foreignHash = createHash('sha256').update(foreign).digest('hex')
  for (const [owner, hash, bytes] of [['alice', ownHash, own], ['bob', foreignHash, foreign]] as const) {
    const manifest = empty(); manifest.assets.push({ id: `asset:${hash}`, size: 2, file: `${hash}.bin` })
    storage.install(owner, manifest, new Map([[hash, bytes]]))
  }
  try {
    const response = await server.inject('/api/brush-library/assets/' + ownHash)
    expect(response.statusCode).toBe(200); expect(response.rawPayload).toEqual(own)
    expect((await server.inject('/api/brush-library/assets/' + foreignHash)).statusCode).toBe(404)
    await writeFile(join(storage.root, 'assets', ownHash + '.bin'), Buffer.alloc(4))
    expect((await server.inject('/api/brush-library/assets/' + ownHash)).statusCode).toBe(500)
  } finally { await server.close() }
})
it('authorizes selected private masks before the first stroke and retains accepted history after removal', async () => {
  const server = await app('bob')
  vi.mocked(mayReadBoardContent).mockResolvedValue(true)
  try {
    const storage = new BrushStorage(process.env.GRAFETTO_BRUSH_STORAGE_DIR!), pixels = Buffer.from([1,2,3,4]), hash = createHash('sha256').update(pixels).digest('hex'), library = empty()
    library.assets.push({ id: `asset:${hash}`, size: 2, file: hash + '.bin' })
    library.brushes.push({ name:'Private mask',source:'private.kpp',warnings:[],descriptor:{ id:'imported-'+'f'.repeat(16),version:1,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${hash}`,hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]] } })
    const ref = `brush:${library.brushes[0].descriptor.id}@1`
    storage.install('alice',library,new Map([[hash,pixels]]))
    storage.replaceSelection('lesson','alice',['native:pencil',ref],empty())
    storage.bindSelectionScope('board','lesson')
    expect((await server.inject('/api/brush-library/assets/'+hash)).statusCode).toBe(404)
    expect((await server.inject('/api/brush-library/assets/'+hash+'?roomId=board')).rawPayload).toEqual(pixels)
    expect(storage.library('rooms','board').brushes).toEqual([])
    storage.pin('board','bob',[ref])
    storage.replaceSelection('lesson','alice',['native:pencil'],empty())
    expect((await server.inject('/api/brush-library/assets/'+hash+'?roomId=board')).statusCode).toBe(200)
    vi.mocked(mayReadBoardContent).mockResolvedValue(false)
    expect((await server.inject('/api/brush-library/assets/'+hash+'?roomId=board')).statusCode).toBe(403)
  } finally { await server.close() }
})
