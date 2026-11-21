import { BRUSH_MANIFEST_MAX_BYTES } from './brushLibrary.js'
import { brushContent, brushContentHash, canonicalBrushJson, type StoredBrushLibrary } from './contentAddressing.js'
import {isBrushPattern,brushPatternAssetIds,hasExperimentCurrentPattern158Scope,type BrushPattern,type BrushAsset} from '@grafetto/shared'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { mkdirSync, lstatSync, writeFileSync, renameSync, rmSync, constants, openSync, closeSync, fstatSync, readSync, readdirSync, fsyncSync, linkSync } from 'node:fs'
import { resolve, join, parse } from 'node:path'
import { hasBristleSoak139Scope,hasBristleSoakBeginIdentity139,hasGridWash137Scope,hasGridBeginIdentity137,brushAssetIds, brushUsesGradient,brushRequiresRandomContext, brushRequiresSourceInputs, hasValidBrushRandomContext,hasValidBrushSourceContext, hasBrushSourceInputs, strokeDabs, strokeEndSample, isBrushLibrary, type BrushLibrary, type Operation } from '@grafetto/shared'

export const empty = (): BrushLibrary => ({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
// Descriptors are JSON wire data: serialization normalizes signed zero, while
// deep comparison remains independent of object property order.
const wireDescriptor = (descriptor: BrushLibrary['brushes'][number]['descriptor']): unknown => JSON.parse(JSON.stringify(descriptor))
const key = (s: string) => createHash('sha256').update(s).digest('hex')
export function boundedRead(path: string, limit: number): Buffer {
  let cursor = parse(resolve(path)).root
  for (const part of resolve(path).slice(cursor.length).split('/').filter(Boolean).slice(0,-1)) {
    cursor=join(cursor,part)
    const stat=lstatSync(cursor)
    if(stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe file path')
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw Error('Invalid file')
    const bytes = Buffer.alloc(stat.size); let offset = 0
    while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw Error('Truncated file'); offset += n }
    return bytes
  } finally { closeSync(fd) }
}
/** First source owns display metadata; rendering descriptors remain immutable. */
export function merge(...libraries: BrushLibrary[]): BrushLibrary {
  const result = empty()
  for (const library of libraries) {
    for (const brush of library.brushes) {
      const existing = result.brushes.find(b => b.descriptor.id === brush.descriptor.id && b.descriptor.version === brush.descriptor.version)
      if (existing && !isDeepStrictEqual(wireDescriptor(existing.descriptor), wireDescriptor(brush.descriptor))) throw Error('Immutable brush conflict')
      if (!existing) result.brushes.push({ ...brush })
      else if (!existing.preview && brush.preview) existing.preview = brush.preview
    }
    for (const asset of library.assets) if (!result.assets.some(a => a.id === asset.id)) result.assets.push(asset)
    for (const item of library.skipped) if (!result.skipped.some(previous => previous.name === item.name && JSON.stringify(previous.reasons) === JSON.stringify(item.reasons))) result.skipped.push(item)
  }
  if (!isBrushLibrary(result, {maxBytes:512*1024*1024,maxBrushes:1024,maxAssets:8192})) throw Error('Visible brush library quota exceeded')
  return result
}
export class BrushStorage {
  readonly root: string
  constructor(directory: string) {
    this.root = resolve(directory); mkdirSync(this.root, { recursive: true, mode: 0o700 })
    let cursor = parse(this.root).root
    for (const part of this.root.slice(cursor.length).split('/').filter(Boolean)) { cursor = join(cursor, part); if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) throw Error('Unsafe storage directory') }
    for (const name of ['owners', 'rooms', 'assets', 'jobs', 'tmp', 'contents', 'preferences', 'selections', 'uploads', 'previews', 'sources', 'artworks', 'sets', 'scopes']) { const path=join(this.root,name); mkdirSync(path,{mode:0o700,recursive:true}); if (lstatSync(path).isSymbolicLink()) throw Error('Unsafe storage directory') }
  }
  path(kind: 'owners'|'rooms'|'jobs'|'preferences'|'selections'|'uploads'|'sources'|'sets'|'scopes', id: string): string { return join(this.root,kind,key(id)+'.json') }
  library(kind: 'owners'|'rooms'|'sets', id: string): BrushLibrary {
    try { const stored: unknown=JSON.parse(boundedRead(this.path(kind,id), BRUSH_MANIFEST_MAX_BYTES).toString()); const value = this.expandLibrary(stored); if (!isBrushLibrary(value)) throw Error('Invalid stored library'); return value }
    catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw e }
  }
  private expandLibrary(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !('storageVersion' in value) || value.storageVersion !== 2) return value
    const stored = value as StoredBrushLibrary
    if (!Array.isArray(stored.brushes) || stored.brushes.length > 1024) throw Error('Invalid brush references')
    return { schemaVersion: 1, ...(stored.selection ? { selection: stored.selection } : {}), assets: stored.assets, skipped: stored.skipped, brushes: stored.brushes.map(ref => {
      if (!/^[a-f0-9]{64}$/.test(ref.contentHash)) throw Error('Invalid content hash')
      const content = JSON.parse(boundedRead(join(this.root, 'contents', ref.contentHash + '.json'), 1024 * 1024).toString())
      if (key(canonicalBrushJson(content)) !== ref.contentHash) throw Error('Corrupt brush content')
      const { contentHash: _hash, descriptorId, previewHash, ...metadata } = ref
      let preview: string | undefined
      if (previewHash !== undefined) {
        if (!/^[a-f0-9]{64}$/.test(previewHash)) throw Error('Invalid artwork hash')
        preview = boundedRead(join(this.root, 'artworks', previewHash + '.txt'), 90022).toString()
        if (key(preview) !== previewHash) throw Error('Corrupt artwork')
      }
      return { ...metadata, ...(preview ? { preview } : {}), ...content, descriptor: { ...content.descriptor, id: descriptorId } }
    }) }
  }
  /** Write immutable rendering contents once; ownership/display data stay in
   * small reference manifests. Existing v1 manifests remain readable. */
  private saveLibrary(kind: 'owners' | 'rooms' | 'sets', id: string, library: BrushLibrary): void {
    const stored: StoredBrushLibrary = { storageVersion: 2, ...(library.selection ? { selection: library.selection } : {}), assets: library.assets, skipped: library.skipped, brushes: library.brushes.map(brush => {
      const contentHash = brushContentHash(brush), content = brushContent(brush)
      const path = join(this.root, 'contents', contentHash + '.json')
      try {
        if (canonicalBrushJson(JSON.parse(boundedRead(path, 1024 * 1024).toString())) !== canonicalBrushJson(content)) throw Error('Immutable content conflict')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        this.ensureCapacity(Buffer.byteLength(canonicalBrushJson(content)))
        this.atomic(path, content)
      }
      const { descriptor, sourceDefaults: _defaults, preview, strokePreview: _sample, ...metadata } = brush
      let previewHash: string | undefined
      if (preview) {
        previewHash = key(preview)
        const artwork = join(this.root, 'artworks', previewHash + '.txt')
        try { if (boundedRead(artwork, 90022).toString() !== preview) throw Error('Immutable artwork conflict') }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          this.ensureCapacity(Buffer.byteLength(preview))
          writeFileSync(artwork, preview, { flag: 'wx', mode: 0o600 })
        }
      }
      return { ...metadata, contentHash, descriptorId: descriptor.id, ...(previewHash ? { previewHash } : {}) }
    }) }
    this.atomic(this.path(kind, id), stored)
  }
  atomic(path: string, value: unknown): void {
    const temp=path+'.'+randomUUID();
    try {
      const fd=openSync(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600)
      try { writeFileSync(fd,JSON.stringify(value));fsyncSync(fd) } finally {closeSync(fd)}
      renameSync(temp,path)
      const directory=openSync(join(path,'..'),constants.O_RDONLY|constants.O_DIRECTORY)
      try {fsyncSync(directory)} finally {closeSync(directory)}
    } finally { rmSync(temp,{force:true}) }
  }
  diskBytes(): number {
    const walk=(path:string):number=>readdirSync(path).reduce((sum,name)=>{
      const child=join(path,name),s=lstatSync(child)
      if(s.isSymbolicLink()) throw Error('Unsafe storage path')
      return sum+(s.isDirectory() ? walk(child) : s.size)
    },0)
    return walk(this.root)
  }
  ensureCapacity(extra: number): void {
    const configured=Number(process.env.GRAFETTO_BRUSH_STORAGE_QUOTA_BYTES ?? 4*1024*1024*1024)
    const quota=Number.isSafeInteger(configured)&&configured>0 ? configured : 4*1024*1024*1024
    if(this.diskBytes()+extra>quota) throw Error('Global brush storage quota exceeded')
  }
  mutate<T>(fn:()=>T): T {
    const lock=join(this.root,'.write-lock')
    try { mkdirSync(lock,{mode:0o700}) } catch(e) {
      if((e as NodeJS.ErrnoException).code!=='EEXIST') throw e
      let dead=false
      try {
        const pid=Number(boundedRead(join(lock,'pid'),32).toString())
        if(Number.isInteger(pid)&&pid>0) { try {process.kill(pid,0)} catch(err) {dead=(err as NodeJS.ErrnoException).code==='ESRCH'} }
      } catch(err) { if((err as NodeJS.ErrnoException).code==='ENOENT') dead=Date.now()-lstatSync(lock).mtimeMs>30000 }
      if(!dead) throw Error('Brush storage writer busy')
      rmSync(lock,{recursive:true});mkdirSync(lock,{mode:0o700})
    }
    writeFileSync(join(lock,'pid'),String(process.pid),{flag:'wx',mode:0o600})
    try { return fn() } finally { rmSync(lock,{recursive:true}) }
  }
  asset(hash: string, size: number): Buffer {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid asset')
    const bytes=boundedRead(join(this.root,'assets',hash+'.bin'),size*size)
    if (bytes.length!==size*size || keyBytes(bytes)!==hash) throw Error('Corrupt brush asset')
    return bytes
  }
  /** Publish immutable CAS only; operator catalogs are not personal history. */
  provision(assets: Map<string, Buffer>): void {
    this.mutate(() => this.provisionAssets(assets))
  }

  /** Called only under the writer lock; validate the entire batch before writes. */
  private provisionAssets(assets: Map<string, Buffer>): void {
    const missing: [string, Buffer][] = []
    for (const [hash, bytes] of assets) {
      if (!/^[a-f0-9]{64}$/.test(hash) || keyBytes(bytes) !== hash) throw Error('Corrupt brush asset')
      const path = join(this.root, 'assets', hash + '.bin')
      try {
        const existing = boundedRead(path, bytes.length)
        if (!existing.equals(bytes) || keyBytes(existing) !== hash) throw Error('Immutable asset conflict')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        missing.push([hash, bytes])
      }
    }
    // Existing verified objects consume no additional quota on startup/import.
    this.ensureCapacity(missing.reduce((sum, [, bytes]) => sum + bytes.length, 0))
    for (const [hash, bytes] of missing) {
      const path = join(this.root, 'assets', hash + '.bin')
      const temporary = path + '.' + randomUUID()
      try {
        const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
        try { writeFileSync(fd, bytes); fsyncSync(fd) } finally { closeSync(fd) }
        try { linkSync(temporary, path) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          const existing = boundedRead(path, bytes.length)
          if (!existing.equals(bytes) || keyBytes(existing) !== hash) throw Error('Immutable asset conflict')
        }
      } finally { rmSync(temporary, { force: true }) }
    }
    const directory = openSync(join(this.root, 'assets'), constants.O_RDONLY | constants.O_DIRECTORY)
    try { fsyncSync(directory) } finally { closeSync(directory) }
  }

  install(owner: string, library: BrushLibrary, assets: Map<string, Buffer>): BrushLibrary {
    return this.mutate(() => {
      const next = merge(library, this.library('owners', owner))
      const total = next.assets.reduce((sum, asset) => sum + asset.size * asset.size, 0)
      if (total > 256 * 1024 * 1024 || !isBrushLibrary(next)) throw Error('Personal brush library quota exceeded (256 MiB / 512 brushes)')
      // Validate every declared resource before publishing any new CAS or manifest.
      for (const asset of next.assets) {
        const hash = asset.id.slice(6), incoming = assets.get(hash)
        if (incoming) {
          if (incoming.length !== asset.size * asset.size || keyBytes(incoming) !== hash) throw Error('Corrupt brush asset')
        } else this.asset(hash, asset.size)
      }
      this.provisionAssets(assets)
      this.saveLibrary('owners', owner, next)
      return next
    })
  }
  bindSelectionScope(room: string, scope: string): void {
    if (this.selectionScope(room) === scope) return
    this.mutate(() => this.atomic(this.path('scopes',room), scope))
  }
  selectionScope(room: string): string {
    try {
      const scope: unknown = JSON.parse(boundedRead(this.path('scopes',room),1024).toString())
      if (typeof scope !== 'string' || scope.length > 200) throw Error('Invalid brush selection scope')
      return scope
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return room; throw error }
  }
  replaceSelection(room: string, owner: string, references: string[], operator: BrushLibrary): void {
    this.mutate(() => {
      const available = merge(operator, this.library('owners',owner), this.library('sets',room), this.library('rooms',room)), selected = empty()
      selected.selection = [...new Set(references)]
      selected.brushes = references.filter(ref => ref.startsWith('brush:')).map(ref => {
        const brush = available.brushes.find(b => `brush:${b.descriptor.id}@${b.descriptor.version}` === ref)
        if (!brush) throw Error('Brush unavailable')
        return brush
      })
      const ids = new Set(selected.brushes.flatMap(b => brushAssetIds(b.descriptor)))
      selected.assets = available.assets.filter(a => ids.has(a.id))
      if (!isBrushLibrary(selected)) throw Error('Invalid selection library')
      for (const asset of selected.assets) this.asset(asset.id.slice(6),asset.size)
      this.saveLibrary('sets',room,selected)
    })
  }
  removePersonalBrush(owner: string, reference: string): void {
    this.mutate(() => {
      const library = this.library('owners', owner)
      library.brushes = library.brushes.filter(b => `brush:${b.descriptor.id}@${b.descriptor.version}` !== reference)
      const used = new Set(library.brushes.flatMap(b => brushAssetIds(b.descriptor)))
      library.assets = library.assets.filter(a => used.has(a.id))
      this.saveLibrary('owners', owner, library)
    })
  }
  acceptsExecutionInputs(room: string, owner: string, op: Operation, operator=empty()): boolean {
    if(op.type==='stroke'&&op.brushSource?.pattern!==undefined&&(!op.preset||!/^(brush:)?imported-/.test(op.preset)))return false
    if (op.type !== 'stroke' || !op.preset || !/^(brush:)?imported-/.test(op.preset)) return true
    const token = /^brush:(imported-[a-f0-9]+)@(\d+)(?::[a-z0-9-]+)*$/.exec(op.preset)
    const find = (library: BrushLibrary) => library.brushes.find(b => token ? b.descriptor.id === token[1] && b.descriptor.version === Number(token[2]) : b.descriptor.id === op.preset)
    // A durable room pin is authoritative and avoids merging the whole catalog per live packet.
    const brush = find(this.library('rooms', room)) ?? find(this.library('sets', this.selectionScope(room))) ?? find(this.library('owners', owner)) ?? find(operator)
    if (!brush) throw Error('Brush unavailable')
    if (brushRequiresRandomContext(brush.descriptor) && (op.brushRandom === undefined || !hasValidBrushRandomContext(op))) return false
    if(!hasValidBrushSourceContext(op) || brush.descriptor.mixer?.source==='projectionCanvas' && op.brushSource?.projection===undefined)return false
    if(brush.descriptor.tangentNormal&&op.brushSource?.normalRotation===undefined)return false
    if(brush.descriptor.clone&&op.brushSource?.clone===undefined)return false
    if(brushUsesGradient(brush.descriptor)&&op.brushSource?.gradient===undefined)return false
    if(op.brushSource?.pattern!==undefined&&!hasExperimentCurrentPattern158Scope(brush.descriptor))return false
    if(hasExperimentCurrentPattern158Scope(brush.descriptor)){
      const pattern=op.brushSource?.pattern;if(!pattern||!isBrushPattern(pattern))return false
      const assets=this.library('rooms',room).assets
      if(pattern.kind==='rgba'&&brushPatternAssetIds(pattern).some(id=>!assets.some(a=>a.id===id&&a.size===pattern.side)))return false
    }
    if(hasGridWash137Scope(brush.descriptor)&&!hasGridBeginIdentity137(op))return false
    if(hasBristleSoak139Scope(brush.descriptor)&&!hasBristleSoakBeginIdentity139(op))return false
    if (!brushRequiresSourceInputs(brush.descriptor)) return true
    try { return hasBrushSourceInputs(brush.descriptor, strokeDabs(op), strokeEndSample(op)) }
    catch { return false }
  }

  pin(room: string, owner: string, presets: string[], operator=empty(),source?:{pattern:BrushPattern;assets:BrushAsset[];payloads?:Record<string,string>}): void {
    this.mutate(()=> {
      const current=this.library('rooms',room)
      const has=(preset:string)=>current.brushes.some(b=>preset===b.descriptor.id || new RegExp('^brush:'+b.descriptor.id+'@'+b.descriptor.version+'(?::[a-z0-9-]+)*$').test(preset))
      if(presets.every(has)&&!source)return
      const available=merge(current,this.library('sets',this.selectionScope(room)),this.library('owners',owner),operator), selected=empty()
      for (const preset of [...new Set(presets)]) {
        const match=/^brush:(imported-[a-f0-9]+)@(\d+)(?::[a-z0-9-]+)*$/.exec(preset)
        const brush=available.brushes.find(b=>match ? b.descriptor.id===match[1] && b.descriptor.version===Number(match[2]) : b.descriptor.id===preset)
        if (!brush) throw Error('Brush unavailable')
        selected.brushes.push(brush)
      }
      const referenced = new Set(selected.brushes.flatMap(brush => brushAssetIds(brush.descriptor)))
      selected.assets=available.assets.filter(a=>referenced.has(a.id))
      for(const a of selected.assets) this.asset(a.id.slice(6),a.size)
      if(source){
        if(!isBrushPattern(source.pattern)||!Array.isArray(source.assets)||source.assets.length>4)throw Error('Invalid canvas pattern metadata')
        const ids=brushPatternAssetIds(source.pattern),unique=new Set(source.assets.map(a=>a.id))
        if(ids.length!==source.assets.length||unique.size!==ids.length||source.assets.some(a=>!ids.includes(a.id)||source.pattern.kind!=='rgba'||a.size!==source.pattern.side||a.file!==a.id.slice(6)+'.bin'))throw Error('Pattern asset inventory mismatch')
        const payloads=source.payloads??{},incoming=new Map<string,Buffer>()
        if(Object.keys(payloads).some(hash=>!ids.includes(`asset:${hash}`)))throw Error('Unreferenced pattern payload')
        for(const a of source.assets){
          const hash=a.id.slice(6),encoded=payloads[hash]
          let bytes:Buffer
          if(encoded!==undefined){
            if(typeof encoded!=='string'||encoded.length>349528||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('Invalid pattern payload')
            bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded||bytes.length!==a.size*a.size||keyBytes(bytes)!==hash)throw Error('Corrupt pattern payload')
            incoming.set(hash,bytes)
          }else{
            if(!available.assets.some(old=>old.id===a.id&&old.size===a.size))throw Error('Pattern CAS is not owned or room-pinned')
            bytes=this.asset(hash,a.size)
          }
          if(source.pattern.kind==='rgba'){
            const r=source.pattern.sourceRect,n=source.pattern.side
            for(let y=0;y<n;y++)for(let x=0;x<n;x++)if((x<r.x||x>=r.x+r.width||y<r.y||y>=r.y+r.height)&&bytes[y*n+x]!==0)throw Error('Noncanonical pattern padding')
          }
        }
        selected.assets.push(...source.assets.filter(a=>!selected.assets.some(old=>old.id===a.id)))
        const proposed=merge(current,selected)
        if(!isBrushLibrary(proposed))throw Error('Room source resource quota exceeded')
        this.provisionAssets(incoming)
      }
      const next=merge(current,selected)
      if(!isBrushLibrary(next)) throw Error('Room brush library quota exceeded (256 MiB / 512 brushes)')
      this.saveLibrary('rooms', room, next)
    })
  }
  copy(source: string, target: string): void { this.mutate(()=>{
    const library=this.library('rooms',source)
    if(!isBrushLibrary(library)) throw Error('Invalid source room brush library')
    this.saveLibrary('rooms', target, library)
    const scope = this.selectionScope(source), set = this.library('sets',scope)
    if (set.selection) this.saveLibrary('sets',target,set)
    else {
      try { this.atomic(this.path('selections',target), JSON.parse(boundedRead(this.path('selections',scope),256*1024).toString())) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }) }
}
function keyBytes(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex') }
let active: BrushStorage | undefined
let operatorLibrary=empty()
export function setBrushStorage(storage: BrushStorage, operator: BrushLibrary): void { active=storage; operatorLibrary=operator }
export function hasRequiredOperationBrushContext(room: string, user: string, op: Operation): boolean {
  if(op.type==='stroke'&&op.brushSource?.pattern!==undefined&&(!op.preset||!/^(brush:)?imported-/.test(op.preset)))return false
  if (op.type !== 'stroke' || !op.preset || !/^(brush:)?imported-/.test(op.preset)) return true
  if (!active) throw Error('Brush storage unavailable')
  return active.acceptsExecutionInputs(room, user, op, operatorLibrary)
}
export function pinOperationBrush(room: string, user: string, op: {type: string; preset?: string}): void {
  if (op.type!=='stroke' || !op.preset || !/^(brush:)?imported-/.test(op.preset)) return
  if (!active) throw Error('Brush storage unavailable')
  active.pin(room,user,[op.preset],operatorLibrary)
}
export function copyRoomBrushes(source: string,target: string): void { active?.copy(source,target) }
