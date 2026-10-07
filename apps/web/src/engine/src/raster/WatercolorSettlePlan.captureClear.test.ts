import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { SettleField } from '../buffers/SettleField'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'

for (const reused of [false, true]) for (const radius of [8, 200]) for (const foreign of [false,true]) {
  it(`actual Plan never reads capture inputs before its own clear reused=${reused} radius=${radius} foreign=${foreign}`, () => {
    const {engine}=createTestEngine({paper:'flat'},{width:1024,height:1024})
    const e=engine as unknown as {_settlePlan:WatercolorSettlePlan;_ribbonScratchPool:RibbonScratchPool}
    const tile=e._ribbonScratchPool.acquire(1024,1024), scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true)
    scratch.filmBuffers(tile);scratch.paints.add('1,0,0');scratch.paints.add('0,0,1')
    if(foreign){const footprint={x:100,y:100,radius,aspect:1,angle:0};scratch.foreignSources=[{gesture:'earlier-water',footprints:[footprint]}];scratch.wetContacts=[footprint]}
    scratch.brushTravel.push({x:100,y:100,radius,aspect:1,angle:0,dx:20,dy:10,water:1})
    const plan=e._settlePlan
    const ctx=(plan as unknown as {ctx:{fieldFor(w:number,h:number,c?:boolean):SettleField}}).ctx
    const original=ctx.fieldFor.bind(ctx), restores:Array<()=>void>=[]
    let capture:ReturnType<WatercolorSettlePlan['prepare']>, reads=0, clears=0
    if(reused){capture=plan.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:80,minY:80,maxX:400,maxY:400},.2,radius,1,1,1,1);capture?.dispose()}
    const lookup=vi.spyOn(ctx,'fieldFor').mockImplementation((...args)=>{
      const f=original(...args)
      for(const b of [f.a,f.b,f.coverage,f.ca,f.cb]){
        let clean=false
        const clear=vi.spyOn(b,'clear').mockImplementation(()=>{clean=true;clears++;originalClear()})
        // Preserve actual GL clear; getter rejects every physical texture read before capture.
        const originalClear=Object.getPrototypeOf(b).clear.bind(b)
        const get=vi.spyOn(b,'texture','get').mockImplementation(()=>{expect(clean).toBe(true);reads++;return (b as unknown as {_texture:WebGLTexture})._texture})
        restores.push(()=>{clear.mockRestore();get.mockRestore()})
      }
      return f
    })
    try {
      capture=plan.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:80,minY:80,maxX:400,maxY:400},.2,radius,1,1,1,1)
      expect(capture).not.toBeNull();expect(reads).toBe(0);expect(clears).toBe(0)
      capture!.ops[0]();expect(clears).toBe(5);
      for(const op of capture!.ops.slice(1))op();capture!.finish();expect(reads).toBeGreaterThan(0)
      capture!.dispose()
    } finally {lookup.mockRestore();for(const restore of restores)restore();scratch.destroy();e._ribbonScratchPool.release(tile);engine.destroy()}
  })
}

it('default field callers still clear all ten; elision touches only exact reused dimensions',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64})
 const e=engine as unknown as {_diffuseFieldFor(w:number,h:number,c?:boolean):SettleField}
 const f=e._diffuseFieldFor(64,64),buffers=[f.a,f.b,f.c,f.coverage,f.ca,f.cb,f.cc,f.mask,f.pressure,f.band]
 const spies=buffers.map(b=>vi.spyOn(b,'clear'))
 try {
  expect(e._diffuseFieldFor(64,64,true)).toBe(f)
  expect(spies.map(s=>s.mock.calls.length)).toEqual([0,0,1,0,0,0,1,1,1,1])
  spies.forEach(s=>s.mockClear());e._diffuseFieldFor(64,64)
  expect(spies.map(s=>s.mock.calls.length)).toEqual(Array(10).fill(1))
  const changed=e._diffuseFieldFor(1537,512,true);expect(changed).not.toBe(f)
 } finally {spies.forEach(s=>s.mockRestore());engine.destroy()}
})

it('early refusal does not acquire a field; thrown prepare and dispose cannot prevent next ordinary reset',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64})
 const e=engine as unknown as {_settlePlan:WatercolorSettlePlan;_ribbonScratchPool:RibbonScratchPool}
 const plan=e._settlePlan,ctx=(plan as unknown as {ctx:{fieldFor(w:number,h:number,c?:boolean):SettleField;paperWorldSize():{w:number;h:number}}}).ctx
 const scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true),tile=e._ribbonScratchPool.acquire(64,64)
 const lookup=vi.spyOn(ctx,'fieldFor'),bounds={minX:20,minY:20,maxX:40,maxY:40},targets=[{buffer:tile,originX:0,originY:0,contentRect:null}]
 try {
  expect(plan.prepare(scratch,targets,bounds)).toBeNull();expect(lookup).not.toHaveBeenCalled()
  scratch.filmBuffers(tile)
  expect(plan.prepare(scratch,targets,{minX:-10000,minY:-10000,maxX:-9000,maxY:-9000})).toBeNull();expect(lookup).not.toHaveBeenCalled()
  const failure=vi.spyOn(ctx,'paperWorldSize').mockImplementation(()=>{throw Error('injected post-acquire failure')})
  expect(()=>plan.prepare(scratch,targets,bounds)).toThrow('injected post-acquire failure');failure.mockRestore()
  const field=lookup.mock.results.at(-1)!.value as SettleField
  const clear=vi.spyOn(field.a,'clear')
  ctx.fieldFor(field.w,field.h);expect(clear).toHaveBeenCalledOnce();clear.mockRestore()
  const p=plan.prepare(scratch,targets,bounds)!;expect(p).not.toBeNull();p.dispose()
  const reset=vi.spyOn(field.a,'clear');ctx.fieldFor(field.w,field.h);expect(reset).toHaveBeenCalledOnce();reset.mockRestore()
 } finally {lookup.mockRestore();scratch.destroy();e._ribbonScratchPool.release(tile);engine.destroy()}
})
