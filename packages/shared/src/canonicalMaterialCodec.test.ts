import { describe,expect,it } from 'vitest'
import {
  CANONICAL_MATERIAL_PROFILE as profile, assertPrimaryCanonicalMaterial, buildCanonicalMaterial,
  packCanonicalMaterial, unpackCanonicalMaterial,
  type CanonicalMaterialContext, type CanonicalMaterialFrame, type CanonicalMaterialRecipe,
} from './canonicalMaterialCodec.js'
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? {-readonly [K in keyof T]:Mutable<T[K]>} : T
const primary='asset:'+'1'.repeat(64),mask='asset:'+'2'.repeat(64)
const context=():CanonicalMaterialContext=>({assets:[{id:primary,size:32,x:0,y:0,width:24,height:12},{id:mask,size:32,x:0,y:0,width:32,height:16}],primaryAsset:primary,maskAsset:mask,
  budget:{workUnits:1000000,outputBytes:1000000,drawPixels:1000000},preflightDefinition:r=>({workUnits:1000,outputBytes:r.width*r.height})})
const recipe=(extra:Partial<CanonicalMaterialRecipe>={}):CanonicalMaterialRecipe=>({asset:primary,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:Math.PI/2,subX:0,subY:.125,width:24,height:12,mirrorH:false,mirrorV:false,...extra})
const frame=():Mutable<CanonicalMaterialFrame>=>({profile,masked:false,entry:{phase:'between'},definitions:[recipe()],draws:[{definition:0,role:'primary',x:10,y:20,opacity:.7567890123456789,flow:1}],fences:[{kind:'segmentBegin',at:0,group:7},{kind:'primaryEnd',at:1,group:7},{kind:'segmentEnd',at:1,group:7},{kind:'gestureEnd',at:1}]})
const mutate=(packed:string,edit:(v:DataView,bytes:Uint8Array)=>void):string=>{const raw=atob(packed.slice(2)),bytes=Uint8Array.from(raw,x=>x.charCodeAt(0));edit(new DataView(bytes.buffer),bytes);return '1|'+btoa(String.fromCharCode(...bytes))}

describe('closed canonical source material codec, not activated on the wire',()=>{
 it('roundtrips exact F64 geometry and render strengths through JSON opaque storage',()=>{
  const input=frame(),packed=packCanonicalMaterial(input,context()),stored=JSON.parse(JSON.stringify({canonicalMaterialPacked:packed}))
  expect(unpackCanonicalMaterial(stored.canonicalMaterialPacked,context())).toEqual(input)
  expect(packCanonicalMaterial(unpackCanonicalMaterial(packed,context()),context())).toBe(packed)
  expect(()=>assertPrimaryCanonicalMaterial(input,context())).not.toThrow()
  expect(atob(packed.slice(2)).slice(0,8)).toBe('CMAT\x01\x00\x01\x00')
 })
 it.each([0,-0,Math.PI/2,3.1415927410125732,3.141592741012573,Number.MIN_VALUE])('preserves admitted F64 bits %s independently of JSON number formatting',value=>{
  const f=frame();f.definitions[0]!.rotation=value;f.definitions[0]!.subX=Object.is(value,-0)?-0:0
  const restored=unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())
  expect(Object.is(restored.definitions[0]!.rotation,value)).toBe(true)
  expect(Object.is(restored.definitions[0]!.subX,Object.is(value,-0)?-0:0)).toBe(true)
 })
 it('canonicalizes integer negative zero, but not F64 negative zero',()=>{
  const f=frame();f.draws[0]!.x=-0;f.draws[0]!.flow=-0
  const restored=unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())
  expect(Object.is(restored.draws[0]!.x,0)).toBe(true);expect(Object.is(restored.draws[0]!.flow,-0)).toBe(true)
 })
 it('builds a cold cache-hit chunk from the saved continuous geometry with no prior lookup',()=>{
  const saved=recipe({scale:1.0000000000000002}),current=recipe({scale:1.0000000000000004})
  const input={masked:false,entry:{phase:'primary' as const,group:9},draws:[{recipe:saved,role:'primary' as const,x:100,y:30,opacity:1,flow:1},{recipe:saved,role:'primary' as const,x:101,y:30,opacity:1,flow:1}],fences:[{kind:'primaryEnd' as const,at:2,group:9},{kind:'segmentEnd' as const,at:2,group:9}]}
  const built=buildCanonicalMaterial(input,context()),cold=unpackCanonicalMaterial(JSON.parse(JSON.stringify(built.packed)),context())
  expect(cold.definitions).toHaveLength(1);expect(cold.definitions[0]!.scale).toBe(saved.scale);expect(cold.definitions[0]!.scale).not.toBe(current.scale)
  expect(cold.draws.map(d=>d.definition)).toEqual([0,0]);expect(built.frame).toEqual(cold)
  expect(built.frame.definitions[0]).not.toBe(saved)
 })
 it('does not merge recipes whose only difference is a signed-zero F64 channel',()=>{
  const input={masked:false,entry:{phase:'primary' as const,group:9},draws:[0,-0].map(rotation=>({recipe:recipe({rotation}),role:'primary' as const,x:0,y:0,opacity:1,flow:1})),fences:[]}
  const built=buildCanonicalMaterial(input,context())
  expect(built.frame.definitions).toHaveLength(2);expect(built.frame.draws.map(d=>d.definition)).toEqual([0,1])
 })
 it('preserves primary pass then empty mask and explicit end fences without fake dabs',()=>{
  const f=frame();f.masked=true
  const out=unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())
  expect(out.draws).toHaveLength(1);expect(out.fences.map(f=>f.kind)).toEqual(['segmentBegin','primaryEnd','segmentEnd','gestureEnd'])
  expect(()=>assertPrimaryCanonicalMaterial(out,context())).toThrow()
 })
 it('structurally admits masked records with role-bound assets, while execution rejects them',()=>{
  const f=frame();f.masked=true;f.definitions.push(recipe({asset:mask,width:32,height:16}));f.draws.push({...f.draws[0]!,definition:1,role:'mask'})
  f.fences[2]={kind:'segmentEnd',at:2,group:7};f.fences[3]={kind:'gestureEnd',at:2}
  const out=unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())
  expect(out.draws.map(d=>d.role)).toEqual(['primary','mask']);expect(()=>assertPrimaryCanonicalMaterial(out,context())).toThrow()
  f.draws[1]!.definition=0;expect(()=>packCanonicalMaterial(f,context())).toThrow()
 })
 it('preserves a mid-primary fragment and the following all-dabs-claimed zero-record finish tail',()=>{
  const first=frame();first.fences=[{kind:'segmentBegin',at:0,group:7}]
  const firstOut=unpackCanonicalMaterial(packCanonicalMaterial(first,context()),context())
  expect(firstOut.fences).toHaveLength(1)
  const tail:CanonicalMaterialFrame={profile,masked:false,entry:{phase:'primary',group:7},definitions:[],draws:[],fences:[{kind:'primaryEnd',at:0,group:7},{kind:'segmentEnd',at:0,group:7},{kind:'gestureEnd',at:0}]}
  const tailOut=unpackCanonicalMaterial(packCanonicalMaterial(tail,{...context(),expectedDrawCount:0,expectedStrokeEnd:true}),context())
  expect(tailOut.draws).toEqual([]);expect(tailOut.fences).toEqual(tail.fences)
  expect(()=>assertPrimaryCanonicalMaterial(tailOut,context())).not.toThrow()
 })
 it('preserves a primary-only cut after primaryEnd and admits its zero-dab suffix fences',()=>{
  const first=frame();first.fences=[{kind:'segmentBegin',at:0,group:7},{kind:'primaryEnd',at:1,group:7}]
  expect(()=>assertPrimaryCanonicalMaterial(unpackCanonicalMaterial(packCanonicalMaterial(first,context()),context()),context())).not.toThrow()
  const tail:CanonicalMaterialFrame={profile,masked:false,entry:{phase:'mask',group:7},definitions:[],draws:[],fences:[{kind:'segmentEnd',at:0,group:7},{kind:'gestureEnd',at:0}]}
  const out=unpackCanonicalMaterial(packCanonicalMaterial(tail,context()),context())
  expect(out.fences).toEqual(tail.fences);expect(()=>assertPrimaryCanonicalMaterial(out,context())).not.toThrow()
 })
 it('preserves a mid-mask fragment with zero-record completion and no guessed begin',()=>{
  const f:CanonicalMaterialFrame={profile,masked:true,entry:{phase:'mask',group:Number.MAX_SAFE_INTEGER},definitions:[],draws:[],fences:[{kind:'segmentEnd',at:0,group:Number.MAX_SAFE_INTEGER},{kind:'gestureEnd',at:0}]}
  expect(unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())).toEqual(f)
  expect(()=>assertPrimaryCanonicalMaterial(f,context())).toThrow()
 })
 it('rejects reordered/missing phase fences, mismatched groups and premature outer finish',()=>{
  for(const change of [(f:Mutable<CanonicalMaterialFrame>)=>{f.fences[1]={kind:'segmentEnd',at:1,group:7}},(f:Mutable<CanonicalMaterialFrame>)=>{f.fences[1]={kind:'primaryEnd',at:1,group:8}},(f:Mutable<CanonicalMaterialFrame>)=>{f.fences[3]={kind:'gestureEnd',at:0}},(f:Mutable<CanonicalMaterialFrame>)=>{f.fences[0]={kind:'segmentBegin',at:0,group:Number.MAX_SAFE_INTEGER+1}},(f:Mutable<CanonicalMaterialFrame>)=>{f.draws[0]!.role='mask'}]){
   const f=frame();change(f);expect(()=>packCanonicalMaterial(f,context())).toThrow()
  }
  expect(()=>packCanonicalMaterial(frame(),{...context(),expectedStrokeEnd:false})).toThrow()
  expect(()=>packCanonicalMaterial(frame(),{...context(),expectedDrawCount:2})).toThrow()
 })
 it('bounds empty boundary-only tails relative to real draw count',()=>{
  const f:CanonicalMaterialFrame={profile,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:0,group:0},{kind:'segmentEnd',at:0,group:0},{kind:'gestureEnd',at:0}]}
  expect(unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context())).toEqual(f)
  expect(()=>packCanonicalMaterial({...f,fences:[...f.fences,{kind:'gestureEnd',at:0}]},context())).toThrow()
 })
 it.each([NaN,Infinity,-Infinity])('rejects nonfinite F64 %s before encoding',value=>{
  const f=frame();f.definitions[0]!.rotation=value;expect(()=>packCanonicalMaterial(f,context())).toThrow()
 })
 it('rejects invalid sizes, phases, world placement and unsupported profile',()=>{
  for(const extra of [{width:4097},{height:0},{width:2048,height:1024},{subX:1},{scale:0},{ratio:101},{asset:'https://client.invalid/image'}]){
   const f=frame();f.definitions[0]=recipe(extra);expect(()=>packCanonicalMaterial(f,context())).toThrow()
  }
  const f=frame();f.draws[0]!.x=1e8;expect(()=>packCanonicalMaterial(f,context())).toThrow()
  expect(()=>packCanonicalMaterial({...frame(),profile:'auto' as typeof profile},context())).toThrow()
 })
 it('rejects duplicate/unused or non-first-use dictionary definitions',()=>{
  const f=frame();f.definitions.push(recipe());expect(()=>packCanonicalMaterial(f,context())).toThrow()
  const g=frame();g.definitions.push(recipe({rotation:1}));g.draws.push({...g.draws[0]!,definition:1});g.draws[0]!.definition=1;expect(()=>packCanonicalMaterial(g,context())).toThrow()
 })
 it('binds CAS original dimensions and role assets to trusted context',()=>{
  const packed=packCanonicalMaterial(frame(),context())
  expect(()=>unpackCanonicalMaterial(packed,{...context(),assets:[{id:mask,size:32,x:0,y:0,width:24,height:12}],primaryAsset:mask,maskAsset:undefined})).toThrow()
  expect(()=>unpackCanonicalMaterial(packed,{...context(),assets:[{id:primary,size:32,x:0,y:0,width:12,height:24}],maskAsset:undefined})).toThrow()
  expect(()=>unpackCanonicalMaterial(packed,{...context(),primaryAsset:mask})).toThrow()
 })
 it('preflights aggregate estimated work/output and repeated draw pixels independently',()=>{
  const f=frame(),packed=packCanonicalMaterial(f,context())
  expect(()=>unpackCanonicalMaterial(packed,{...context(),budget:{...context().budget,workUnits:999}})).toThrow()
  expect(()=>unpackCanonicalMaterial(packed,{...context(),budget:{...context().budget,outputBytes:287}})).toThrow()
  expect(()=>unpackCanonicalMaterial(packed,{...context(),budget:{...context().budget,drawPixels:287}})).toThrow()
  for(const value of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER])expect(()=>unpackCanonicalMaterial(packed,{...context(),preflightDefinition:()=>({workUnits:value,outputBytes:288})})).toThrow()
 })
 it('rejects malformed raw lengths/counts/reserved bits/noncanonical base64 before a callback',()=>{
  const packed=packCanonicalMaterial(frame(),context());let calls=0
  const c={...context(),preflightDefinition:(...args:Parameters<CanonicalMaterialContext['preflightDefinition']>)=>{calls++;return context().preflightDefinition(...args)}}
  for(const bad of ['2|'+packed.slice(2),packed+'=',packed.slice(0,-1),packed+'\n','1|'+'A'.repeat(262144),
   mutate(packed,(v)=>v.setUint16(10,801,true)),mutate(packed,(v)=>v.setUint16(12,65535,true)),mutate(packed,(v)=>v.setUint16(14,1,true)),mutate(packed,(_,b)=>{b[5]=3})]){
   expect(()=>unpackCanonicalMaterial(bad,c)).toThrow()
  }
  expect(calls).toBe(0)
 })
 it('rejects reserved body bytes, invalid dictionary references and nonfinite stored doubles',()=>{
  const packed=packCanonicalMaterial(frame(),context()),def=24+40,draw=def+64,fence=draw+32
  for(const bad of [mutate(packed,(_,b)=>{b[def+1]=4}),mutate(packed,(v)=>v.setUint32(24+36,1,true)),mutate(packed,(v)=>v.setUint16(draw,1,true)),mutate(packed,(v)=>v.setUint32(draw+28,1,true)),mutate(packed,(v)=>v.setFloat64(def+40,Infinity,true)),mutate(packed,(v)=>v.setFloat64(fence+4,-0,true))])expect(()=>unpackCanonicalMaterial(bad,context())).toThrow()
 })
 it('bounds800real draws and rejects801 before trusted recipe callbacks',()=>{
  const f=frame();f.draws=Array.from({length:800},()=>({...f.draws[0]!}));f.fences=[{kind:'segmentBegin',at:0,group:1},{kind:'primaryEnd',at:800,group:1},{kind:'segmentEnd',at:800,group:1}]
  expect(unpackCanonicalMaterial(packCanonicalMaterial(f,context()),context()).draws).toHaveLength(800)
  let calls=0;f.draws.push({...f.draws[0]!})
  expect(()=>packCanonicalMaterial(f,{...context(),preflightDefinition:r=>{calls++;return{workUnits:1000,outputBytes:r.width*r.height}}})).toThrow()
  expect(calls).toBe(0)
 })
 it('stops at the aggregate cost violation without planning subsequent definitions',()=>{
  const f=frame();f.definitions=[recipe({rotation:1}),recipe({rotation:2}),recipe({rotation:3})];f.draws=[0,1,2].map(definition=>({...f.draws[0]!,definition}));f.fences=[{kind:'segmentBegin',at:0,group:1},{kind:'primaryEnd',at:3,group:1},{kind:'segmentEnd',at:3,group:1}]
  const packed=packCanonicalMaterial(f,context());let calls=0
  expect(()=>unpackCanonicalMaterial(packed,{...context(),budget:{...context().budget,workUnits:1500},preflightDefinition:r=>{calls++;return{workUnits:1000,outputBytes:r.width*r.height}}})).toThrow()
  expect(calls).toBe(2)
 })
 it('rejects alternate base64 pad bits although decoded bytes would be identical',()=>{
  const packed=packCanonicalMaterial(frame(),context()),bad=packed.slice(0,-2)+'B='
  expect(atob(bad.slice(2))).toBe(atob(packed.slice(2)))
  expect(()=>unpackCanonicalMaterial(bad,context())).toThrow()
 })

 it('binds the source rectangle inside its padded CAS square before estimated work',()=>{
  const c=context(),cropped={...c,assets:c.assets.map(a=>a.id===primary?{...a,x:3,y:5}:a)}
  const packed=packCanonicalMaterial(frame(),cropped)
  expect(unpackCanonicalMaterial(packed,cropped).definitions[0]!.asset).toBe(primary)
  let calls=0
  expect(()=>unpackCanonicalMaterial(packed,{...c,preflightDefinition:r=>{calls++;return{workUnits:1,outputBytes:r.width*r.height}}})).toThrow()
  expect(calls).toBe(0)
  expect(()=>packCanonicalMaterial(frame(),{...c,assets:c.assets.map(a=>a.id===primary?{...a,x:9}:a)})).toThrow()
 })

})


it('binds incremental image frame roles to an explicit bounded list rather than every available asset',()=>{
 const c=context(),f=frame();f.definitions[0]=recipe({asset:mask,width:32,height:16})
 expect(()=>packCanonicalMaterial(f,c)).toThrow()
 const pipe={...c,primaryImageFrames:[primary,mask,primary]}
 const packed=packCanonicalMaterial(f,pipe)
 expect(unpackCanonicalMaterial(packed,pipe)).toEqual(f)
 expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
 for(const frames of [[],[primary],[mask,primary],[primary,'asset:'+'3'.repeat(64)],Array(257).fill(primary)])expect(()=>packCanonicalMaterial(f,{...c,primaryImageFrames:frames})).toThrow()
 // A secondary frame is not implicitly authorized as the mask role.
 f.masked=true;f.draws[0].role='mask';f.definitions[0]=recipe()
 expect(()=>packCanonicalMaterial(f,pipe)).toThrow()
})
