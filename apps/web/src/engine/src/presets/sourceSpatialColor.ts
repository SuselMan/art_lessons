import {canonicalSourcePatternResource,canonicalSourceColorFields,canonicalSourceColorNoiseHash,type CanonicalSourcePatternResource,type CanonicalSourceSpatialColor,type CanonicalSourceColorFields,type CanonicalSourceColorFieldDraw} from '@grafetto/shared'

/** Application-selected paint inputs, captured once before this stroke starts.
 * Noise is independent from option/query RNG. Pattern never falls back to paper. */
export interface SourceSpatialColorInput {readonly noiseSeed?:number;readonly pattern?:CanonicalSourcePatternResource}
export type SourceSpatialProvider='total_random'|'pattern'|'lockedpattern'
export function sourceSpatialProvider(value:unknown):value is SourceSpatialProvider{return value==='total_random'||value==='pattern'||value==='lockedpattern'}
export function sourceSpatialRoleProvider(role:{readonly sourceColorProvider?:unknown;readonly imageMaterial?:{readonly kind:string}}):SourceSpatialProvider|undefined{return sourceSpatialProvider(role.sourceColorProvider)&&role.imageMaterial?.kind!=='color-stamp-v1'?role.sourceColorProvider:undefined}
export function captureSourceSpatialColorInput(value:unknown,providers:readonly unknown[]):Readonly<SourceSpatialColorInput>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>k!=='noiseSeed'&&k!=='pattern'))throw new TypeError('Invalid source spatial START input')
 const seed=Object.getOwnPropertyDescriptor(value,'noiseSeed'),pattern=Object.getOwnPropertyDescriptor(value,'pattern')
 if(seed&&!Object.hasOwn(seed,'value')||pattern&&!Object.hasOwn(pattern,'value'))throw new TypeError('Source spatial input accessor')
 const noise=providers.includes('total_random'),needsPattern=providers.some(p=>p==='pattern'||p==='lockedpattern')
 if(noise&&(!seed||!Number.isInteger(seed.value)||seed.value<0||seed.value>0xffffffff||Object.is(seed.value,-0))||!noise&&seed!==undefined||needsPattern!==!!pattern)throw new RangeError('Missing or extraneous selected spatial resource')
 return Object.freeze({...noise?{noiseSeed:seed!.value}:{},...pattern?{pattern:canonicalSourcePatternResource(pattern.value)}:{}})
}
export function sourceSpatialColorFields(providers:readonly unknown[],input:SourceSpatialColorInput):CanonicalSourceColorFields{
 if(providers.length<1||providers.length>2||!providers.some(sourceSpatialProvider))throw new RangeError('Invalid source spatial roles')
 const role=(provider:unknown):CanonicalSourceSpatialColor|null=>provider==='total_random'?{kind:'total-random-rgb8-hash-v1'}:provider==='pattern'||provider==='lockedpattern'?{kind:provider,resource:input.pattern??(()=>{throw new RangeError('Missing original selected pattern')})()}:null
 return canonicalSourceColorFields({primary:role(providers[0]),...providers.length===2?{mask:role(providers[1])}:{}})
}
/** QPoint conversion is symmetric half-away-from-zero, before period wrapping. */
const point=(n:number):number=>{if(!Number.isFinite(n))throw new RangeError('Invalid source pattern position');const v=n<0?Math.ceil(n-.5):Math.floor(n+.5);if(v< -0x80000000||v>0x7fffffff)throw new RangeError('Source pattern position bound');return v||0}
export function sourceSpatialColorDraw(provider:unknown,input:SourceSpatialColorInput,role:0|1,paintOrdinal:number,x:number,y:number):CanonicalSourceColorFieldDraw{
 if(!Number.isSafeInteger(paintOrdinal)||paintOrdinal<0||paintOrdinal>0x7fffffff)throw new RangeError('Source spatial paint ordinal')
 if(provider==='total_random'){
  if(input.noiseSeed===undefined)throw new RangeError('Missing independent source noise seed')
  return Object.freeze({seed:canonicalSourceColorNoiseHash((input.noiseSeed+2*paintOrdinal+role)>>>0),offsetX:0,offsetY:0})
 }
 if(provider==='lockedpattern'&&!input.pattern)throw new RangeError('Missing selected source pattern')
 if(provider==='pattern'){if(!input.pattern)throw new RangeError('Missing selected source pattern');return Object.freeze({seed:0,offsetX:point(x),offsetY:point(y)})}
 return Object.freeze({seed:0,offsetX:0,offsetY:0})
}
