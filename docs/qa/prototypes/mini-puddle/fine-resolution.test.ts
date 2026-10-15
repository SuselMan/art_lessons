import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../../../apps/web/src/engine/testing/engineTestUtils'
import { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'

it('changes field sampling without changing the world domain and stays opt-in',()=>{
 const domains=[]
 for(const force of [false,true]){
  const {engine}=createTestEngine({paper:'flat'}, {width:1024,height:1024}),p=engine as any
  engine.initLayer('L');const tile=p._ribbonScratchPool.acquire(1024,1024),scratch=new RibbonStrokeScratch(p._ribbonScratchPool,true,true),preset='normal:100:69:PB15:round:wc@front8-detail-flow-v4'
  scratch.getOrCreate(tile);scratch.paints.add('0,0,1')
  scratch.noteFinish({target:p._layers.get('L'),preset:p._resolvePreset('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[0,0,1],opacity:1,bounds:{minX:0,minY:0,maxX:1024,maxY:1024},fieldSeed:[0,0],landedWet:1,wetPeak:1,radiusPx:90,dwellMs:0})
  expect(p._settlePlan.diagnosticFullResolution).toBe(false);p._settlePlan.diagnosticFullResolution=force
  const spy=vi.spyOn(p._settlePlan.ctx,'fieldFor'),job=p._settlePlan.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:0,minY:0,maxX:1024,maxY:1024},.2,90,1,1,1,1)
  try{expect(spy.mock.calls[0].slice(0,3)).toEqual(force?[1024,1024,1]:[512,512,2]);domains.push(job.compositeDomain)}finally{job.dispose();spy.mockRestore();scratch.destroy();p._ribbonScratchPool.release(tile);engine.destroy()}
 }
 expect(domains[0]).toEqual(domains[1])
})
