import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrushStorage, empty, merge } from './storage.js'
const dirs:string[]=[]
function fixture() { const dir=mkdtempSync(join(tmpdir(),'brush-storage-')); dirs.push(dir); return {dir,storage:new BrushStorage(dir)} }
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const dir of dirs.splice(0)) rmSync(dir,{recursive:true,force:true})})
describe('persistent private brush resources',()=> {
  it('persists bytes and owner manifests across restart without exposing other owners',()=> {
    const {dir,storage}=fixture(), bytes=Buffer.from([1,2,3,4]), hash=createHash('sha256').update(bytes).digest('hex')
    const library=empty(); library.assets.push({id:`asset:${hash}`,size:2,file:hash+'.bin'})
    storage.install('alice',library,new Map([[hash,bytes]]))
    const restarted=new BrushStorage(dir)
    expect(restarted.library('owners','alice')).toEqual(library)
    expect(restarted.library('owners','bob')).toEqual(empty())
    expect(restarted.asset(hash,2)).toEqual(bytes)
  })
  it('rejects mutated bytes and symlink assets',()=> {
    const {dir,storage}=fixture(), hash='a'.repeat(64)
    writeFileSync(join(dir,'private'),'secrets')
    symlinkSync(join(dir,'private'),join(dir,'assets',hash+'.bin'))
    expect(()=>storage.asset(hash,2)).toThrow()
    expect(()=>storage.asset('../private',2)).toThrow()
  })
  it('pins versioned resources durably and preserves them in a fork',()=> {
    const {dir,storage}=fixture(),bytes=Buffer.from([1,2,3,4]),hash=createHash('sha256').update(bytes).digest('hex')
    const secondFrame=Buffer.from([4,3,2,1]),secondHash=createHash('sha256').update(secondFrame).digest('hex')
    const library=empty()
    library.assets.push({id:`asset:${hash}`,size:2,file:hash+'.bin'})
    library.assets.push({id:`asset:${secondHash}`,size:2,file:secondHash+'.bin'})
    library.brushes.push({name:'test',source:'test.abr',warnings:[],descriptor:{
      id:'imported-'+'a'.repeat(16),version:1,model:'stamp',category:'paint',
      tip:{kind:'bitmap',mask:`asset:${hash}`,animation:{mode:'incremental',frames:[`asset:${hash}`,`asset:${secondHash}`]},hardness:1,aspect:1,rotation:'fixed',angle:0},
      paperInteraction:0,spacing:0.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,
      sizeByPressure:[[0,0],[1,1]],flowByPressure:[[0,0],[1,1]],opacityByPressure:[[0,0],[1,1]],
    }})
    storage.install('alice',library,new Map([[hash,bytes],[secondHash,secondFrame]]))
    const token='brush:'+library.brushes[0].descriptor.id+'@1'
    storage.pin('room','alice',[token]);storage.pin('room','bob',[token])
    storage.copy('room','fork')
    const restarted=new BrushStorage(dir)
    expect(restarted.library('rooms','fork')).toEqual(library)
    expect(restarted.asset(secondHash,2)).toEqual(secondFrame)
    expect(()=>restarted.pin('other-room','bob',[token])).toThrow('unavailable')
  })
  it('does not record an unavailable brush and copies exact room references',()=> {
    const {storage}=fixture()
    expect(()=>storage.pin('room','alice',['brush:imported-aaaa@1'])).toThrow('Brush unavailable')
    expect(storage.library('rooms','room')).toEqual(empty())
    storage.copy('room','fork'); expect(storage.library('rooms','fork')).toEqual(empty())
  })
  it('recovers only a proven dead writer lock and applies the global disk quota',()=> {
    const {dir,storage}=fixture()
    mkdirSync(join(dir,'.write-lock'));writeFileSync(join(dir,'.write-lock','pid'),'2147483647')
    expect(storage.mutate(()=>42)).toBe(42)
    expect(()=>storage.ensureCapacity(5*1024*1024*1024)).toThrow('quota')
  })
  it('serializes writes and keeps path identities opaque',()=> {
    const {storage}=fixture()
    expect(()=>storage.mutate(()=>storage.mutate(()=>undefined))).toThrow()
    expect(storage.path('owners','../../private')).toMatch(/owners\/[a-f0-9]{64}\.json$/)
    expect(merge(empty(),empty())).toEqual(empty())
  })
})


function resource(seed: number, letter: string) {
  const bytes = Buffer.from([seed, seed + 1, seed + 2, seed + 3])
  const hash = createHash('sha256').update(bytes).digest('hex')
  const library = empty()
  library.assets.push({ id: `asset:${hash}`, size: 2, file: hash + '.bin' })
  library.brushes.push({ name: 'Authored CAS', source: 'qa', warnings: [], descriptor: {
    id: 'imported-' + letter.repeat(16), version: 1, model: 'stamp', category: 'paint',
    tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
    paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
    sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
  } })
  return { bytes, hash, library, assets: new Map([[hash, bytes]]), token: `brush:imported-${letter.repeat(16)}@1` }
}

describe('CAS-only operator provisioning', () => {
  it('preserves archive and old room pins byte-for-byte while making new operator resources pinnable', () => {
    const { storage } = fixture(), old = resource(1, 'a'), next = resource(5, 'b')
    storage.install('__operator__', old.library, old.assets)
    storage.pin('old-room', '__operator__', [old.token])
    const archive = readFileSync(storage.path('owners', '__operator__'))
    const room = readFileSync(storage.path('rooms', 'old-room'))
    storage.provision(next.assets)
    expect(readFileSync(storage.path('owners', '__operator__'))).toEqual(archive)
    expect(readFileSync(storage.path('rooms', 'old-room'))).toEqual(room)
    storage.pin('new-room', 'alice', [next.token], next.library)
    expect(storage.library('rooms', 'new-room')).toEqual(next.library)
    expect(storage.asset(next.hash, 2)).toEqual(next.bytes)
    expect(storage.asset(old.hash, 2)).toEqual(old.bytes)
  })

  it('charges zero additional bytes for verified existing CAS and only new bytes for a mixed batch', () => {
    const { storage } = fixture(), old = resource(1, 'a'), next = resource(5, 'b')
    storage.provision(old.assets)
    const quota = vi.spyOn(storage, 'ensureCapacity')
    storage.provision(old.assets)
    expect(quota).toHaveBeenLastCalledWith(0)
    storage.provision(new Map([...old.assets, ...next.assets]))
    expect(quota).toHaveBeenLastCalledWith(next.bytes.length)
    expect(existsSync(storage.path('owners', '__operator__'))).toBe(false)
  })

  it('preflights corrupt batches and rejects quota without writing new CAS or changing the archive', () => {
    const { storage, dir } = fixture(), old = resource(1, 'a'), next = resource(5, 'b')
    storage.install('__operator__', old.library, old.assets)
    const archive = readFileSync(storage.path('owners', '__operator__'))
    expect(() => storage.provision(new Map([...next.assets, ['a'.repeat(64), Buffer.from([0, 0, 0, 0])]]))).toThrow('Corrupt')
    expect(existsSync(join(dir, 'assets', next.hash + '.bin'))).toBe(false)
    vi.stubEnv('GRAFETTO_BRUSH_STORAGE_QUOTA_BYTES', '1')
    expect(() => storage.provision(next.assets)).toThrow('quota')
    expect(readFileSync(storage.path('owners', '__operator__'))).toEqual(archive)
    expect(readdirSync(join(dir, 'assets'))).toEqual([old.hash + '.bin'])
  })

  it('refuses corrupt or symlinked existing CAS instead of replacing immutable files', () => {
    const { storage, dir } = fixture(), next = resource(5, 'b')
    const path = join(dir, 'assets', next.hash + '.bin')
    writeFileSync(path, Buffer.from([0, 0, 0, 0]))
    expect(() => storage.provision(next.assets)).toThrow('Immutable asset conflict')
    expect(readFileSync(path)).toEqual(Buffer.from([0, 0, 0, 0]))
    rmSync(path); writeFileSync(join(dir, 'private'), next.bytes); symlinkSync(join(dir, 'private'), path)
    expect(() => storage.provision(next.assets)).toThrow()
    expect(readFileSync(join(dir, 'private'))).toEqual(next.bytes)
  })
})


describe('rendering identity versus import metadata', () => {
  it('merges revised diagnostics with first-source metadata without changing inputs', () => {
    const old = resource(1, 'a').library, current = structuredClone(old)
    current.brushes[0].name = 'Updated label'
    current.brushes[0].source = 'updated.abr'
    current.brushes[0].warnings = ['Revised conversion diagnostics']
    const before = JSON.stringify(old)
    expect(merge(current, old).brushes[0]).toEqual(current.brushes[0])
    expect(JSON.stringify(old)).toBe(before)
    const reordered = structuredClone(current)
    reordered.brushes[0].descriptor = Object.fromEntries(Object.entries(reordered.brushes[0].descriptor).reverse()) as typeof reordered.brushes[0]['descriptor']
    expect(merge(current, reordered).brushes).toHaveLength(1)
  })

  it('updates owner metadata while preserving pinned rooms byte-for-byte across restart', () => {
    const { dir, storage } = fixture(), original = resource(1, 'a'), additional = resource(5, 'b')
    storage.install('alice', original.library, original.assets)
    storage.pin('room', 'alice', [original.token])
    const pin = readFileSync(storage.path('rooms', 'room'))
    const revised = structuredClone(original.library)
    revised.brushes[0].warnings = ['New metadata only']
    storage.install('alice', revised, original.assets)
    expect(storage.library('owners', 'alice')).toEqual(revised)
    expect(readFileSync(storage.path('rooms', 'room'))).toEqual(pin)
    storage.provision(additional.assets)
    storage.pin('room', 'alice', [original.token, additional.token], merge(revised, additional.library))
    const restarted = new BrushStorage(dir)
    expect(restarted.library('rooms', 'room').brushes[0]).toEqual(original.library.brushes[0])
    expect(restarted.library('rooms', 'room').brushes).toHaveLength(2)
  })

  it('rejects changed historical descriptors during merge, install and room pin without writes', () => {
    const { storage } = fixture(), original = resource(1, 'a'), additional = resource(5, 'b')
    storage.install('alice', original.library, original.assets)
    storage.pin('room', 'alice', [original.token])
    const changed = structuredClone(original.library)
    changed.brushes[0].descriptor.flow = .5
    expect(() => merge(changed, original.library)).toThrow('Immutable brush conflict')
    const ownerBefore = readFileSync(storage.path('owners', 'alice'))
    const pinBefore = readFileSync(storage.path('rooms', 'room'))
    expect(() => storage.install('alice', changed, original.assets)).toThrow('Immutable brush conflict')
    expect(() => storage.pin('room', 'alice', [additional.token], merge(changed, additional.library))).toThrow('Immutable brush conflict')
    expect(readFileSync(storage.path('owners', 'alice'))).toEqual(ownerBefore)
    expect(readFileSync(storage.path('rooms', 'room'))).toEqual(pinBefore)
  })
})


it('compares JSON rendering semantics across signed-zero serialization and nested settings', () => {
  const authored = resource(1, 'a').library
  authored.brushes[0].descriptor.tip.angle = -0
  authored.brushes[0].descriptor.scatter = { count: 1, radius: -0, scale: 1, sizeJitter: 0, angleJitter: -0, flowJitter: 0 }
  const pinned = JSON.parse(JSON.stringify(authored)) as typeof authored
  expect(Object.is(authored.brushes[0].descriptor.tip.angle, -0)).toBe(true)
  expect(Object.is(pinned.brushes[0].descriptor.tip.angle, -0)).toBe(false)
  pinned.brushes[0].descriptor = Object.fromEntries(Object.entries(pinned.brushes[0].descriptor).reverse()) as typeof pinned.brushes[0]['descriptor']
  expect(merge(authored, pinned).brushes).toHaveLength(1)
  const changed = structuredClone(pinned)
  changed.brushes[0].descriptor.scatter!.angleJitter = .01
  expect(() => merge(authored, changed)).toThrow('Immutable brush conflict')
})
