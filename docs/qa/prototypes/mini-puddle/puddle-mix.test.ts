import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../../../apps/web/src/engine/testing/engineTestUtils'
import {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
it('latches the broad-mix ablation and keeps fine diffusion and deposition commands',()=>{
 const traces=[]
 for(const skip of [false,true]){
  const {engine}=createTestEngine({paper:'flat'},{width:64,height:64}),e=engine as any
  engine.initLayer('L');const tile=e._ribbonScratchPool.acquire(64,64),scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true),preset='normal:100:69:PB15:round:wc@front8-detail-flow-v4'
  scratch.getOrCreate(tile);scratch.paints.add('0,0,1')
  scratch.noteFinish({target:e._layers.get('L'),preset:e._resolvePreset('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[0,0,1],opacity:1,bounds:{minX:0,minY:0,maxX:64,maxY:64},fieldSeed:[0,0],landedWet:1,wetPeak:1,radiusPx:16,dwellMs:0})
  expect(e._settlePlan.diagnosticSkipPuddleMix).toBe(false);e._settlePlan.diagnosticSkipPuddleMix=skip
  const pass=e._settlePlan.ctx.passes(),diffuse=vi.spyOn(pass,'diffuseStep'),field=vi.spyOn(pass,'fieldOp')
  const job=e._settlePlan.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:0,minY:0,maxX:64,maxY:64},.2,16,1,1,1,1)
  e._settlePlan.diagnosticSkipPuddleMix=false
  try{for(let i=0;i<job.ops.length;i++)job.ops[i]();traces.push({radii:diffuse.mock.calls.map(c=>c[8]),fields:field.mock.calls.length})}finally{job.dispose();diffuse.mockRestore();field.mockRestore();scratch.destroy();e._ribbonScratchPool.release(tile);engine.destroy()}
 }
 expect(traces[0].radii).toContain(32);expect(traces[0].radii).toContain(21)
 expect(traces[1].radii.some(r=>r>4)).toBe(false)
 expect(traces[1].radii).toContain(4);expect(traces[1].radii).toContain(1)
 expect(traces[1].fields).toBe(traces[0].fields)
})
