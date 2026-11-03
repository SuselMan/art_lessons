import type {BrushDescriptor} from './brushes.js'
/** Captured paint-input DATA; never a brush/BEGIN or CAS verification grant. */
export interface CanonicalSourcePatternResource {
 readonly kind:'source-pattern-rgba8-v1';readonly channels:readonly[string,string,string];readonly alphaAsset:string
 readonly size:number;readonly x:number;readonly y:number;readonly width:number;readonly height:number;readonly periodX:number;readonly periodY:number
}
export type CanonicalSourceSpatialColor={readonly kind:'total-random-rgb8-hash-v1'}|{readonly kind:'pattern'|'lockedpattern';readonly resource:CanonicalSourcePatternResource}
export interface CanonicalSourceColorFields {readonly primary:CanonicalSourceSpatialColor|null;readonly mask?:CanonicalSourceSpatialColor|null}
export interface CanonicalSourceColorFieldDraw {readonly seed:number;readonly offsetX:number;readonly offsetY:number}
const fail=():never=>{throw new TypeError('Invalid source spatial color DATA')}
function record(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
 const keys=Reflect.ownKeys(value);if(keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k))||required.some(k=>!Object.hasOwn(value,k)))return fail()
 const r:Record<string,unknown>=Object.create(null)
 for(const key of keys){if(typeof key!=='string')return fail();const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return fail();r[key]=d.value}return r
}
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max&&!Object.is(n,-0)
const asset=(v:unknown):v is string=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v)
export function canonicalSourcePatternResource(value:unknown):Readonly<CanonicalSourcePatternResource>{
 const p=record(value,['kind','channels','alphaAsset','size','x','y','width','height','periodX','periodY']),c=p.channels
 if(p.kind!=='source-pattern-rgba8-v1'||!Array.isArray(c)||Object.getPrototypeOf(c)!==Array.prototype||c.length!==3||Reflect.ownKeys(c).length!==4||!asset(p.alphaAsset)||!integer(p.size,1,4096)||!integer(p.width,1,p.size)||!integer(p.height,1,p.size)||p.width*p.height>1048576||!integer(p.x,0,p.size-p.width)||!integer(p.y,0,p.size-p.height)||p.periodX!==p.width||p.periodY!==p.height)return fail()
 const channel=(i:number):string=>{const d=Object.getOwnPropertyDescriptor(c,String(i));if(!d||!Object.hasOwn(d,'value')||!asset(d.value))return fail();return d.value}
 return Object.freeze({kind:'source-pattern-rgba8-v1',channels:Object.freeze([channel(0),channel(1),channel(2)] as const),alphaAsset:p.alphaAsset,size:p.size,x:p.x,y:p.y,width:p.width,height:p.height,periodX:p.width,periodY:p.height})
}
export function canonicalSourceSpatialColor(value:unknown):Readonly<CanonicalSourceSpatialColor>{
 const kind=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'kind'):undefined
 if(!kind||!Object.hasOwn(kind,'value'))return fail()
 const p=record(value,kind.value==='total-random-rgb8-hash-v1'?['kind']:['kind','resource'])
 if(p.kind==='total-random-rgb8-hash-v1')return Object.freeze({kind:p.kind})
 if(p.kind!=='pattern'&&p.kind!=='lockedpattern')return fail()
 return Object.freeze({kind:p.kind,resource:canonicalSourcePatternResource(p.resource)})
}
export function canonicalSourceColorFields(value:unknown):Readonly<CanonicalSourceColorFields>{
 const p=record(value,['primary'],['mask']),primary=p.primary===null?null:canonicalSourceSpatialColor(p.primary),mask=Object.hasOwn(p,'mask')?(p.mask===null?null:canonicalSourceSpatialColor(p.mask)):undefined
 if(!primary&&!mask)return fail()
 return Object.freeze({primary,...mask!==undefined?{mask}:{}})
}
export function canonicalSourceColorFieldDraw(value:unknown,provider:CanonicalSourceSpatialColor|null):Readonly<CanonicalSourceColorFieldDraw>{
 const d=record(value,['seed','offsetX','offsetY'])
 if(!integer(d.seed,0,0xffffffff)||!integer(d.offsetX,-0x80000000,0x7fffffff)||!integer(d.offsetY,-0x80000000,0x7fffffff))return fail()
 if(provider?.kind==='total-random-rgb8-hash-v1'?d.offsetX!==0||d.offsetY!==0:d.seed!==0||provider?.kind!=='pattern'&&(d.offsetX!==0||d.offsetY!==0))return fail()
 return Object.freeze({seed:d.seed,offsetX:d.offsetX,offsetY:d.offsetY})
}
/** Fixed uint32 permutation. Every byte has uniform marginal distribution over
 * a uniform START seed. Functional browser noise, not native entropy identity. */
export function canonicalSourceColorNoiseHash(value:number):number{
 if(!integer(value,0,0xffffffff))return fail()
 let x=value>>>0;x=Math.imul(x^(x>>>16),0x7feb352d)>>>0;x=Math.imul(x^(x>>>15),0x846ca68b)>>>0;return(x^(x>>>16))>>>0
}
/** Coordinates are FINAL-geometry local BEFORE whole-dab mirror, not tile local. */
export function canonicalSourceColorNoiseByte(seed:number,x:number,y:number,width:number,channel:0|1|2):number{
 if(!integer(seed,0,0xffffffff)||!integer(width,1,4096)||!integer(x,0,width-1)||!integer(y,0,4095)||!integer(channel,0,2))return fail()
 return canonicalSourceColorNoiseHash((seed+3*(y*width+x)+channel)>>>0)>>>24
}

/** Project resource crop metadata only after explicit catalogue metadata matches.
 * This is DATA matching; authority and byte verification remain with the caller. */
export function canonicalSourceColorFieldAssets(fields:CanonicalSourceColorFields,available:readonly Readonly<{id:string;size:number}>[]):readonly Readonly<{id:string;size:number;x:number;y:number;width:number;height:number}>[]{
 const f=canonicalSourceColorFields(fields),result=new Map<string,Readonly<{id:string;size:number;x:number;y:number;width:number;height:number}>>()
 if(!Array.isArray(available)||available.length>2048) return fail()
 for(const provider of [f.primary,f.mask])if(provider&&provider.kind!=='total-random-rgb8-hash-v1'){
  const r=provider.resource
  for(const id of [...r.channels,r.alphaAsset]){let matched=false;for(let i=0;i<available.length;i++){const entry=Object.getOwnPropertyDescriptor(available,String(i));if(!entry||!Object.hasOwn(entry,'value'))return fail();const a=record(entry.value,['id','size']);if(!asset(a.id)||!integer(a.size,1,4096))return fail();if(a.id===id){if(a.size!==r.size||matched)return fail();matched=true}}if(!matched)return fail()
   const captured=Object.freeze({id,size:r.size,x:r.x,y:r.y,width:r.width,height:r.height}),prior=result.get(id)
   if(prior&&(prior.size!==captured.size||prior.x!==captured.x||prior.y!==captured.y||prior.width!==captured.width||prior.height!==captured.height))return fail();result.set(id,captured)
  }
 }
 return Object.freeze([...result.values()])
}

/** Pair only against an already validated original descriptor. Metadata is read
 * through own DATA properties; this helper does not admit a brush or resources. */
export function canonicalSourceColorFieldsForDescriptor(descriptor:BrushDescriptor,value:unknown):Readonly<CanonicalSourceColorFields>|undefined{
 const own=(o:unknown,key:string):unknown=>{if(!o||typeof o!=='object'||Array.isArray(o)||![Object.prototype,null].includes(Object.getPrototypeOf(o)))return fail();const d=Object.getOwnPropertyDescriptor(o,key);if(!d)return undefined;if(!Object.hasOwn(d,'value'))return fail();return d.value}
 const provider=(d:unknown):string|null=>{
  const tip=own(d,'tip'),material=own(tip,'material')
  if(material!==undefined&&own(material,'kind')==='color')return null
  const stamp=own(d,'sourceStamp');if(stamp===undefined)return null
  const settings=own(stamp,'settings'),kind=own(settings,'ColorSource/Type')??'plain'
  return kind==='total_random'?'total-random-rgb8-hash-v1':kind==='pattern'||kind==='lockedpattern'?kind:null
 }
 const primaryKind=provider(descriptor),behavior=own(descriptor,'behavior'),dual=behavior===undefined?undefined:own(behavior,'dual'),child=dual===undefined?undefined:own(dual,'brush'),maskKind=child===undefined?undefined:provider(child)
 if(!primaryKind&&!maskKind){if(value!==undefined)return fail();return undefined}
 const f=canonicalSourceColorFields(value)
 if((f.primary?.kind??null)!==primaryKind||(maskKind===undefined?f.mask!==undefined:(f.mask?.kind??null)!==maskKind))return fail()
 const a=f.primary,b=f.mask
 if(a&&b&&a.kind!=='total-random-rgb8-hash-v1'&&b.kind!=='total-random-rgb8-hash-v1'&&JSON.stringify(a.resource)!==JSON.stringify(b.resource))return fail()
 return f
}
