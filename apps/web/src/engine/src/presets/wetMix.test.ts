import { describe, expect, it } from 'vitest'
import type { BrushBehavior, Dab } from '@grafetto/shared'
import { wetMixStep, type WetMixState } from './wetMix'
const wet: NonNullable<BrushBehavior['wetMix']> = {dilution:0.3,charge:0.8,attack:0.7,pull:0.4,grade:0.5,blur:0.6,blurJitter:0.5,wetnessJitter:0.2}
const dabs:Dab[]=Array.from({length:40},(_,i)=>({x:20+i*4,y:30+i,size:30,pressure:0.4,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:i*8}))
describe('distance-driven wet pigment state',()=>{
 it('preserves charge and randomness through arbitrary operation chunk boundaries',()=>{
  const full={charge:1},expected=dabs.map((dab,i)=>wetMixStep(wet,full,dab,0.2,i===0))
  let chunk:WetMixState={charge:1};const actual=[]
  for(let start=0;start<dabs.length;start+=7){
   for(let i=start;i<Math.min(start+7,dabs.length);i++)actual.push(wetMixStep(wet,chunk,dabs[i],0.2,i===0))
   chunk=structuredClone(chunk)
  }
  expect(actual).toEqual(expected);expect(chunk).toEqual(full)
 })
 it('exhausts finite pigment with distance, independently of sample count',()=>{
  const once={charge:0.8},many={charge:0.8}
  wetMixStep(wet,once,dabs[1],10,false)
  for(let i=0;i<100;i++)wetMixStep(wet,many,dabs[1],0.1,false)
  expect(many.charge).toBeCloseTo(once.charge,12)
  expect(once.charge).toBeLessThan(0.001)
  const noPull={...wet,pull:0};const empty={charge:0}
  expect(wetMixStep(noPull,empty,dabs[0],1,false).strength).toBe(0)
 })
 it('loads only at touch down, permits pigment pickup after exhaustion, and never refills on empty canvas',()=>{
  const state={charge:1}
  expect(wetMixStep(wet,state,dabs[0],0,true).load).toBeGreaterThan(0)
  const end=wetMixStep(wet,state,dabs[1],100,false)
  expect(end.load).toBe(0);expect(end.pickup).toBeGreaterThan(0);expect(end.strength).toBeGreaterThan(0)
 })
 it('dilution weakens pigment, attack controls transfer and grade controls exhaustion',()=>{
  const prime=(changes:Partial<typeof wet>)=>wetMixStep({...wet,wetnessJitter:0,...changes},{charge:1},dabs[0],0,true)
  expect(prime({dilution:1}).load).toBeLessThan(prime({dilution:0}).load)
  expect(prime({attack:1}).strength).toBeGreaterThan(prime({attack:0}).strength)
  const soft={charge:0.8},hard={charge:0.8}
  wetMixStep({...wet,grade:0},soft,dabs[1],1,false);wetMixStep({...wet,grade:1},hard,dabs[1],1,false)
  expect(hard.charge).toBeLessThan(soft.charge)
 })
 it('jitter is bounded and tied to recorded dabs, never frame or clock',()=>{
  const steps=dabs.map(d=>wetMixStep(wet,{charge:1},d,0,true))
  expect(new Set(steps.map(s=>s.blur)).size).toBeGreaterThan(10)
  for(const s of steps)for(const value of Object.values(s)){expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1)}
  expect(wetMixStep(wet,{charge:1},{...dabs[0],t:999999},0,true)).toEqual(steps[0])
 })
})
