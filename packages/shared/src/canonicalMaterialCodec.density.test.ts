import {describe,it,expect,expectTypeOf} from 'vitest'
import type {CanonicalSoftAutoRecipe} from './canonicalSoftAutoMaterial.js'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import {isBrushLibrary} from './brushes.js'
import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,canonicalStrokeCoverageMatches,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_RASTER_PROFILE as V1,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoSourceBinding,canonicalDefaultAutoSourcePin,canonicalDefaultAutoStatic,canonicalDefaultAutoCost,canonicalGaussianAutoSourcePin,type CanonicalDefaultAutoRecipe} from './canonicalDefaultAutoMaterial.js'
import {extractDefaultAutoSourceDataCapability,extractSeededDensityDefaultAutoSourceDataCapability} from './canonicalBrushCapability.js'
import {buildCanonicalMaterial,unpackCanonicalMaterial,type CanonicalMaterialContextV2,type CanonicalMaterialBuildInputV2} from './canonicalMaterialCodec.js'

const source={kind:'defaultAuto',generator:'default',shape:'rect',diameter:8,ratio:.5,horizontalFade:.9,verticalFade:.9,antialias:false,spikes:2,randomness:0,density:.8} as const
const pin=(density=.8)=>canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:'density-test',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{...source,density},brushScale:1,brushAngle:0,coverageProfile:D})
const recipe=(density=.8):CanonicalDefaultAutoRecipe=>({kind:'defaultAuto',source:{...source,density},coverageProfile:D,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:4,mirrorH:false,mirrorV:false})
const context=(density=.8):CanonicalMaterialContextV2=>({version:2,assets:[],primarySource:pin(density),budget:{workUnits:64,outputBytes:128,drawPixels:32}})
const input=(r=recipe()):CanonicalMaterialBuildInputV2=>({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:r,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[]})
const mutate=(p:string,fn:(b:Uint8Array)=>void)=>{const b=Uint8Array.from(atob(p.slice(2)),x=>x.charCodeAt(0));fn(b);return '2|'+btoa(String.fromCharCode(...b))}
describe('inactive seeded default-auto density contract',()=>{
 it('retains the exact pre-density soft recipe type domain',()=>{
  expectTypeOf<CanonicalSoftAutoRecipe['coverageProfile']>().toEqualTypeOf<'scalar-f64-fma-v1'|'neon64-f32-fma-v1'|'browser-number-coverage-v1'>()
 })
 it('preserves density in trusted primary source and new packed code4 without new fields',()=>{
  for(const density of [0,.8,1]){
   const c=context(density),built=buildCanonicalMaterial(input(recipe(density)),c)
   expect(atob(built.packed.slice(2)).charCodeAt(25)).toBe(4)
   expect(unpackCanonicalMaterial(built.packed,c)).toEqual(built.frame)
   const d=built.frame.definitions[0];expect(d.kind==='defaultAuto'&&d.source.density).toBe(density)
   expect(Object.isFrozen(pin(density).source)).toBe(true)
  }
  expect(canonicalStrokeCoverageMatches(G,D)).toBe(true)
  expect(canonicalStrokeCoverageMatches(V1,D)).toBe(false);expect(canonicalStrokeCoverageMatches(B,D)).toBe(false)
 })
 it('keeps old extraction/static profiles closed while new data-only extraction retains original source',()=>{
  const library:unknown={schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor:structuredClone(stock.rows[0].descriptor),name:'source',source:'fixture',warnings:[]}]}
  if(!isBrushLibrary(library))throw Error('invalid fixture library')
  const descriptor=library.brushes[0].descriptor
  if(descriptor.sourceStamp?.version!==2||descriptor.sourceStamp.source.kind!=='defaultAuto')throw Error('fixture')
  const original=descriptor.sourceStamp,originalSource=descriptor.sourceStamp.source
  descriptor.sourceStamp={...original,source:{...originalSource,density:.8}}
  expect(extractDefaultAutoSourceDataCapability(descriptor).supported).toBe(false)
  const result=extractSeededDensityDefaultAutoSourceDataCapability(descriptor)
  expect(result.supported&&result.data.source.density).toBe(.8)
  expect(result.supported&&result.rasterReady).toBe(false)
  expect(canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),D,G).source.density).toBe(.8)
  for(const coverage of ['scalar-f64-fma-v1','neon64-f32-fma-v1','browser-number-coverage-v1'] as const)
   expect(()=>canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),coverage,coverage==='browser-number-coverage-v1'?B:G)).toThrow()
  expect(()=>canonicalDefaultAutoStatic(source,1,0)).toThrow()
 })
 it('charges the additional pass before caps and rejects density mismatch or malformed source',()=>{
  expect(canonicalDefaultAutoCost(recipe(),pin())).toEqual({workUnits:64,outputBytes:128})
  expect(canonicalDefaultAutoCost(recipe(1),pin(1))).toEqual({workUnits:32,outputBytes:128})
  expect(()=>buildCanonicalMaterial(input(),{...context(),budget:{workUnits:63,outputBytes:128,drawPixels:32}})).toThrow()
  const two={...input(),draws:[...input().draws,...input().draws]}
  expect(()=>buildCanonicalMaterial(two,{...context(),budget:{workUnits:127,outputBytes:256,drawPixels:64}})).toThrow()
  expect(buildCanonicalMaterial(two,{...context(),budget:{workUnits:128,outputBytes:256,drawPixels:64}}).frame.definitions).toHaveLength(1)
  expect(()=>canonicalDefaultAutoCost(recipe(.7),pin())).toThrow()
  for(const density of [NaN,-.1,1.1])expect(()=>pin(density)).toThrow()
  expect(()=>canonicalDefaultAutoSourcePin({...pin(),source:{...source,randomness:.1}})).toThrow()
  const largeSource={...source,diameter:700,ratio:650/700,antialias:true,density:1}
  const largeRecipe={...recipe(1),source:largeSource,width:700,height:650,coverageProfile:'neon64-f32-fma-v1' as const}
  const largePin={...pin(1),source:largeSource,coverageProfile:'neon64-f32-fma-v1' as const}
  expect(canonicalDefaultAutoCost(largeRecipe,largePin).workUnits).toBe(16380000)
  expect(()=>canonicalDefaultAutoCost({...largeRecipe,coverageProfile:D,source:{...largeSource,density:.8}},
    {...largePin,coverageProfile:D,source:{...largeSource,density:.8}})).toThrow('work capacity')
  // Malformed runtime data must not widen the Gaussian numeric profile.
  expect(()=>canonicalGaussianAutoSourcePin({...pin(),kind:'gaussianAuto',source:{...source,kind:'gaussianAuto',generator:'gauss',shape:'circle'}} as never)).toThrow()
 })
 it('rejects mask, missing/wrong trusted source and malformed packed coverage before inference',()=>{
  const c=context(),p=buildCanonicalMaterial(input(),c).packed
  expect(()=>unpackCanonicalMaterial(p,{...c,maskSource:c.primarySource})).toThrow()
  expect(()=>buildCanonicalMaterial({...input(),masked:true},c)).toThrow()
  expect(()=>buildCanonicalMaterial({...input(),draws:[{...input().draws[0],role:'mask'}]},c)).toThrow()
  expect(()=>unpackCanonicalMaterial(p,{...c,primarySource:{...pin(1),coverageProfile:'neon64-f32-fma-v1'}})).toThrow()
  for(const fn of [(b:Uint8Array)=>{b[24]=3},(b:Uint8Array)=>{b[24]=4},(b:Uint8Array)=>{b[27]=1},(b:Uint8Array)=>{b[25]=5}])
   expect(()=>unpackCanonicalMaterial(mutate(p,fn),c)).toThrow()
 })
})
