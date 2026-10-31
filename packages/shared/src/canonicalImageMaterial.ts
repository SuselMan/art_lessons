import type {BrushDescriptor} from './brushes.js'
import {extractCanonicalSinglePngCapability} from './canonicalBrushCapability.js'
import {buildCanonicalMaterial,canonicalImageFrameIds,CANONICAL_MATERIAL_LIMITS,type CanonicalMaterialImageSource,type CanonicalMaterialAsset} from './canonicalMaterialCodec.js'
const fail=():never=>{throw new TypeError('Invalid canonical primary image material')}
/** Closed OWN data capture before the existing codec validates numbers/geometry.
 * No pixels, descriptor provenance, CAS verification or execution grant. */
function capture(value:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return fail()
 const copy:Record<string,unknown>=Object.create(null)
 for(const field of fields){const d=Object.getOwnPropertyDescriptor(value,field);if(!d||!Object.hasOwn(d,'value'))return fail();copy[field]=d.value}
 return copy
}
export function canonicalImageMaterialPin(source:unknown,assets:unknown):Readonly<{primarySource:CanonicalMaterialImageSource;assets:readonly CanonicalMaterialAsset[]}>{
 if(!Array.isArray(assets)||assets.length<1||assets.length>256)return fail()
 const frameField=source&&typeof source==='object'?Object.getOwnPropertyDescriptor(source,'frames'):undefined
 const s=capture(source,frameField?['kind','asset','brushScale','brushAngle','frames']:['kind','asset','brushScale','brushAngle'])
 const arrayKeys=Reflect.ownKeys(assets)
 if(arrayKeys.length!==assets.length+1||arrayKeys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))return fail()
 const captured=Array.from({length:assets.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(assets,String(i));if(!d||!Object.hasOwn(d,'value'))return fail()
  return capture(d.value,['id','size','x','y','width','height'])
 })
 const a=captured[0]
 // Only these bounded scalar fields reach codec validation; no attacker extras
 // or source array are copied/stringified/retained.
 if(s.kind!=='image'||typeof s.asset!=='string'||s.asset.length!==70||typeof a.id!=='string'||a.id.length!==70
  ||typeof s.brushScale!=='number'||typeof s.brushAngle!=='number'||['size','x','y','width','height'].some(k=>typeof a[k]!=='number'))return fail()
 // JSON source metadata cannot preserve negative zero. Refuse it only at
 // this new V2 image boundary; historical V1 data/bytes are untouched.
 if([s.brushScale,s.brushAngle,a.size,a.x,a.y,a.width,a.height].some(v=>Object.is(v,-0)))return fail()
 const ids=new Set<string>()
 for(const a of captured){if(typeof a.id!=='string'||ids.has(a.id))return fail();ids.add(a.id)}
 if(captured.some(a=>typeof a.id!=='string'||['size','x','y','width','height'].some(k=>typeof a[k]!=='number'||Object.is(a[k],-0))))return fail()
 const frames=frameField?canonicalImageFrameIds(s.frames,s.asset,ids):undefined
 if(!frames&&assets.length!==1)return fail()
 const primarySource=Object.freeze({kind:'image' as const,asset:s.asset,brushScale:s.brushScale,brushAngle:s.brushAngle,...frames?{frames}:{}})
 const normalized=Object.freeze(captured.map(a=>Object.freeze({id:a.id as string,size:a.size as number,x:a.x as number,y:a.y as number,width:a.width as number,height:a.height as number})))
 buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},{version:2,primarySource,assets:normalized,budget:CANONICAL_MATERIAL_LIMITS})
 return Object.freeze({primarySource,assets:normalized})
}
/** Structural binding from already verified descriptor/CAS metadata. Caller
 * still owns ROOM descriptor origin, SHA validation, permission and policy. */
export function canonicalImageSourceBinding(descriptor:BrushDescriptor,asset:{readonly id:string;readonly size:number}):ReturnType<typeof canonicalImageMaterialPin>{
 const result=extractCanonicalSinglePngCapability(descriptor,asset)
 if(!result.supported)return fail()
 const c=result.capability
 return canonicalImageMaterialPin({kind:'image',asset:c.asset.id,brushScale:c.brushScale,brushAngle:c.brushAngle},[c.asset])
}
