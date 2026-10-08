import {describe,it,expect} from 'vitest'
import {PaperWetness,wetDryMsFor,quantizeWet,dequantizeWet} from './paperWetness'
import {wetOverlayPixels,wetOverlayWorkspace} from './wetOverlayPixels'

describe('preview support is distinct from actual wetness and dose',()=>{
 it.each([0,.01,.03,.06,.1,1])('actual PaperWetness amount %s retains amplitude and expires',amount=>{
  const paper=new PaperWetness();paper.deposit('L',4,4,8,amount,0)
  expect(paper.sample('L',4,4,0)).toBeCloseTo(amount)
  expect(paper.anyWetNear('L',4,4,8,0)).toBe(amount>=.06)
  expect(paper.sample('L',4,4,wetDryMsFor(amount)*.9)).toBeCloseTo(amount*.1)
  expect(paper.sample('L',4,4,wetDryMsFor(amount)*1.1)).toBe(0)
  expect(dequantizeWet(quantizeWet(amount))).toBe(Math.round(amount*15)/15)
 })
 it('pending weak water is visible but not yet interaction wetness',()=>{
  const paper=new PaperWetness();paper.deposit('L',4,4,8,.03,0,true)
  expect(paper.sample('L',4,4,0)).toBe(0)
  expect(paper.raster(0,0,1,1,1,0)[0]).toBeCloseTo(.03)
  paper.commitPending(0);expect(paper.sample('L',4,4,0)).toBeCloseTo(.03)
  expect(paper.anyWetNear('L',4,4,8,0)).toBe(false)
  expect(quantizeWet(.03)).toBe('0')
 })
 it('display preserves weak amplitude, never turns positive support into full wetness',()=>{
  const cells=new Float32Array(25).fill(.01),pools=new Float32Array(25)
  const out=wetOverlayPixels(cells,pools,5,5,wetOverlayWorkspace(25));expect(out[12*4]).toBe(3);expect(out[12*4+3]).toBe(3)
  // CPU diagnostic model of Q8 area averaging, NOT a claimed GL reduction.
  const uniform=new Uint8Array(64).fill(1),isolated=new Uint8Array(64);isolated[0]=1
  const mean=(v:Uint8Array)=>Math.round(v.reduce((a,b)=>a+b,0)/v.length)
  expect(mean(uniform)).toBe(1);expect(mean(isolated)).toBe(0)
  const rawV=[1,0,0,1];expect(rawV[0]/rawV[3]).toBe(1);expect(4*rawV[3]/255).toBeLessThan(.02)
 })
})
