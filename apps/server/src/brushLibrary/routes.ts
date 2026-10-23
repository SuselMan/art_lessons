import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve, basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { BrushImportJob } from '@grafetto/shared'
import { apiRoute } from '../http/apiRoute.js'
import { mayReadBoardContent } from '../rooms/boardContentAccess.js'
import { loadBrushLibrary } from './brushLibrary.js'
import { BrushStorage, boundedRead, empty, merge, setBrushStorage } from './storage.js'

const MAX_UPLOAD=128*1024*1024
export async function registerBrushLibraryRoutes(app: FastifyInstance, directory=process.env.GRAFETTO_BRUSH_LIBRARY_DIR): Promise<void> {
  // A configured legacy directory is an explicit operator-provisioned QA library.
  const operator=await loadBrushLibrary(directory)
  const root=process.env.GRAFETTO_BRUSH_STORAGE_DIR
  const scratch=!root ? await mkdtemp(join(tmpdir(),'grafetto-brush-runtime-')) : undefined
  const storage=new BrushStorage(root ?? scratch!)
  if (operator.manifest.assets.length) storage.install('__operator__',operator.manifest,operator.assets)
  operator.assets.clear()
  setBrushStorage(storage,operator.manifest)
  if (scratch) app.addHook('onClose',async()=>{await rm(scratch,{recursive:true,force:true})})
  const jobs=new Map<string,{ owner: string; job: BrushImportJob }>()
  const queue: Array<()=>Promise<void>>=[]
  let running=false
  async function drain(): Promise<void> {
    if (running) return; running=true
    try { while(queue.length) await queue.shift()!() } finally { running=false }
  }
  const catalog=(owner:string,room?:string)=>merge(operator.manifest,storage.library('owners',owner),room ? storage.library('rooms',room) : empty())
  apiRoute(app,'GET /api/brush-library',async(request,reply)=> {
    const room=typeof request.query.roomId==='string' ? request.query.roomId : undefined
    if(room && !await mayReadBoardContent(room,request.userId)) return reply.code(403).send({error:'forbidden'})
    return reply.header('Cache-Control','private, no-cache').send(catalog(request.userId,room))
  })
  apiRoute(app,'GET /api/brush-library/assets/:hash',async(request,reply)=> {
    const room=typeof request.query.roomId==='string' ? request.query.roomId : undefined
    if(room && !await mayReadBoardContent(room,request.userId)) return reply.code(403).send({error:'forbidden'})
    const asset=catalog(request.userId,room).assets.find(a=>a.id===`asset:${request.params.hash}`)
    if(!asset) return reply.code(404).send({error:'Brush asset not found'})
    return reply.header('Cache-Control','private, max-age=31536000, immutable').type('application/octet-stream').send(storage.asset(request.params.hash,asset.size))
  })
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:MAX_UPLOAD},(_req,body,done)=>done(null,body))
  apiRoute(app,'POST /api/brush-library/imports',{bodyLimit:MAX_UPLOAD},async(request,reply)=> {
    if(!root) return reply.code(503).send({error:'Brush uploads are not configured'})
    const header=request.headers['x-brush-filename']
    let filename=''
    try { filename=typeof header==='string' ? decodeURIComponent(header) : '' } catch { return reply.code(400).send({error:'Invalid brush filename'}) }
    if(filename!==basename(filename) || filename.includes('\\') || filename.length>180 || !(['.abr','.brush','.brushset'].includes(extname(filename).toLowerCase()) || filename.endsWith('.grafetto-brushes.json')) || !Buffer.isBuffer(request.body) || request.body.length===0) return reply.code(400).send({error:'Invalid brush upload'})
    if(queue.length>=4 || [...jobs.values()].some(j=>j.owner===request.userId && ['queued','running'].includes(j.job.status))) return reply.code(429).send({error:'Brush import queue full'})
    const owner=request.userId, id=randomUUID(), job:BrushImportJob={id,status:'queued'}
    const work=await mkdtemp(join(storage.root,'tmp','import-'))
    const input=join(work,filename), output=join(work,'output')
    try { await writeFile(input,request.body,{flag:'wx',mode:0o600}) } catch(e) { await rm(work,{recursive:true,force:true}); throw e }
    jobs.set(id,{owner,job}); storage.atomic(storage.path('jobs',id),{owner,job})
    queue.push(async()=> {
      job.status='running'; storage.atomic(storage.path('jobs',id),{owner,job})
      try {
        await mkdir(output,{mode:0o700})
        await new Promise<void>((resolveJob,reject)=> {
          const python=process.env.GRAFETTO_BRUSH_IMPORT_PYTHON ?? 'python3'
          const script=resolve(process.cwd(),'../../scripts/brush-import/convert.py')
          const child=spawn('prlimit',['--as=1073741824','--cpu=110','--fsize=536870912','--',python,script,input,'--output',output],{stdio:['ignore','ignore','ignore'],env:{PATH:process.env.PATH,PYTHONHASHSEED:'0'}})
          const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Brush import timed out'))},120000)
          child.once('error',err=>{clearTimeout(timer);reject(err)})
          child.once('close',code=>{clearTimeout(timer);code===0 ? resolveJob() : reject(Error('Unsupported or damaged brush file'))})
        })
        const converted=await loadBrushLibrary(output)
        storage.install(owner,converted.manifest,converted.assets)
        job.status='complete'; job.library=converted.manifest
      } catch { job.status='failed';job.error='Import failed: unsupported, damaged, oversized, or incompatible brush file' }
      finally { storage.atomic(storage.path('jobs',id),{owner,job}); await rm(work,{recursive:true,force:true}); jobs.delete(id) }
    })
    void drain()
    return reply.code(202).send({...job})
  })
  apiRoute(app,'GET /api/brush-library/imports/:id',async(request,reply)=> {
    try {
      const saved=JSON.parse(boundedRead(storage.path('jobs',request.params.id),4*1024*1024).toString()) as {owner:string;job:BrushImportJob}
      if(saved.owner!==request.userId) return reply.code(404).send({error:'Import not found'})
      if(['running','queued'].includes(saved.job.status) && !jobs.has(request.params.id)) return {...saved.job,status:'failed',error:'Import interrupted; upload again'}
      return saved.job
    } catch { return reply.code(404).send({error:'Import not found'}) }
  })
  apiRoute(app,'POST /api/rooms/:id/brush-library',async(request,reply)=> {
    if(!await mayReadBoardContent(request.params.id,request.userId)) return reply.code(403).send({error:'forbidden'})
    const presets=request.body?.presets
    if(!Array.isArray(presets)||presets.length>512||!presets.every(p=>typeof p==='string'&&p.length<200)) return reply.code(400).send({error:'Invalid brush references'})
    try { storage.pin(request.params.id,request.userId,presets,operator.manifest) } catch { return reply.code(400).send({error:'Brush unavailable'}) }
    return {ok:true}
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
    return reply.type('application/json').header('Content-Disposition','attachment; filename="brush-library.json"').send(Readable.from(bundle()) as never)
  })
}
