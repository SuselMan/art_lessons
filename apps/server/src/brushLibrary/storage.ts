import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, lstatSync, writeFileSync, renameSync, rmSync, constants, openSync, closeSync, fstatSync, readSync } from 'node:fs'
import { resolve, join, parse } from 'node:path'
import { isBrushLibrary, type BrushLibrary } from '@grafetto/shared'

export const empty = (): BrushLibrary => ({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
const key = (s: string) => createHash('sha256').update(s).digest('hex')
export function boundedRead(path: string, limit: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw Error('Invalid file')
    const bytes = Buffer.alloc(stat.size); let offset = 0
    while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw Error('Truncated file'); offset += n }
    return bytes
  } finally { closeSync(fd) }
}
export function merge(...libraries: BrushLibrary[]): BrushLibrary {
  const result = empty()
  for (const library of libraries) {
    for (const brush of library.brushes) {
      const existing = result.brushes.find(b => b.descriptor.id === brush.descriptor.id && b.descriptor.version === brush.descriptor.version)
      if (existing && JSON.stringify(existing) !== JSON.stringify(brush)) throw Error('Immutable brush conflict')
      if (!existing) result.brushes.push(brush)
    }
    for (const asset of library.assets) if (!result.assets.some(a => a.id === asset.id)) result.assets.push(asset)
    result.skipped.push(...library.skipped)
  }
  if (!isBrushLibrary(result)) throw Error('Library quota exceeded')
  return result
}
export class BrushStorage {
  readonly root: string
  constructor(directory: string) {
    this.root = resolve(directory); mkdirSync(this.root, { recursive: true, mode: 0o700 })
    let cursor = parse(this.root).root
    for (const part of this.root.slice(cursor.length).split('/').filter(Boolean)) { cursor = join(cursor, part); if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) throw Error('Unsafe storage directory') }
    for (const name of ['owners', 'rooms', 'assets', 'jobs', 'tmp']) { const path=join(this.root,name); mkdirSync(path,{mode:0o700,recursive:true}); if (lstatSync(path).isSymbolicLink()) throw Error('Unsafe storage directory') }
  }
  path(kind: 'owners'|'rooms'|'jobs', id: string): string { return join(this.root,kind,key(id)+'.json') }
  library(kind: 'owners'|'rooms', id: string): BrushLibrary {
    try { const value: unknown=JSON.parse(boundedRead(this.path(kind,id), 4*1024*1024).toString()); if (!isBrushLibrary(value)) throw Error('Invalid stored library'); return value }
    catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw e }
  }
  atomic(path: string, value: unknown): void {
    const temp=path+'.'+randomUUID(); try { writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600}); renameSync(temp,path) } finally { rmSync(temp,{force:true}) }
  }
  mutate<T>(fn:()=>T): T {
    const lock=join(this.root,'.write-lock'); mkdirSync(lock,{mode:0o700})
    try { return fn() } finally { rmSync(lock,{recursive:true}) }
  }
  asset(hash: string, size: number): Buffer {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid asset')
    const bytes=boundedRead(join(this.root,'assets',hash+'.bin'),size*size)
    if (bytes.length!==size*size || keyBytes(bytes)!==hash) throw Error('Corrupt brush asset')
    return bytes
  }
  install(owner: string, library: BrushLibrary, assets: Map<string,Buffer>): BrushLibrary {
    return this.mutate(()=> {
      const next=merge(this.library('owners',owner),library)
      const total=next.assets.reduce((sum,a)=>sum+a.size*a.size,0)
      if (total>512*1024*1024) throw Error('Brush storage quota exceeded')
      for (const [hash,bytes] of assets) {
        if (keyBytes(bytes)!==hash) throw Error('Corrupt brush asset')
        const path=join(this.root,'assets',hash+'.bin')
        try { writeFileSync(path,bytes,{flag:'wx',mode:0o600}) } catch(e) { if ((e as NodeJS.ErrnoException).code!=='EEXIST') throw e; if (!boundedRead(path,bytes.length).equals(bytes)) throw Error('Immutable asset conflict') }
      }
      this.atomic(this.path('owners',owner),next); return next
    })
  }
  pin(room: string, owner: string, presets: string[], operator=empty()): void {
    this.mutate(()=> {
      const current=this.library('rooms',room)
      const has=(preset:string)=>current.brushes.some(b=>preset===b.descriptor.id || new RegExp('^brush:'+b.descriptor.id+'@'+b.descriptor.version+'(?::[a-z0-9-]+)*$').test(preset))
      if(presets.every(has)) return
      const available=merge(current,this.library('owners',owner),operator), selected=empty()
      for (const preset of [...new Set(presets)]) {
        const match=/^brush:(imported-[a-f0-9]+)@(\d+)(?::[a-z0-9-]+)*$/.exec(preset)
        const brush=available.brushes.find(b=>match ? b.descriptor.id===match[1] && b.descriptor.version===Number(match[2]) : b.descriptor.id===preset)
        if (!brush) throw Error('Brush unavailable')
        selected.brushes.push(brush)
      }
      const serialized=JSON.stringify(selected.brushes)
      selected.assets=available.assets.filter(a=>serialized.includes(a.id))
      for(const a of selected.assets) this.asset(a.id.slice(6),a.size)
      this.atomic(this.path('rooms',room),merge(current,selected))
    })
  }
  copy(source: string, target: string): void { this.mutate(()=>this.atomic(this.path('rooms',target),this.library('rooms',source))) }
}
function keyBytes(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex') }
let active: BrushStorage | undefined
let operatorLibrary=empty()
export function setBrushStorage(storage: BrushStorage, operator: BrushLibrary): void { active=storage; operatorLibrary=operator }
export function pinOperationBrush(room: string, user: string, op: {type: string; preset?: string}): void {
  if (op.type!=='stroke' || !op.preset || !/^(brush:)?imported-/.test(op.preset)) return
  if (!active) throw Error('Brush storage unavailable')
  active.pin(room,user,[op.preset],operatorLibrary)
}
export function copyRoomBrushes(source: string,target: string): void { active?.copy(source,target) }
