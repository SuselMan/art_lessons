import {canonicalTexturedAutoMaterialContext,buildCanonicalTexturedAutoMaterial,type CanonicalMaterialContextV7} from './canonicalMaterialCodec.js'
import {decodeCanonicalTexturedAutoStrokeFrame,canonicalStrokeCoverageMatches,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeSnapshotV1} from './canonicalStrokeOperation.js'
export interface CanonicalStandaloneStrokeSnapshotV7 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'>{readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE|typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE;readonly materialVersion:7;readonly material:CanonicalMaterialContextV7}
const fail=():never=>{throw new TypeError('Invalid standalone textured-Auto snapshot')}
function own(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
 const keys=Reflect.ownKeys(value);if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)))return fail()
 const out:Record<string,unknown>=Object.create(null)
 for(const k of names){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))return fail();out[k]=d.value}return out
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
export function canonicalStandaloneStrokeSnapshotV7(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStandaloneStrokeSnapshotV7{
 const s=own(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
 if(s.materialVersion!==7||!Number.isSafeInteger(epoch)||epoch<0||Object.is(epoch,-0)||s.boardEpoch!==epoch||s.rasterProfile!==rasterProfile
   ||rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE||!text(s.layerId)||!text(s.brush)||!text(s.strokeId))return fail()
 const material=canonicalTexturedAutoMaterialContext(s.material),pin=material.primarySource
 if(s.brush!=='brush:'+pin.descriptorId+'@'+pin.descriptorVersion||s.descriptorSha256!==pin.descriptorSha256||!canonicalStrokeCoverageMatches(rasterProfile,pin.coverageProfile)||Object.hasOwn(material,'expectedDrawCount')||Object.hasOwn(material,'expectedStrokeEnd'))return fail()
 const assets=s.assets
 if(!Array.isArray(assets)||Object.getPrototypeOf(assets)!==Array.prototype||Reflect.ownKeys(assets).length!==2||assets.length!==1)return fail()
 const ad=Object.getOwnPropertyDescriptor(assets,'0');if(!ad||!Object.hasOwn(ad,'value'))return fail()
 const a=own(ad.value,['id','size','x','y','width','height']);for(const k of ['id','size','x','y','width','height']as const)if(!Object.is(a[k],material.assets[0][k]))return fail()
 const rgb=s.pigmentRgb8;if(!Array.isArray(rgb)||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4||rgb.length!==3)return fail()
 const pigmentRgb8=Object.freeze([0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(rgb,String(i));if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>255)return fail();return d.value})) as unknown as readonly[number,number,number]
 const composition=own(s.composition,['mode','alphaDarken','outerResourceOpacity','outerBlend'])
 const probe=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material)
 // The named decoder is the one owner of closed composition/envelope equality.
 const parsed=decodeCanonicalTexturedAutoStrokeFrame({version:2,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8,composition,materialPacked:probe.packed,texturePhase:material.primaryTexture.phase},{materialVersion:7,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8,composition:composition as unknown as CanonicalStandaloneStrokeSnapshotV7['composition'],material})
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:pin.descriptorSha256,rasterProfile,pigmentRgb8:parsed.envelope.pigmentRgb8,composition:parsed.envelope.composition,assets:material.assets,materialVersion:7,material})
}
