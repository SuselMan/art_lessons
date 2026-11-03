import {canonicalSourceTipGradient} from './canonicalSourceTipGradient.js'
import {canonicalSourceMaterialTipGradient} from './canonicalMaterialCodec.js'
import {canonicalSourceColorFields,type CanonicalSourceColorFields} from './canonicalSourceSpatialColor.js'
import {canonicalSourceScale} from './canonicalSourceScale.js'
import {canonicalPrimaryGrainMaterialContext,buildCanonicalPrimaryGrainMaterial,unpackCanonicalPrimaryGrainMaterial,type CanonicalMaterialContextV8,type CanonicalMaterialFrameV8} from './canonicalMaterialCodec.js'
import {canonicalTextureGradientRGBA,type CanonicalTextureGradientRGBA,canonicalResolvedTexturePhase,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import {isCanonicalStrokeComposition,canonicalStrokeRasterContract,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeComposition,type CanonicalStrokeFrameEnvelope,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeSnapshotV1} from './canonicalStrokeOperation.js'
/** Named standalone DATA only. Neither public operation union nor execution permission. */
export interface CanonicalStrokeFrameContextV8 {
 readonly materialVersion:8;readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
 readonly brush:string;readonly strokeId:string;readonly frameOrdinal:number
 readonly pigmentRgb8:readonly[number,number,number];readonly composition:CanonicalStrokeComposition;readonly material:CanonicalMaterialContextV8
}
export type CanonicalPrimaryGrainFrameEnvelope=CanonicalStrokeFrameEnvelope&{readonly version:2;readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE;readonly texturePhase:CanonicalResolvedTexturePhase;readonly textureGradient?:CanonicalTextureGradientRGBA;readonly sourceColorFields?:CanonicalSourceColorFields}
export interface CanonicalStandaloneStrokeSnapshotV8 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'> {
 readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE;readonly materialVersion:8;readonly material:CanonicalMaterialContextV8
}
const fail=():never=>{throw new TypeError('Invalid standalone primary-grain8 DATA')}
function own(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
 const keys=Reflect.ownKeys(value);if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)))return fail()
 const out:Record<string,unknown>=Object.create(null)
 for(const k of names){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))return fail();out[k]=d.value}return out
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const ordinal=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER&&!Object.is(v,-0)
function rgb(value:unknown):readonly[number,number,number]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==4||value.length!==3)return fail()
 const channel=(i:number):number=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isInteger(d.value)||d.value<0||d.value>255)return fail();return d.value}
 return Object.freeze([channel(0),channel(1),channel(2)])
}
function composition(value:unknown,extended=false,browserHsy=false):Readonly<CanonicalStrokeComposition>{
 const p=own(value,['mode','alphaDarken','outerResourceOpacity','outerBlend'])
 if(!isCanonicalStrokeComposition(p,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,browserHsy)||(p.outerBlend==='colorHsyBrowser')!==browserHsy||!extended&&(p.mode!=='buildup'||p.outerBlend!=='over'))return fail()
 return Object.freeze({mode:p.mode,alphaDarken:p.alphaDarken,outerResourceOpacity:p.outerResourceOpacity,outerBlend:p.outerBlend})
}
export function decodeCanonicalPrimaryGrainStrokeFrame(value:unknown,trusted:CanonicalStrokeFrameContextV8):{readonly envelope:CanonicalPrimaryGrainFrameEnvelope;readonly frame:CanonicalMaterialFrameV8}{
 const t=own(trusted,['materialVersion','rasterProfile','brush','strokeId','frameOrdinal','pigmentRgb8','composition','material'])
 if(t.materialVersion!==8||t.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||!text(t.brush)||!text(t.strokeId)||!ordinal(t.frameOrdinal))return fail()
 const material=canonicalPrimaryGrainMaterialContext(t.material),pin=material.primarySource
 if(t.brush!=='brush:'+pin.descriptorId+'@'+pin.descriptorVersion)return fail()
 const expectedRgb=rgb(t.pigmentRgb8),expectedComposition=composition(t.composition,material.primaryTexture.law!=='hard-multiply-u8-native-v1',material.outerCompositionLaw!==undefined)
 const sourceTipGradient=canonicalSourceMaterialTipGradient(material)
 const sourceScale=material.scaledSource?canonicalSourceScale(pin.brushScale):undefined
 const textureGradient=material.primaryTexture.law==='pixel-color-texture-v1'&&material.primaryTexture.mode==='gradient'?material.primaryTexture.gradient:undefined
 const v=own(value,['version','rasterProfile','brush','strokeId','frameOrdinal','pigmentRgb8','composition','materialPacked','texturePhase',...sourceScale!==undefined?['sourceScale']:[],...textureGradient?['textureGradient']:[],...sourceTipGradient?['sourceTipGradient']:[],...material.sourceColorFields?['sourceColorFields']:[]])
 if(sourceScale!==undefined&&!Object.is(canonicalSourceScale(v.sourceScale),sourceScale))return fail()
 if(textureGradient){const actual=canonicalTextureGradientRGBA(v.textureGradient);if(actual.rgba.some((n,i)=>n!==textureGradient.rgba[i]))return fail()}
 if(sourceTipGradient&&JSON.stringify(canonicalSourceTipGradient(v.sourceTipGradient))!==JSON.stringify(sourceTipGradient))return fail()
 const sourceColorFields=material.sourceColorFields?canonicalSourceColorFields(v.sourceColorFields):undefined
 if(sourceColorFields&&JSON.stringify(sourceColorFields)!==JSON.stringify(material.sourceColorFields))return fail()
 const contract=canonicalStrokeRasterContract(t.rasterProfile)
 if(contract.envelopeVersion!==2||v.version!==2||v.rasterProfile!==t.rasterProfile||v.brush!==t.brush||v.strokeId!==t.strokeId||v.frameOrdinal!==t.frameOrdinal||!ordinal(v.frameOrdinal)||typeof v.materialPacked!=='string'||!v.materialPacked.startsWith('8|'))return fail()
 const pigmentRgb8=rgb(v.pigmentRgb8),savedComposition=composition(v.composition,material.primaryTexture.law!=='hard-multiply-u8-native-v1',material.outerCompositionLaw!==undefined)
 if(pigmentRgb8.some((n,i)=>n!==expectedRgb[i])||savedComposition.mode!==expectedComposition.mode||savedComposition.alphaDarken!==expectedComposition.alphaDarken||savedComposition.outerBlend!==expectedComposition.outerBlend||savedComposition.outerResourceOpacity!==expectedComposition.outerResourceOpacity)return fail()
 const texturePhase=canonicalResolvedTexturePhase(v.texturePhase,material.primaryTexture.width,material.primaryTexture.height)
 if(texturePhase.x!==material.primaryTexture.phase.x||texturePhase.y!==material.primaryTexture.phase.y)return fail()
 const frame=unpackCanonicalPrimaryGrainMaterial(v.materialPacked,material)
 Object.freeze(frame.entry)
 for(const records of[frame.definitions,frame.draws,frame.fences]){for(const record of records)Object.freeze(record);Object.freeze(records)}
 Object.freeze(frame)
 const envelope:CanonicalPrimaryGrainFrameEnvelope=Object.freeze({version:2,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,brush:t.brush,strokeId:t.strokeId,frameOrdinal:t.frameOrdinal,pigmentRgb8,composition:savedComposition,materialPacked:v.materialPacked,texturePhase,...sourceTipGradient?{sourceTipGradient}:{},...sourceColorFields?{sourceColorFields}:{},...textureGradient?{textureGradient}:{},...sourceScale!==undefined?{sourceScale}:{}})
 return Object.freeze({envelope,frame})
}
export function canonicalStandaloneStrokeSnapshotV8(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStandaloneStrokeSnapshotV8{
 const s=own(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
 if(s.materialVersion!==8||!ordinal(epoch)||s.boardEpoch!==epoch||Object.is(s.boardEpoch,-0)||rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||s.rasterProfile!==rasterProfile||!text(s.layerId)||!text(s.brush)||!text(s.strokeId))return fail()
 const material=canonicalPrimaryGrainMaterialContext(s.material),pin=material.primarySource
 if(s.brush!=='brush:'+pin.descriptorId+'@'+pin.descriptorVersion||s.descriptorSha256!==pin.descriptorSha256||Object.hasOwn(material,'expectedDrawCount')||Object.hasOwn(material,'expectedStrokeEnd'))return fail()
 const assets=s.assets
 if(!Array.isArray(assets)||Object.getPrototypeOf(assets)!==Array.prototype||assets.length!==material.assets.length||Reflect.ownKeys(assets).length!==material.assets.length+1)return fail()
 for(let i=0;i<material.assets.length;i++){const d=Object.getOwnPropertyDescriptor(assets,String(i));if(!d||!Object.hasOwn(d,'value'))return fail();const a=own(d.value,['id','size','x','y','width','height']);for(const k of ['id','size','x','y','width','height']as const)if(!Object.is(a[k],material.assets[i][k]))return fail()}
 const pigmentRgb8=rgb(s.pigmentRgb8),savedComposition=composition(s.composition,material.primaryTexture.law!=='hard-multiply-u8-native-v1',material.outerCompositionLaw!==undefined)
 const probe=buildCanonicalPrimaryGrainMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material)
 const parsed=decodeCanonicalPrimaryGrainStrokeFrame({version:2,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8,composition:savedComposition,materialPacked:probe.packed,texturePhase:material.primaryTexture.phase,...canonicalSourceMaterialTipGradient(material)?{sourceTipGradient:canonicalSourceMaterialTipGradient(material)}:{},...material.sourceColorFields?{sourceColorFields:material.sourceColorFields}:{},...material.primaryTexture.law==='pixel-color-texture-v1'&&material.primaryTexture.mode==='gradient'?{textureGradient:material.primaryTexture.gradient}:{},...material.scaledSource?{sourceScale:pin.brushScale}:{}},{materialVersion:8,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8,composition:savedComposition,material})
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:pin.descriptorSha256,rasterProfile,pigmentRgb8:parsed.envelope.pigmentRgb8,composition:parsed.envelope.composition,assets:material.assets,materialVersion:8,material})
}
