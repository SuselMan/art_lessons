import {describe,it,expect,vi} from 'vitest'
import * as c from './canonicalMaterialCodec.js'
import {sourcePngRasterShape} from './sourcePngGeometry.js'
import {sourceImageTransformMetadata} from './sourceImageTransformMetadata.js'
const primary={id:'asset:'+'11'.repeat(32),size:256,x:18,y:18,width:220,height:220}
const pattern={id:'asset:'+'22'.repeat(32),size:512,x:0,y:0,width:307,height:307}
function raw(){return{version:8,assets:[{...primary},{...pattern}],primarySource:{kind:'image',asset:primary.id,brushScale:.181818,brushAngle:3.14159,descriptorId:'structural-image',descriptorVersion:1,descriptorSha256:'d'.repeat(64)},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'hard-multiply-u8-native-v1',width:307,height:307,periodX:307,periodY:307,phase:{kind:'resolved-stroke-phase-v1',x:306,y:1},strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}}}
const context=()=>c.canonicalPrimaryGrainMaterialContext(raw())
function recipe():c.CanonicalMaterialRecipe&{kind:'image'}{
 const brush={width:220,height:220,scale:.181818,angle:3.14159},shape=sourcePngRasterShape(brush,{scale:.5,ratio:1,rotation:.7}),m=sourceImageTransformMetadata(220,220,shape,0,.125)
 return{kind:'image',asset:primary.id,brushScale:brush.scale,brushAngle:brush.angle,scale:.5,ratio:1,rotation:.7,subX:0,subY:.125,width:m.width,height:m.height,mirrorH:false,mirrorV:false}
}
function input():c.CanonicalMaterialBuildInputV8{return{masked:false,entry:{phase:'between'},draws:[0,1,128,255].map((grainStrengthU8,i)=>({recipe:recipe(),role:'primary',x:-3+i,y:5,opacity:.73125,flow:.8125,grainStrengthU8})),fences:[{at:0,kind:'segmentBegin',group:1},{at:4,kind:'primaryEnd',group:1},{at:4,kind:'segmentEnd',group:1},{at:4,kind:'gestureEnd'}]}}
function change(packed:string,fn:(v:DataView,b:Uint8Array)=>void){const b=Uint8Array.from(atob(packed.slice(2)),x=>x.charCodeAt(0));fn(new DataView(b.buffer),b);return'8|'+btoa(String.fromCharCode(...b))}
describe('standalone image primary-grain8 DATA codec, no admission',()=>{
 it('uses same bounded layout and exact U8 F64 slot while preserving image geometry/order/fences',()=>{
  const ctx=context(),built=c.buildCanonicalPrimaryGrainMaterial(input(),ctx),f=c.unpackCanonicalPrimaryGrainMaterial(JSON.parse(JSON.stringify(built.packed)),ctx)
  expect(built.packed.startsWith('8|')).toBe(true);expect(f).toEqual(built.frame);expect(c.packCanonicalPrimaryGrainMaterial(f,ctx)).toBe(built.packed)
  expect(f.definitions).toHaveLength(1);expect(f.definitions[0]).toEqual(recipe());expect(f.draws.map(d=>d.grainStrengthU8)).toEqual([0,1,128,255]);expect(f.fences).toEqual(input().fences)
  const bytes=Uint8Array.from(atob(built.packed.slice(2)),x=>x.charCodeAt(0)),v=new DataView(bytes.buffer)
  expect([...bytes.slice(0,8)]).toEqual([67,77,65,84,8,0,2,0]);expect(bytes.length).toBe(24+2*40+96+4*40+4*16)
  for(let i=0;i<4;i++)expect(v.getFloat64(24+80+96+i*40+32,true)).toBe([0,1,128,255][i])
  const captured=c.captureCanonicalPrimaryGrainFrame(f,ctx);expect(Object.isFrozen(captured.draws[0])).toBe(true)
 })
 it('captures source identity and two original rectangles without exposing caller mutation',()=>{
  const source=raw(),ctx=c.canonicalPrimaryGrainMaterialContext(source);source.primarySource.descriptorSha256='e'.repeat(64);source.assets[0].x=0;source.primaryTexture.phase.x=0
  expect(ctx.primarySource.descriptorSha256).toBe('d'.repeat(64));expect(ctx.assets[0].x).toBe(18);expect(ctx.primaryTexture.phase.x).toBe(306)
  expect(Object.isFrozen(ctx.primarySource)).toBe(true);expect(Object.isFrozen(ctx.assets)).toBe(true)
  for(const mutate of [(x:ReturnType<typeof raw>)=>{x.assets.reverse()},(x:ReturnType<typeof raw>)=>{x.primaryTexture.periodX=512},(x:ReturnType<typeof raw>)=>{x.primarySource.descriptorSha256='bad'},(x:ReturnType<typeof raw>)=>{x.primarySource.brushAngle=-0},(x:ReturnType<typeof raw>)=>{x.assets[0].x=-0}]){const x=raw();mutate(x);expect(()=>c.canonicalPrimaryGrainMaterialContext(x)).toThrow()}
  const getter=vi.fn(()=>primary.id),x=raw();Object.defineProperty(x.primarySource,'asset',{get:getter});expect(()=>c.canonicalPrimaryGrainMaterialContext(x)).toThrow();expect(getter).not.toHaveBeenCalled()
  expect(()=>c.canonicalPrimaryGrainMaterialContext(Object.create(raw()))).toThrow()
 })
 it('rejects malformed S, foreign source and costs before frame acceptance',()=>{
  const ctx=context()
  for(const bad of [-0,-1,256,.5,NaN,Infinity]){const a=input();const draws=a.draws.map((d,i)=>i?d:{...d,grainStrengthU8:bad});expect(()=>c.buildCanonicalPrimaryGrainMaterial({...a,draws},ctx)).toThrow()}
  for(const budget of [{workUnits:0,outputBytes:16000000,drawPixels:16000000},{workUnits:64000000,outputBytes:0,drawPixels:16000000},{workUnits:64000000,outputBytes:16000000,drawPixels:0}])expect(()=>c.buildCanonicalPrimaryGrainMaterial(input(),{...ctx,budget})).toThrow()
  const a=input();expect(()=>c.buildCanonicalPrimaryGrainMaterial({...a,draws:a.draws.map(d=>({...d,recipe:{...d.recipe,asset:pattern.id}}))},ctx)).toThrow()
  const built=c.buildCanonicalPrimaryGrainMaterial(a,ctx)
  for(const bad of [-0,-1,256,.5,NaN,Infinity])expect(()=>c.unpackCanonicalPrimaryGrainMaterial(change(built.packed,v=>v.setFloat64(24+80+96+32,bad,true)),ctx)).toThrow()
  expect(()=>c.unpackCanonicalPrimaryGrainMaterial(change(built.packed,(_v,b)=>{b[24+80]=1}),ctx)).toThrow()
  expect(()=>c.unpackCanonicalPrimaryGrainMaterial(change(built.packed,(_v,b)=>{b[24+80+64]=1}),ctx)).toThrow()
  expect(()=>c.unpackCanonicalPrimaryGrainMaterial(change(built.packed,(_v,b)=>{b[4]=7}),ctx)).toThrow()
 })
 it('keeps legacy codec entrypoints closed to8 even through untyped JS invocation',()=>{
  const ctx=context(),built=c.buildCanonicalPrimaryGrainMaterial(input(),ctx)
  expect(()=>Reflect.apply(c.packCanonicalMaterial,null,[built.frame,ctx])).toThrow()
  expect(()=>Reflect.apply(c.unpackCanonicalMaterial,null,[built.packed,ctx])).toThrow()
  expect(()=>Reflect.apply(c.buildCanonicalMaterial,null,[input(),ctx])).toThrow()
 })
})

it('preserves fixed material3 and7 empty-frame wire goldens',()=>{
 const old3:c.CanonicalMaterialContextV3={version:3,assets:[primary,pattern],primarySource:{kind:'image',asset:primary.id,brushScale:.181818,brushAngle:3.14159},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:307,height:307,periodX:307,periodY:307,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}}
 const empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]}
 expect(c.buildCanonicalMaterial(empty,old3).packed).toBe("3|Q01BVAMAAgAAAAAAAAAAAAAAAAAAAAAAERERERERERERERERERERERERERERERERERERERERERHcANwAEgASACIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiMwEzAQAAAAA=")
 const old7=c.canonicalTexturedAutoMaterialContext({version:7,assets:[pattern],primarySource:{kind:'defaultAuto',descriptorId:'structural-auto',descriptorVersion:1,descriptorSha256:'d'.repeat(64),source:{kind:'defaultAuto',generator:'default',shape:'circle',diameter:10,ratio:1,horizontalFade:1,verticalFade:1,antialias:true,spikes:2,randomness:0,density:1},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1'},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:307,height:307,periodX:307,periodY:307,phase:{kind:'resolved-stroke-phase-v1',x:0,y:0},strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}})
 expect(c.buildCanonicalTexturedAutoMaterial(empty,old7).packed).toBe("7|Q01BVAcAAQAAAAAAAAAAAAAAAAAAAAAAIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIzATMBAAAAAA==")
})
