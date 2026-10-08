import {describe,it,expect} from 'vitest'
import {WetBrushMomentSourceSeam} from './wetBrushMomentSourceSeam'
import type {CanonicalWatercolorWebGpu} from '../webgpuCanonical/backend'
describe('DEV ordinary source integration safety',()=>{
 it('OFF does not inspect source ownership or allocate/encode anything',()=>{const device=new Proxy({},{get(){throw Error('GPU access')}}) as GPUDevice;const backend={device} as CanonicalWatercolorWebGpu;const seam=new WetBrushMomentSourceSeam(backend);const result=seam.encodeAfterLanding(null as never,null as never,false);expect(result.buffers).toEqual([]);expect(result.invalid).toBe(null);expect(()=>result.release()).not.toThrow()})
 it('rejects non-current film before touching source or pool leases',()=>{const backend={device:{}} as CanonicalWatercolorWebGpu;const tile={owner:backend,height:1024},e={inkLoad:{},inkColor:{},filmGesture:3};const scratch={peek:()=>e,pool:new Proxy({},{get(){throw Error('Lease accessed')}})};const seam=new WetBrushMomentSourceSeam(backend);expect(()=>seam.encodeAfterLanding(null as never,{scratch,tile,segment:{rect:[0,0,400,400],film:true},availableWater:{owner:backend},materialGesture:4,recipe:{}} as never,true)).toThrow('initialized current film')})
})

describe('DEV positive source ownership and continuation',()=>{
 function fixture(failThird=false){
  const events:string[]=[],backend={device:{},encodePreparedStamp:()=>{events.push('currentCoverage');return[]}} as unknown as CanonicalWatercolorWebGpu
  type Field={name:string;owner:CanonicalWatercolorWebGpu;height:number;width:number;texture:{values:number[]};field:object;clear():void;copyTo(dest:Field):void}
  const field=(name:string,values=[0,0,0,0]):Field=>({name,owner:backend,height:4,width:4,texture:{values:values.slice()},field:{},clear(){events.push('clear:'+name);this.texture.values.fill(0)},copyTo(dest:Field){events.push(name+'→'+dest.name);dest.texture.values=this.texture.values.slice()}})
  const tile=field('tile'),entry={inkLoad:field('inkLoad',[0,0,90,100]),inkColor:field('inkColor',[20,30,40,90]),inkBase:field('inkBase',[0,0,20,100]),colorBase:field('colorBase',[1,2,3,20]),strokeInk:field('strokeInk',[0,0,70,100]),strokeColor:field('strokeColor',[19,28,37,70]),filmGesture:7};let acquireCount=0
  const scratch={peek:()=>entry,pool:{acquire(){acquireCount++;events.push('acquire:'+acquireCount);if(failThird&&acquireCount===3)throw Error('third lease failed');return field('lease'+acquireCount)},release(f:Field){events.push('release:'+f.name)}}}
  const operator={encode(_encoder:unknown,input:{outputPigment:GPUTexture;outputColor:GPUTexture}){events.push('transport');(input.outputPigment as unknown as {values:number[]}).values=[0,0,75,100];(input.outputColor as unknown as {values:number[]}).values=[15,25,35,75];return{buffers:[],invalid:null,pairPasses:4}}}
  const seam=new WetBrushMomentSourceSeam(backend,operator as never),input={scratch,tile,segment:{rect:[0,0,4,4],film:true,commands:[{phase:'coverage',kind:'stamp',stamp:{}}]},availableWater:field('water'),materialGesture:7,recipe:{}}
  return{seam,input,entry,events}
 }
 it('routes immutable current coverage, transport, source copies and film rebase in that order',()=>{const f=fixture(),r=f.seam.encodeAfterLanding(null as never,f.input as never,true);expect(f.events.slice(3)).toEqual(['clear:lease1','currentCoverage','transport','lease2→inkLoad','lease3→inkColor','inkLoad→inkBase','inkColor→colorBase','clear:strokeInk','clear:strokeColor']);expect(f.entry.inkBase.texture.values).toEqual([0,0,75,100]);expect(f.entry.colorBase.texture.values).toEqual([15,25,35,75]);expect(f.entry.filmGesture).toBe(7)
  // Actual mode1 is base+film: a subsequent small MAX film starts from the
  // transported base, not the previous source total 90.
  f.entry.strokeInk.texture.values=[0,0,5,5];const next=f.entry.inkBase.texture.values.map((v,i)=>Math.min(255,v+f.entry.strokeInk.texture.values[i]));expect(next[2]).toBe(80);expect(next[2]).not.toBe(95);r.release();r.release();expect(f.events.filter(x=>x.startsWith('release:'))).toEqual(['release:lease1','release:lease2','release:lease3'])})
 it('in-place candidate acquires only contact and defers all film bookkeeping until counter validation',()=>{const f=fixture(),r=f.seam.encodeAfterLanding(null as never,{...f.input,diagnosticInPlace:true} as never,true);expect(f.events).toEqual(['acquire:1','clear:lease1','currentCoverage','transport']);expect(f.entry.inkLoad.texture.values[2]).toBe(75);expect(f.entry.inkBase.texture.values[2]).toBe(20);expect(f.entry.strokeInk.texture.values[2]).toBe(70);r.release();expect(f.events.at(-1)).toBe('release:lease1')})
 it('rolls back both known leases when third acquire throws before any draw',()=>{const f=fixture(true);expect(()=>f.seam.encodeAfterLanding(null as never,f.input as never,true)).toThrow('third lease');expect(f.events).toEqual(['acquire:1','acquire:2','acquire:3','release:lease1','release:lease2'])})
})
