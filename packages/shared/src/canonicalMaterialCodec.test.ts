import { describe,expect,it } from 'vitest'
import {
  CANONICAL_MATERIAL_PROFILE as profile, assertPrimaryCanonicalMaterial, buildCanonicalMaterial,
  packCanonicalMaterial, unpackCanonicalMaterial, CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,
  type CanonicalMaterialContextV3, type CanonicalMaterialBuildInputV3,
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
it('V2 ordered image frames grant exact recipe assets without changing existing single-image bytes',()=>{
 const a={id:primary,size:8,x:0,y:0,width:8,height:8},b={...a,id:mask},source={kind:'image' as const,asset:primary,brushScale:1,brushAngle:0}
 const budget=context().budget,base={version:2 as const,assets:[a],primarySource:source,budget}
 const r={kind:'image' as const,...recipe({rotation:0,subY:0,width:8,height:8})}
 const input={masked:false,entry:{phase:'primary' as const,group:0},draws:[{recipe:r,role:'primary' as const,x:0,y:0,opacity:1,flow:1}],fences:[]}
 const old=buildCanonicalMaterial(input,base).packed,pipe={...base,assets:[a,b],primarySource:{...source,frames:[primary,mask,primary]}}
 expect(buildCanonicalMaterial(input,pipe).packed).toBe(old)
 expect(()=>buildCanonicalMaterial({...input,draws:[{...input.draws[0],recipe:{...r,asset:mask}}]},pipe)).not.toThrow()
 expect(()=>buildCanonicalMaterial({...input,draws:[{...input.draws[0],recipe:{...r,asset:mask}}]},{...base,assets:[a,b]})).toThrow()
})
it('does not invoke an inherited frame-list includes override to authorize an unpinned primary asset',()=>{
 const a={id:primary,size:8,x:0,y:0,width:8,height:8},b={...a,id:mask},frames=[primary,primary]
 let calls=0
 Object.setPrototypeOf(frames,Object.assign(Object.create(Array.prototype),{includes(){calls++;return true}}))
 const c={version:2 as const,assets:[a],primarySource:{kind:'image' as const,asset:primary,brushScale:1,brushAngle:0,frames},budget:context().budget}
 const r={kind:'image' as const,...recipe({rotation:0,subY:0,width:8,height:8})}
 const build=(asset:string)=>buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:{...r,asset},role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[]},c)
 expect(()=>build(primary)).not.toThrow()
 expect(()=>build(b.id)).toThrow()
 expect(calls).toBe(0)
})


// Actual a3e57b03c source-codec output captured BEFORE the V3 implementation.
const oldWireGoldens = {"v1":"1|Q01BVAEBAQABAAEAAAAAAAAAAAAAAAAAEREREREREREREREREREREREREREREREREREREREREREIAAgAAAAAAAAAAAAIAAgAAAAAAAAA8D8AAAAAAAAAAAAAAAAAAPA/AAAAAAAA8D8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwPwAAAAAAAPA/AAAAAA==","v2":"2|Q01BVAIBAQABAAEAAAAAAAAAAAAAAAAAEREREREREREREREREREREREREREREREREREREREREREIAAgAAAAAAAAAAAAIAAgAAAAAAAAA8D8AAAAAAAAAAAAAAAAAAPA/AAAAAAAA8D8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPA/AAAAAAAA8D8AAAAA"}
const textureContext=():CanonicalMaterialContextV3=>({version:3,
 assets:[{id:primary,size:8,x:0,y:0,width:8,height:8},{id:mask,size:8,x:0,y:0,width:4,height:4}],
 primarySource:{kind:'image',asset:primary,brushScale:1,brushAngle:0},
 primaryTexture:{kind:'canvasTexture',asset:mask,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},
 budget:context().budget})
const textureRecipe=()=>({kind:'image' as const,...recipe({rotation:0,subY:0,width:8,height:8})})
const textureInput=():Mutable<CanonicalMaterialBuildInputV3>=>({masked:false,entry:{phase:'between'},draws:[{recipe:textureRecipe(),role:'primary',x:1,y:2,opacity:.75,flow:.5,grainDepth:.25}],
 fences:[{at:0,kind:'segmentBegin',group:7},{at:1,kind:'primaryEnd',group:7},{at:1,kind:'segmentEnd',group:7},{at:1,kind:'gestureEnd'}]})
const textureBytes=(text:string)=>Uint8Array.from(atob(text.slice(2)),v=>v.charCodeAt(0))
const editTextureBytes=(packed:string,edit:(v:DataView,b:Uint8Array)=>void)=>{const b=textureBytes(packed);edit(new DataView(b.buffer),b);return'3|'+btoa(String.fromCharCode(...b))}

describe('staged unified CMAT3 primary texture codec; no wire/executor activation',()=>{
 it('preserves actual V1/V2 baseline golden bytes',()=>{
  const a={id:primary,size:8,x:0,y:0,width:8,height:8},r=textureRecipe(),{kind:_kind,...legacy}=r
  const input={masked:false,entry:{phase:'primary' as const,group:0},draws:[{recipe:legacy,role:'primary' as const,x:0,y:0,opacity:1,flow:1}],fences:[]}
  const c={...context(),assets:[a],primaryAsset:primary,maskAsset:undefined,preflightDefinition:()=>({workUnits:1,outputBytes:64})}
  const c2={version:2 as const,assets:[a],primarySource:{kind:'image' as const,asset:primary,brushScale:1,brushAngle:0},budget:c.budget}
  expect(buildCanonicalMaterial(input,c).packed).toBe(oldWireGoldens.v1)
  expect(buildCanonicalMaterial({...input,draws:[{...input.draws[0],recipe:r}]},c2).packed).toBe(oldWireGoldens.v2)
  expect(packCanonicalMaterial(unpackCanonicalMaterial(oldWireGoldens.v1,c),c)).toBe(oldWireGoldens.v1)
  expect(packCanonicalMaterial(unpackCanonicalMaterial(oldWireGoldens.v2,c2),c2)).toBe(oldWireGoldens.v2)
 })
 it('uses direct CMAT3 layout, exact roles, image96 definition and draw40 F64 scalar',()=>{
  const c=textureContext(),input=textureInput(),built=buildCanonicalMaterial(input,c),b=textureBytes(built.packed),v=new DataView(b.buffer)
  expect(built.packed.startsWith('3|')).toBe(true);expect(b.length).toBe(24+80+96+40+64)
  expect(Array.from(b.slice(0,8))).toEqual([67,77,65,84,3,0,2,0])
  expect(v.getUint16(8,true)).toBe(1);expect(v.getUint16(10,true)).toBe(1);expect(v.getUint16(12,true)).toBe(4)
  expect(Array.from(b.slice(24,56))).toEqual(Array(32).fill(0x11));expect(Array.from(b.slice(64,96))).toEqual(Array(32).fill(0x22))
  expect(v.getUint16(96,true)).toBe(4);expect(v.getUint16(98,true)).toBe(4)
  expect(Array.from(b.slice(104,108))).toEqual([0,0,0,0]);expect(Array.from(b.slice(168,200))).toEqual(Array(32).fill(0))
  expect(v.getInt32(204,true)).toBe(1);expect(v.getInt32(208,true)).toBe(2)
  expect(v.getFloat64(212,true)).toBe(.75);expect(v.getFloat64(220,true)).toBe(.5);expect(v.getUint32(228,true)).toBe(0);expect(v.getFloat64(232,true)).toBe(.25)
  expect(built.frame.profile).toBe(CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE)
  expect(unpackCanonicalMaterial(built.packed,c)).toEqual(built.frame);expect(packCanonicalMaterial(built.frame,c)).toBe(built.packed)
 })
 it('keeps grainDepth on DRAW, preserving negative zero and one geometry definition',()=>{
  const input=textureInput();input.draws=[-0,.5,1].map(grainDepth=>({...input.draws[0],grainDepth}));input.fences[1].at=3;input.fences[2].at=3;input.fences[3].at=3
  const out=buildCanonicalMaterial(input,textureContext()).frame
  expect(out.definitions).toHaveLength(1);expect(out.draws.map(d=>d.definition)).toEqual([0,0,0]);expect(Object.is(out.draws[0].grainDepth,-0)).toBe(true)
  expect(out.draws.slice(1).map(d=>d.grainDepth)).toEqual([.5,1]);expect(out.draws.map(d=>d.opacity)).toEqual([.75,.75,.75])
 })
 it('retains the two-role ledger even for empty baseline and phase2 structural suffix',()=>{
  for(const tail of [{masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]},
   {masked:false as const,entry:{phase:'mask' as const,group:7},draws:[],fences:[{at:0,kind:'segmentEnd' as const,group:7},{at:0,kind:'gestureEnd' as const}]}]){
   const built=buildCanonicalMaterial(tail,textureContext()),b=textureBytes(built.packed)
   expect(b[6]).toBe(2);expect(b.length).toBe(104+tail.fences.length*16);expect(built.frame.entry).toEqual(tail.entry);expect(built.frame.fences).toEqual(tail.fences)
  }
  const first=textureInput();first.fences=first.fences.slice(0,2)
  expect(buildCanonicalMaterial(first,textureContext()).frame.fences.at(-1)?.kind).toBe('primaryEnd')
 })
 it('refuses cross-version contexts, profiles and inserted new scalar on historical draws',()=>{
  const c=textureContext(),built=buildCanonicalMaterial(textureInput(),c),c2={version:2 as const,assets:[c.assets[0]],primarySource:c.primarySource,budget:c.budget}
  expect(()=>unpackCanonicalMaterial(built.packed,context())).toThrow();expect(()=>unpackCanonicalMaterial(built.packed,c2)).toThrow()
  expect(()=>unpackCanonicalMaterial(oldWireGoldens.v1,c)).toThrow();expect(()=>unpackCanonicalMaterial(oldWireGoldens.v2,c)).toThrow()
  expect(()=>packCanonicalMaterial(built.frame as unknown as CanonicalMaterialFrame,context())).toThrow()
  const old=frame();Object.assign(old.draws[0],{grainDepth:1});expect(()=>packCanonicalMaterial(old,context())).toThrow()
 })
 it('refuses masked execution, auto recipes and secondary/texture asset definitions',()=>{
  for(const mutate of [(i:Mutable<CanonicalMaterialBuildInputV3>)=>{Reflect.set(i,'masked',true)},(i:Mutable<CanonicalMaterialBuildInputV3>)=>{Reflect.set(i.draws[0],'role','mask')},(i:Mutable<CanonicalMaterialBuildInputV3>)=>{i.draws[0].recipe.asset=mask},(i:Mutable<CanonicalMaterialBuildInputV3>)=>{Reflect.set(i.draws[0].recipe,'kind','defaultAuto')}]){
   const i=textureInput();mutate(i);expect(()=>buildCanonicalMaterial(i,textureContext())).toThrow()
  }
 })
 it('bounds draw scalar, geometry costs, pixel sum and counts without a texture GPU grant',()=>{
  for(const grainDepth of [NaN,Infinity,-Infinity,-.001,1.001]){const i=textureInput();i.draws[0].grainDepth=grainDepth;expect(()=>buildCanonicalMaterial(i,textureContext())).toThrow()}
  for(const patch of [{workUnits:0},{outputBytes:0},{drawPixels:63}]){const c=textureContext();expect(()=>buildCanonicalMaterial(textureInput(),{...c,budget:{...c.budget,...patch}})).toThrow()}
  const i=textureInput();i.draws=Array.from({length:801},()=>i.draws[0]);expect(()=>buildCanonicalMaterial(i,textureContext())).toThrow()
  const c=textureContext();expect(()=>buildCanonicalMaterial(textureInput(),{...c,expectedDrawCount:0})).toThrow();expect(()=>buildCanonicalMaterial(textureInput(),{...c,expectedStrokeEnd:false})).toThrow()
 })
 it('rejects malformed binary header, definitions, grain, reserved fields, ledger roles and trailing data',()=>{
  const packed=buildCanonicalMaterial(textureInput(),textureContext()).packed
  const edits=[(v:DataView,b:Uint8Array)=>{b[4]=2},(_v:DataView,b:Uint8Array)=>{b[6]=1},(_v:DataView,b:Uint8Array)=>{b[7]=1},(v:DataView)=>v.setUint16(14,1,true),
   (_v:DataView,b:Uint8Array)=>{b[104]=1},(_v:DataView,b:Uint8Array)=>{b[105]=1},(_v:DataView,b:Uint8Array)=>{b[107]=1},(_v:DataView,b:Uint8Array)=>{b[168]=1},
   (_v:DataView,b:Uint8Array)=>{b[202]=1},(_v:DataView,b:Uint8Array)=>{b[203]=1},(v:DataView)=>v.setUint32(228,1,true),(v:DataView)=>v.setFloat64(232,NaN,true),(v:DataView)=>v.setFloat64(232,1.1,true),
   (v:DataView)=>v.setUint16(96,5,true),(_v:DataView,b:Uint8Array)=>{const first=b.slice(24,64);b.copyWithin(24,64,104);b.set(first,64)},(v:DataView)=>v.setUint16(10,801,true)]
  for(const edit of edits)expect(()=>unpackCanonicalMaterial(editTextureBytes(packed,edit),textureContext())).toThrow()
  expect(()=>unpackCanonicalMaterial(packed+'AAAA',textureContext())).toThrow()
  expect(()=>unpackCanonicalMaterial('3|'+btoa(String.fromCharCode(...textureBytes(packed).slice(0,-1))),textureContext())).toThrow()
 })
 it('rejects closed context extras, unmatched roles, sparse/accessor assets and getter payloads without executing them',()=>{
  const packed=buildCanonicalMaterial(textureInput(),textureContext()).packed
  for(const mutate of [(c:Mutable<CanonicalMaterialContextV3>)=>{Reflect.set(c,'maskSource',c.primarySource)},(c:Mutable<CanonicalMaterialContextV3>)=>{Reflect.set(c.primarySource,'frames',[primary,primary])},(c:Mutable<CanonicalMaterialContextV3>)=>{c.primaryTexture.asset=primary},(c:Mutable<CanonicalMaterialContextV3>)=>{c.assets.reverse()},(c:Mutable<CanonicalMaterialContextV3>)=>{Reflect.set(c.assets[0],'extra',1)},(c:Mutable<CanonicalMaterialContextV3>)=>{delete (c.assets as Partial<typeof c.assets>)[1]}]){
   const c=textureContext() as Mutable<CanonicalMaterialContextV3>;mutate(c);expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
  }
  let calls=0
  for(const objectKey of ['version','assets','primarySource','primaryTexture','budget']){
   const c=textureContext(),value=Reflect.get(c,objectKey);Object.defineProperty(c,objectKey,{get(){calls++;return value}})
   expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
  }
  const c=textureContext();Object.defineProperty(c.assets,'0',{get(){calls++;return c.assets[1]}});expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
  const input=textureInput();Object.defineProperty(input.draws[0],'grainDepth',{get(){calls++;return .5}});expect(()=>buildCanonicalMaterial(input,textureContext())).toThrow()
  const f=buildCanonicalMaterial(textureInput(),textureContext()).frame;Object.defineProperty(f.definitions[0],'width',{get(){calls++;return 8}});expect(()=>packCanonicalMaterial(f,textureContext())).toThrow()
  expect(calls).toBe(0)
 })
 it('rejects inherited version data/getters before consulting nested context payloads',()=>{
  const packed=buildCanonicalMaterial(textureInput(),textureContext()).packed
  let calls=0
  for(const prototype of [{version:3},Object.defineProperty({},'version',{get(){calls++;return 3}})]){
   const c=Object.create(prototype,Object.getOwnPropertyDescriptors(textureContext()));delete c.version
   Object.defineProperty(c,'assets',{get(){calls++;return textureContext().assets}})
   expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
  }
  for(const select of [(c:CanonicalMaterialContextV3)=>[c.primarySource,'asset'] as const,(c:CanonicalMaterialContextV3)=>[c.primaryTexture,'asset'] as const,(c:CanonicalMaterialContextV3)=>[c.budget,'workUnits'] as const,(c:CanonicalMaterialContextV3)=>[c.assets[0],'width'] as const]){
   const c=textureContext(),[object,key]=select(c),value=Reflect.get(object,key)
   Object.defineProperty(object,key,{get(){calls++;return value}})
   expect(()=>unpackCanonicalMaterial(packed,c)).toThrow()
  }
  expect(calls).toBe(0)
 })
})
