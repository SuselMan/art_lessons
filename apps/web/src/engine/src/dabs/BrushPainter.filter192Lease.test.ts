import {expect,it,vi} from 'vitest'
import {BrushPainter,type BrushContext} from './BrushPainter'
import {MockGL} from '../../testing/mockGL'
import {filter192,FILTER192_MASK} from '../../../../../../packages/shared/src/filterMask192.testFixture'
import {installBrushPixels} from '../presets/importedBrushes'
import type {BrushDescriptor} from '@grafetto/shared'
it.each(['procedural','bitmap'] as const)('actual constructor-installed192 %s lease callback preserves whole mixer descriptor after prewarm',kind=>{
 const b=filter192('invert',false);if(kind==='bitmap'){installBrushPixels(FILTER192_MASK,new Uint8Array(16).fill(64));b.tip={kind:'bitmap',mask:FILTER192_MASK,hardness:1,aspect:1,angle:0,rotation:'fixed',imageSampling:{kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:0,width:4,height:4}}}}
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),p=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);p.initGL()
 try{p.prepareFilterSmudge147(b);const callback=Reflect.get(Reflect.get(p,'behavior'),'leaseTextures')as(brush:BrushDescriptor,effectiveErase:boolean)=>()=>void,cache=Reflect.get(p,'textures'),leases=Reflect.get(cache,'leases')as Map<string,number>,count=leases.size,compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D');let release:(()=>void)|undefined
  try{expect(()=>{release=callback(b,false)}).not.toThrow();expect(leases.size).toBeGreaterThan(count);expect(b.model).toBe('mixer');expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()}finally{release?.()}
  expect(leases.size).toBe(count)
 }finally{p.destroy()}
})

// Genuine legacy147 payload under the whole195 host policy must use its actual
// STAMP mask consumer, independently of its serialized mixer model.
import fs from'node:fs'
import type{BrushLibrary}from'@grafetto/shared'
const native195=process.env.NATIVE195_LIBRARY?JSON.parse(fs.readFileSync(process.env.NATIVE195_LIBRARY,'utf8'))as BrushLibrary:undefined
it.skipIf(!native195)('prepares the actual default Filter195 stamp bank and protects its draw group without cold uploads',()=>{
 const b=native195!.brushes.find(r=>r.source==='host-default-filter.kpp')!.descriptor,before=JSON.stringify(b),gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),p=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);p.initGL()
 try{expect(b.filter).not.toHaveProperty('maskPolicy');p.prepareRecordedStampResources(b);p.prepareFilterSmudge147(b)
  const callback=Reflect.get(Reflect.get(p,'behavior'),'leaseTextures')as(brush:BrushDescriptor,effectiveErase:boolean)=>()=>void,cache=Reflect.get(p,'textures'),leases=Reflect.get(cache,'leases')as Map<symbol,unknown>,protect=Reflect.get(cache,'protect')as(keys:readonly string[])=>void,count=leases.size,compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D');let release:(()=>void)|undefined
  try{release=callback(b,false);expect(()=>Reflect.apply(protect,cache,[['g:cloud','g:grit']])).not.toThrow();expect(leases.size).toBeGreaterThan(count);expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(JSON.stringify(b)).toBe(before)}finally{release?.()}
  expect(leases.size).toBe(count)
 }finally{p.destroy()}
})
