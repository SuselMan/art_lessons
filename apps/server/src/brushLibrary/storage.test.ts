import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { BrushStorage, empty, merge } from './storage.js'
const dirs:string[]=[]
function fixture() { const dir=mkdtempSync(join(tmpdir(),'brush-storage-')); dirs.push(dir); return {dir,storage:new BrushStorage(dir)} }
afterEach(()=>{for(const dir of dirs.splice(0)) rmSync(dir,{recursive:true,force:true})})
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
    const library=empty()
    library.assets.push({id:`asset:${hash}`,size:2,file:hash+'.bin'})
    library.brushes.push({name:'test',source:'test.abr',warnings:[],descriptor:{
      id:'imported-'+'a'.repeat(16),version:1,model:'stamp',category:'paint',
      tip:{kind:'bitmap',mask:`asset:${hash}`,hardness:1,aspect:1,rotation:'fixed',angle:0},
      paperInteraction:0,spacing:0.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,
      sizeByPressure:[[0,0],[1,1]],flowByPressure:[[0,0],[1,1]],opacityByPressure:[[0,0],[1,1]],
    }})
    storage.install('alice',library,new Map([[hash,bytes]]))
    const token='brush:'+library.brushes[0].descriptor.id+'@1'
    storage.pin('room','alice',[token]);storage.pin('room','bob',[token])
    storage.copy('room','fork')
    const restarted=new BrushStorage(dir)
    expect(restarted.library('rooms','fork')).toEqual(library)
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
