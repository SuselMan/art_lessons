import {expect,it} from 'vitest'
import {buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeComposition} from '@grafetto/shared'
import {SourceCanonicalFrameEncoder,type SourceCanonicalStrokeContext} from './sourceCanonicalFrameEncoder'
import {copySourceMaterialContext} from './sourceStrokeMaterialAdapter'
const asset='asset:'+'a'.repeat(64)
function context():SourceCanonicalStrokeContext{return{brush:'brush:encoder@1',strokeId:'gesture',pigmentRgb8:[11,22,33],
 composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.63,outerBlend:'over'},
 material:{assets:[{id:asset,size:1,x:0,y:0,width:1,height:1}],primaryAsset:asset,budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}}}}
function packed(c:SourceCanonicalStrokeContext,end=false){return buildCanonicalMaterial({masked:false,entry:{phase:'between'},
 draws:end?[]:[{recipe:{asset,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:1,height:1,mirrorH:false,mirrorV:false},role:'primary',x:0,y:0,opacity:.7,flow:.4}],
 fences:end?[{kind:'gestureEnd',at:0}]:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0}]},copySourceMaterialContext(c.material)).packed}
for(const outerBlend of ['over','multiply','lighten','colorDodge','overlay'] as const)it(`pins and emits explicit V2 ${outerBlend} through rejected bytes and terminal chunks`,()=>{
 const base=context(),c={...base,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,composition:{...base.composition,outerBlend}},bytes=packed(c),tail=packed(c,true)
 const encoder=new SourceCanonicalFrameEncoder(c)
 Reflect.set(c,'rasterProfile',CANONICAL_STROKE_RASTER_PROFILE);Reflect.set(c.composition,'outerBlend','over');Reflect.set(c.composition,'outerResourceOpacity',.1)
 expect(()=>encoder.encode(bytes.slice(0,-1))).toThrow();expect(encoder.nextFrameOrdinal).toBe(0)
 const frame=encoder.encode(bytes)
 expect(frame.envelope).toMatchObject({version:2,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,composition:{outerBlend,outerResourceOpacity:.63}})
 expect(frame.envelope.materialPacked).toBe(bytes)
 expect(()=>encoder.encode(bytes)).toThrow();expect(encoder.nextFrameOrdinal).toBe(1)
 expect(encoder.encode(tail).envelope.frameOrdinal).toBe(1);expect(encoder.ended).toBe(true)
})
it('retains default/explicit legacy envelopes exactly and refuses new composition without trusted V2',()=>{
 const c=context(),bytes=packed(c)
 const implicit=new SourceCanonicalFrameEncoder(c).encode(bytes).envelope
 const explicit=new SourceCanonicalFrameEncoder({...c,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}).encode(bytes).envelope
 expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));expect(implicit.version).toBe(1)
 const composition:CanonicalStrokeComposition={...c.composition,outerBlend:'multiply'}
 expect(()=>new SourceCanonicalFrameEncoder({...c,composition})).toThrow()
 expect(()=>new SourceCanonicalFrameEncoder({...c,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,composition:{...composition,mode:'buildup'}})).toThrow()
})
