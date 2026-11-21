import { BRUSH_MANIFEST_MAX_BYTES } from './brushLibrary.js'
import { BrushSamples, sampleKey } from './samples.js'
import { BrushGallery } from './gallery.js'
import { brushSelectionRoom, registerBrushGalleryRoutes } from './galleryRoutes.js'
import { brushImporterFingerprint, brushImportLimits, startBrushImportProcess, type BrushImportProcess } from './importProcess.js'
import { mkdir, mkdtemp, rm, readdir, stat, writeFile, lstat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { join, basename, extname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Readable, Transform } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import {DEFAULT_BRUSH_SELECTION,brushAssetIds,isBrushPattern,isBrushLibrary,type BrushPattern,type BrushAsset,type BrushImportJob} from '@grafetto/shared'
import { apiRoute } from '../http/apiRoute.js'
import { mayReadBoardContent,mayPublishBoardBrushResource } from '../rooms/boardContentAccess.js'
import { loadBrushLibrary } from './brushLibrary.js'
import { BrushStorage, boundedRead, empty, merge, setBrushStorage } from './storage.js'

const stringRecord=(value:unknown):value is Record<string,string>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(item=>typeof item==='string')
const MAX_UPLOAD=512*1024*1024
export async function registerBrushLibraryRoutes(app: FastifyInstance, directory=process.env.GRAFETTO_BRUSH_LIBRARY_DIR, notify: (id: string) => void = () => {}): Promise<void> {
  // A configured legacy directory is an explicit operator-provisioned QA library.
  const operator=await loadBrushLibrary(directory)
  const root=process.env.GRAFETTO_BRUSH_STORAGE_DIR
  const scratch=!root ? await mkdtemp(join(tmpdir(),'grafetto-brush-runtime-')) : undefined
  const storage=new BrushStorage(root ?? scratch!)
  for(const name of await readdir(join(storage.root,'tmp'))) {
    if(!/^import-[a-zA-Z0-9]{6}$/.test(name)) continue
    const path=join(storage.root,'tmp',name), info=await lstat(path)
    if(!info.isDirectory() || info.isSymbolicLink()) continue
    let abandoned=false
    try {
      const pid=Number(boundedRead(join(path,'.owner-pid'),32).toString())
      if(Number.isInteger(pid)&&pid>0) {try {process.kill(pid,0)} catch(error) {abandoned=(error as NodeJS.ErrnoException).code==='ESRCH'}}
    } catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT') abandoned=Date.now()-info.mtimeMs>24*60*60*1000}
    if(abandoned) await rm(path,{recursive:true,force:true})
  }
  if (operator.assets.size) storage.provision(operator.assets)
  operator.assets.clear()
  setBrushStorage(storage,operator.manifest)
  const samples = new BrushSamples(storage, process.env.GRAFETTO_BRUSH_PREVIEW_URL, error => app.log.warn({ err: error }, 'Brush sample generation failed'))
  await registerBrushGalleryRoutes(app, storage, operator.manifest, samples, notify)
  app.addHook('onClose', async () => { await samples.close() })
  samples.enqueue(operator.manifest)
  let closing=false
  let activeChild: BrushImportProcess | undefined
  let drainTask: Promise<void> = Promise.resolve()
  app.addHook('onClose',async()=>{
    closing=true; activeChild?.cancel(); await drainTask
    if(scratch) await rm(scratch,{recursive:true,force:true})
  })
  const jobs=new Map<string,{ owner: string; job: BrushImportJob }>()
  const queue: Array<()=>Promise<void>>=[]
  const pendingOwners=new Set<string>()
  let running=false
  async function drain(): Promise<void> {
    if (running) return; running=true
    try { while(queue.length) {try {await queue.shift()!()} catch(error) {app.log.error({err:error},'Brush import job persistence failed')}} } finally { running=false }
  }
  const gallery = new BrushGallery(storage, operator.manifest)
  const catalog=async(owner:string,room?:string)=> {
    if (!room) return merge(operator.manifest, storage.library('owners',owner))
    const scope = await brushSelectionRoom(room)
    const selection = gallery.selection(scope) ?? [...DEFAULT_BRUSH_SELECTION, ...operator.manifest.brushes.filter(b => b.source === 'b)_Basic-5_Size.kpp' && !b.archived).slice(-1).map(b => `brush:${b.descriptor.id}@${b.descriptor.version}`)]
    storage.bindSelectionScope(room,scope)
    const historical = storage.library('rooms',room), shared = gallery.selectedLibrary(scope)
    const historyRefs = new Set([...historical.brushes, ...shared.brushes].map(b => `brush:${b.descriptor.id}@${b.descriptor.version}`))
    const stock = empty()
    stock.brushes = operator.manifest.brushes.filter(b => (selection.includes(`brush:${b.descriptor.id}@${b.descriptor.version}`) || historyRefs.has(`brush:${b.descriptor.id}@${b.descriptor.version}`)))
    const used = new Set(stock.brushes.flatMap(b => brushAssetIds(b.descriptor)))
    stock.assets = operator.manifest.assets.filter(a => used.has(a.id))
    const available = merge(stock, shared)
    return { ...merge(available, historical), selection }
  }
  apiRoute(app,'GET /api/brush-library',async(request,reply)=> {
    const room=typeof request.query.roomId==='string' ? request.query.roomId : undefined
    if(room && !await mayReadBoardContent(room,request.userId)) return reply.code(403).send({error:'forbidden'})
    const library = await catalog(request.userId,room)
    samples.enqueue(library)
    const url = (key: string) => `/api/brush-gallery/previews/${key}${room ? '?roomId=' + encodeURIComponent(room) : ''}`
    library.brushes = library.brushes.map(b => ({ ...b, strokePreview: samples.available(sampleKey(b)) ? url(sampleKey(b)) : undefined }))
    const nativePreviews = Object.fromEntries(['pencil', 'liner', 'marker', 'charcoal', 'brushPen', 'eraser', 'smudge'].filter(v => samples.available(sampleKey(v))).map(v => [v, url(sampleKey(v))]))
    if (Object.keys(nativePreviews).length) library.nativePreviews = nativePreviews
    return reply.header('Cache-Control','private, no-cache').send(library)
  })
  apiRoute(app,'GET /api/brush-library/assets/:hash',async(request,reply)=> {
    const room=typeof request.query.roomId==='string' ? request.query.roomId : undefined
    if(room && !await mayReadBoardContent(room,request.userId)) return reply.code(403).send({error:'forbidden'})
    // Authorize this immutable file from any visible source. Merging every
    // descriptor in the personal catalog for each mask makes cold history
    // quadratic in catalog size; the metadata endpoint still does that merge.
    const id = `asset:${request.params.hash}`
    const asset = operator.manifest.assets.find(a => a.id === id)
      ?? (room ? storage.library('rooms', room).assets.find(a => a.id === id) ?? storage.library('sets', storage.selectionScope(room)).assets.find(a => a.id === id) : undefined)
      ?? storage.library('owners', request.userId).assets.find(a => a.id === id)
    if(!asset) return reply.code(404).send({error:'Brush asset not found'})
    return reply.header('Cache-Control','private, max-age=31536000, immutable').type('application/octet-stream').send(storage.asset(request.params.hash,asset.size))
  })
  app.addContentTypeParser('application/octet-stream',(_req,payload,done)=>done(null,payload))
  apiRoute(app,'POST /api/brush-library/imports',{bodyLimit:MAX_UPLOAD},async(request,reply)=> {
    if(closing) return reply.code(503).send({error:'Server shutting down'})
    if(!root) return reply.code(503).send({error:'Brush uploads are not configured'})
    if(pendingOwners.has(request.userId) || new Set([...pendingOwners,...[...jobs.values()].map(value=>value.owner)]).size>=5) return reply.code(429).send({error:'Brush upload queue full'})
    pendingOwners.add(request.userId)
    try {
    const header=request.headers['x-brush-filename']
    let filename=''
    try { filename=typeof header==='string' ? decodeURIComponent(header) : '' } catch { return reply.code(400).send({error:'Invalid brush filename'}) }
    if(filename!==basename(filename) || filename.includes('\\') || filename.length>180 || !(['.abr','.brush','.brushset','.kpp','.bundle','.myb'].includes(extname(filename).toLowerCase()) || filename.endsWith('.grafetto-brushes.json')) || !(request.body instanceof Readable)) return reply.code(400).send({error:'Invalid brush upload'})
    const incomingLength=Number(request.headers['content-length'])
    if(Number.isFinite(incomingLength) && incomingLength>MAX_UPLOAD) return reply.code(413).send({error:'Brush upload too large'})
    let ownJobs=0,totalJobs=0
    for(const file of await readdir(join(storage.root,'jobs'))) {
      if(!/^[a-f0-9]{64}\.json$/.test(file)) continue
      const path=join(storage.root,'jobs',file)
      const saved=JSON.parse(boundedRead(path,BRUSH_MANIFEST_MAX_BYTES+1024*1024).toString()) as {owner:string;job:BrushImportJob}
      if(Date.now()-(await stat(path)).mtimeMs>24*60*60*1000 && !jobs.has(saved.job.id)) { await rm(path);continue }
      totalJobs++;if(saved.owner===request.userId) ownJobs++
    }
    if(ownJobs>=32 || totalJobs>=256) return reply.code(429).send({error:'Brush import job quota exceeded; retry later'})
    if(jobs.size>=5 || queue.length>=4 || [...jobs.values()].some(j=>j.owner===request.userId && ['queued','running'].includes(j.job.status))) return reply.code(429).send({error:'Brush import queue full'})
    try {storage.ensureCapacity(MAX_UPLOAD*(jobs.size+1))} catch {return reply.code(507).send({error:'Brush storage capacity exceeded'})}
    const owner=request.userId, id=randomUUID(), job:BrushImportJob={id,status:'queued'}
    const work=await mkdtemp(join(storage.root,'tmp','import-'))
    await writeFile(join(work,'.owner-pid'),String(process.pid),{flag:'wx',mode:0o600})
    const input=join(work,filename), output=join(work,'output')
    jobs.set(id,{owner,job})
    let received=0
    const sourceDigest = createHash('sha256')
    const bound=new Transform({transform(chunk:Buffer,_encoding,done) { received+=chunk.length; sourceDigest.update(chunk); done(received>MAX_UPLOAD ? Error('Brush upload too large') : null,chunk) }})
    try {
      await pipeline(request.body,bound,createWriteStream(input,{flags:'wx',mode:0o600}))
      if(!received) throw Error('Empty upload')
    } catch { jobs.delete(id);await rm(work,{recursive:true,force:true});return reply.code(413).send({error:'Empty or oversized brush upload'}) }
    const python=process.env.GRAFETTO_BRUSH_IMPORT_PYTHON ?? 'python3'
    const script=process.env.GRAFETTO_BRUSH_IMPORT_SCRIPT ?? fileURLToPath(new URL('../../../../scripts/brush-import/convert.py',import.meta.url))
    let revision:string
    try {revision=await brushImporterFingerprint(script,python)}
    catch {jobs.delete(id);await rm(work,{recursive:true,force:true});return reply.code(503).send({error:'Brush converter unavailable'})}
    const sourceHash = createHash('sha256').update(revision + ':' + sourceDigest.digest('hex')).digest('hex')
    storage.atomic(storage.path('jobs',id),{owner,job})
    queue.push(async()=> {
      job.status='running'
      try {
        storage.atomic(storage.path('jobs',id),{owner,job})
        if(closing) throw Error('Import interrupted')
        let cached: unknown
        try { cached = JSON.parse(boundedRead(storage.path('sources', sourceHash), BRUSH_MANIFEST_MAX_BYTES).toString()) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (cached !== undefined) {
          if (!isBrushLibrary(cached)) throw Error('Invalid cached import')
          storage.install(owner, cached, new Map())
          samples.enqueue(cached, true)
          job.status = 'complete'; job.library = cached
          return
        }
        await mkdir(output,{mode:0o700})
        const limits=brushImportLimits(received)
        const child=startBrushImportProcess('prlimit',['--as=1073741824',`--cpu=${limits.cpuSeconds}`,'--fsize=536870912','--',python,script,input,'--output',output],{PATH:process.env.PATH,PYTHONHASHSEED:'0'},limits.timeoutMs)
        activeChild=child
        try { await child.finished }
        finally { if(activeChild===child) activeChild=undefined }
        const converted=await loadBrushLibrary(output)
        storage.install(owner,converted.manifest,converted.assets)
        samples.enqueue(converted.manifest, true)
        storage.atomic(storage.path('sources', sourceHash), converted.manifest)
        job.status='complete'; job.library=converted.manifest
      } catch { job.status='failed';job.error='Import failed: unsupported, damaged, oversized, or incompatible brush file' }
      finally {
        try {storage.atomic(storage.path('jobs',id),{owner,job})}
        finally {await rm(work,{recursive:true,force:true});jobs.delete(id)}
      }
    })
    if(!running) drainTask=drain()
    return reply.code(202).send({...job})
    } finally {pendingOwners.delete(request.userId)}
  })
  apiRoute(app,'GET /api/brush-library/imports/:id',async(request,reply)=> {
    try {
      const saved=JSON.parse(boundedRead(storage.path('jobs',request.params.id),BRUSH_MANIFEST_MAX_BYTES+1024*1024).toString()) as {owner:string;job:BrushImportJob}
      if(saved.owner!==request.userId) return reply.code(404).send({error:'Import not found'})
      if(['running','queued'].includes(saved.job.status) && !jobs.has(request.params.id)) return {...saved.job,status:'failed',error:'Import interrupted; upload again'}
      return saved.job
    } catch { return reply.code(404).send({error:'Import not found'}) }
  })
  apiRoute(app,'POST /api/rooms/:id/brush-library',{bodyLimit:2*1024*1024},async(request,reply)=> {
    if(!await mayReadBoardContent(request.params.id,request.userId)) return reply.code(403).send({error:'forbidden'})
    const presets=request.body?.presets
    if(!Array.isArray(presets)||presets.length>512||!presets.every(p=>typeof p==='string'&&p.length<200)) return reply.code(400).send({error:'Invalid brush references'})
    const source=request.body.sourcePattern
    if((request.body.sourceAssets!==undefined||request.body.assetPayloads!==undefined)&&source===undefined)return reply.code(400).send({error:'Missing pattern metadata'})
    if(source!==undefined&&!await mayPublishBoardBrushResource(request.params.id,request.userId))return reply.code(403).send({error:'forbidden'})
    let publication:{pattern:BrushPattern;assets:BrushAsset[];payloads?:Record<string,string>}|undefined
    if(source!==undefined){
      const inventory={...empty(),assets:request.body.sourceAssets??[]},payloads=request.body.assetPayloads
      if(!isBrushPattern(source)||!isBrushLibrary(inventory)||payloads!==undefined&&!stringRecord(payloads))return reply.code(400).send({error:'Invalid pattern resources'})
      publication={pattern:source,assets:inventory.assets,payloads}
    }
    try { storage.pin(request.params.id,request.userId,presets,operator.manifest,publication) } catch { return reply.code(400).send({error:'Brush unavailable'}) }
    return {ok:true as const}
  })
  apiRoute(app,'GET /api/rooms/:id/brush-library/export',async(request,reply)=> {
    if(!await mayReadBoardContent(request.params.id,request.userId)) return reply.code(403).send({error:'forbidden'})
    const library=storage.library('rooms',request.params.id)
    // Portable JSON bundle: exact versioned manifest and base64 content-addressed bytes.
    async function* bundle() {
      yield '{"library":'+JSON.stringify(library)+',"assets":{'
      for (let i=0;i<library.assets.length;i++) {
        const a=library.assets[i]
        yield (i ? ',' : '')+JSON.stringify(a.id)+':'+JSON.stringify(storage.asset(a.id.slice(6),a.size).toString('base64'))
      }
      yield '}}'
    }
    return reply.type('application/json').header('Content-Disposition','attachment; filename="room.grafetto-brushes.json"').send(Readable.from(bundle()))
  })
}
