import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
import type {AssetId} from './brushes.js'

/** Compiler-produced LE bytes in the existing square raw CAS plane.
 * This declaration alone does not enable saturation library admission. */
export interface BrushBristleSaturationLookup {
 version:1
 encoding:'bristle-saturation-functional-v1-le'
 asset:AssetId
 profileSha256:string
 byteLength:number
}
/** A fixed set of mask-derived hairs follows canonical author input knots. */
export interface BrushBristleInk {
 depletion:readonly number[]
 useOpacity:boolean
 useSaturation:boolean
 useWeights:boolean
 pressureWeight:number
 bristleLengthWeight:number
 bristleInkAmountWeight:number
 inkDepletionWeight:number
}
export interface BrushBristleSoak {sourcePolicy:'canonical-begin-v1';initialSide:number;resizePolicy?:'mask-population-v1'}
export type BrushBristleInitialization = {sourceSide:number;resizePolicy:'mask-population-v1'} | {sourceSide:number;resizePolicy:'source-area143-v1';sourceMask:AssetId;sourceBounds:{x:number;y:number;width:number;height:number};rotation:[number,number]}
interface BristleGeometry {
 hairs:[number,number,number][]
 scale:number
 shear:number
 random:number
 mousePressure:boolean
 threshold:boolean
 connected:boolean
 antialias:boolean
 compositing:boolean
}
export type BrushBristle=BristleGeometry&({version:1;ink?:never;saturationLookup?:never;soak?:never;initialization?:BrushBristleInitialization}|{version:2;initialization?:never;ink:BrushBristleInk;saturationLookup?:BrushBristleSaturationLookup;soak?:BrushBristleSoak})
export function isBrushBristle(value:unknown):value is BrushBristle{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing','ink','saturationLookup','soak','initialization'].includes(k))&&((v.version===1&&v.ink===undefined&&v.saturationLookup===undefined&&v.soak===undefined&&(v.initialization===undefined||(isBristleInitialization141(v.initialization,v.hairs)||isBristleInitialization143(v.initialization))))||(v.version===2&&v.initialization===undefined&&isBristleInk(v.ink)&&(v.soak===undefined||isBristleSoak139(v.soak,v.hairs))&&(v.saturationLookup===undefined||v.ink.useSaturation&&isBristleSaturationLookup(v.saturationLookup))))&&n(v.scale,v.version===1?-10:0,10)&&n(v.shear,-10,10)&&n(v.random,0,100)&&['mousePressure','threshold','connected','antialias','compositing'].every(k=>typeof v[k]==='boolean')&&Array.isArray(v.hairs)&&v.hairs.length>0&&v.hairs.length<=(v.version===1?8192:4096)&&v.hairs.every(h=>Array.isArray(h)&&h.length===3&&n(h[0],-.5,.5)&&n(h[1],-.5,.5)&&n(h[2],0,1))
}

export function isBristleSaturationLookup(value:unknown):value is BrushBristleSaturationLookup {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return Object.keys(v).length===5&&Object.keys(v).every(k=>['version','encoding','asset','profileSha256','byteLength'].includes(k))
  &&v.version===1&&v.encoding==='bristle-saturation-functional-v1-le'
  &&typeof v.asset==='string'&&/^asset:[a-f0-9]{64}$/.test(v.asset)
  &&typeof v.profileSha256==='string'&&/^[a-f0-9]{64}$/.test(v.profileSha256)
  &&typeof v.byteLength==='number'&&Number.isInteger(v.byteLength)&&v.byteLength>=64&&v.byteLength<=524288
}

export function isBristleInk(value:unknown):value is BrushBristleInk {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,unit=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1
 return Object.keys(v).length===8&&Object.keys(v).every(k=>['depletion','useOpacity','useSaturation','useWeights','pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight'].includes(k))
  &&Array.isArray(v.depletion)&&v.depletion.length>=1&&v.depletion.length<=65536&&v.depletion.every(unit)
  &&['useOpacity','useSaturation','useWeights'].every(k=>typeof v[k]==='boolean')
  &&[v.pressureWeight,v.bristleLengthWeight,v.bristleInkAmountWeight].every(unit)
  &&typeof v.inkDepletionWeight==='number'&&Number.isFinite(v.inkDepletionWeight)&&v.inkDepletionWeight>=0&&v.inkDepletionWeight<=100
}

/** Native no-ink AA additive request, then common Wash. Whole-library validators
 * still validate dynamics, captured source policies and every ordinary field. */
export function hasBristleWash135Scope(value:unknown,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!obj(value.behavior.rendering)||value.behavior.rendering.accumulation!=='alphaDarken'||!isBrushBristle(value.bristle))return false
 const t=value.tip,b=value.behavior,r=b.rendering,h=value.bristle
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=135&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&one(value.flowByPressure)
 &&h.version===1&&h.hairs.length<=4096&&h.scale>=0&&h.antialias===true&&h.compositing===false
 &&['mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version',...(stationary?['timing']:[]),'rendering','modulations','rotation','strokeInput','speedInput'].includes(k))
 &&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>k==='size'||k==='rotation'))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

/** Raw hair offsets belong to the initialization bitmap, never to dab.size.
 * Tolerance only recovers integers lost by native-import division/multiplication. */
function isBristleSoak139(value:unknown,hairs:unknown):value is BrushBristleSoak {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const s=value as Record<string,unknown>,n=s.initialSide
 return Object.keys(s).every(k=>['sourcePolicy','initialSide','resizePolicy'].includes(k))&&(s.resizePolicy===undefined||s.resizePolicy==='mask-population-v1')&&s.sourcePolicy==='canonical-begin-v1'&&typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=256
 &&Array.isArray(hairs)&&hairs.length>0&&hairs.length<=4096&&hairs.every(h=>Array.isArray(h)&&h.length===3&&h.slice(0,2).every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v*n-Math.round(v*n))<=1e-9&&Math.round(v*n)>=-Math.floor(n/2)&&Math.round(v*n)<=n-1-Math.floor(n/2)))
}
/**140 captures the complete source alpha grid, not a density-decimated population. */
function isResizeMask140(h:BrushBristle):boolean {
 if(h.version!==2||!h.soak||h.soak.initialSide>64)return false
 const side=h.soak.initialSide,seen=new Set<number>()
 for(const[x,y,a]of h.hairs){
  if(a<=0||Math.abs(a*255-Math.round(a*255))>1e-9)return false
  const key=(Math.round(y*side)+Math.floor(side/2))*side+Math.round(x*side)+Math.floor(side/2)
  if(seen.has(key))return false
  seen.add(key)
 }
 return true
}
export function hasBristleSoak140Scope(value:unknown,policy?:BrushStructurePolicy):boolean {
 if(!hasBristleSoak139Scope(value,policy))return false
 const h=(value as {bristle:BrushBristle}).bristle
 return h.version===2&&h.soak?.resizePolicy==='mask-population-v1'
}
const immutableSoakScopes=new WeakSet<object>()
/** Imported canonical descriptors are frozen recursively. A shallow freeze or
 * accessor cannot authorize caching: its nested/effective values may change. */
function immutableSoakData(value:unknown,seen=new WeakSet<object>()):boolean {
 if(value===null||typeof value!=='object')return typeof value!=='function'
 if(seen.has(value))return true
 const prototype=Object.getPrototypeOf(value)
 if(!Object.isFrozen(value)||(prototype!==Object.prototype&&prototype!==Array.prototype&&prototype!==null))return false
 seen.add(value)
 for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))){
  if(!('value'in descriptor)||!immutableSoakData(descriptor.value,seen))return false
 }
 return true
}
/** Staged descriptor capability. Canonical source host + palette consumer required.
 * Mutable external descriptors retain full validation on every call. */
export function hasBristleSoak139Scope(value:unknown,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 if(!stationary&&value!==null&&typeof value==='object'&&immutableSoakScopes.has(value))return true
 const valid=hasBristleSoak139ScopeUncached(value,policy)
 if(!stationary&&valid&&value!==null&&typeof value==='object'&&immutableSoakData(value))immutableSoakScopes.add(value)
 return valid
}
function hasBristleSoak139ScopeUncached(value:unknown,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 if(!obj(value)||!obj(value.bristle)||value.bristle.version!==2||value.bristle.soak===undefined||!isBrushBristle(value.bristle)||value.bristle.version!==2||!obj(value.tip)||!obj(value.behavior))return false
 const h=value.bristle,t=value.tip,b=value.behavior,r=b.rendering
 return Number.isInteger(value.version)&&Number(value.version)>=139&&(h.soak?.resizePolicy===undefined||Number(value.version)>=140&&isResizeMask140(h))&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&one(value.flowByPressure)
 &&['mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'].every(k=>value[k]===undefined)
 &&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))&&t.kind==='round'&&t.hardness===1&&t.aspect===1&&t.rotation==='fixed'&&t.angle===0
 &&b.version===2&&Object.keys(b).every(k=>['version',...(stationary?['timing']:[]),'rendering','modulations','rotation','strokeInput','speedInput'].includes(k))
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>k==='size'||k==='rotation'))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')
 &&obj(r)&&Object.keys(r).every(k=>['mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'].includes(k))&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges===undefined||r.wetEdges===0)&&(r.burntEdges===undefined||r.burntEdges===0)&&(r.burntEdgesMode===undefined||r.burntEdgesMode==='multiply')&&(r.opacityCeiling===undefined||r.opacityCeiling==='uniform')
 &&(!h.ink.useSaturation||isBristleSaturationLookup(h.saturationLookup))
}
/** Existing captured gesture identity. No new time, random or wire channel. */
export function hasBristleSoakBeginIdentity139(op:unknown):boolean {
 if(!op||typeof op!=='object'||Array.isArray(op))return false
 const v=op as Record<string,unknown>
 return v.type==='stroke'&&typeof v.strokeId==='string'&&v.strokeId.length>0&&v.strokeId.length<=200
}

/** Captured complete source alpha grid; no density-decimated initialization. */
function isBristleInitialization141(value:unknown,hairs:unknown):value is BrushBristleInitialization {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,side=v.sourceSide
 if(Object.keys(v).length!==2||v.resizePolicy!=='mask-population-v1'||typeof side!=='number'||!Number.isInteger(side)||side<1||side>256||!Array.isArray(hairs)||hairs.length<1||hairs.length>8192)return false
 const seen=new Set<number>(),half=Math.floor(side/2)
 for(const h of hairs){
  if(!Array.isArray(h)||h.length!==3||typeof h[2]!=='number'||!Number.isFinite(h[2])||h[2]<=0||h[2]>1||Math.abs(h[2]*255-Math.round(h[2]*255))>1e-9)return false
  const raw=h.slice(0,2).map(x=>typeof x==='number'&&Number.isFinite(x)?x*side:NaN)
  if(raw.some(x=>!Number.isFinite(x)||Math.abs(x-Math.round(x))>1e-9||Math.round(x)<-half||Math.round(x)>side-1-half))return false
  const key=(Math.round(raw[1])+half)*side+Math.round(raw[0])+half
  if(seen.has(key))return false
  seen.add(key)
 }
 return true
}
function isBristleInitialization143(value:unknown):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,side=v.sourceSide,b=v.sourceBounds,r=v.rotation
 const integer=(x:unknown,lo:number,hi:number):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=lo&&x<=hi
 if(Object.keys(v).length!==5||v.resizePolicy!=='source-area143-v1'||!integer(side,2,1024)||(side&(side-1))!==0||typeof v.sourceMask!=='string'||!/^asset:[a-f0-9]{64}$/.test(v.sourceMask)||!b||typeof b!=='object'||Array.isArray(b)||!Array.isArray(r)||r.length!==2||!r.every(x=>integer(x,-65536,65536)))return false
 const bounds=b as Record<string,unknown>
 return Object.keys(bounds).length===4&&integer(bounds.x,0,side-1)&&integer(bounds.y,0,side-1)&&integer(bounds.width,1,side)&&integer(bounds.height,1,side)&&bounds.x+bounds.width<=side&&bounds.y+bounds.height<=side&&Math.abs((r[0]*r[0]+r[1]*r[1])/4294967296-1)<=2e-4
}
const immutableSource143Scopes=new WeakSet<object>()
const immutableResize141Scopes=new WeakSet<object>()
/** New ordinary no-ink/directOver initialization; old45/66/135 are not inferred. */
function ordinaryInitializationScope(value:unknown,source143:boolean,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 const cache=source143?immutableSource143Scopes:immutableResize141Scopes
 if(!stationary&&value!==null&&typeof value==='object'&&cache.has(value))return true
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!Number.isInteger(value.version)||Number(value.version)<141||!obj(value.bristle)||value.bristle.version!==1||!obj(value.bristle.initialization)||value.bristle.initialization.resizePolicy!==(source143?'source-area143-v1':'mask-population-v1')||source143&&Number(value.version)<143||!isBrushBristle(value.bristle)||!obj(value.behavior)||!obj(value.tip))return false
 const b=value.behavior,t=value.tip,r=b.rendering
 const valid=Number.isInteger(value.version)&&Number(value.version)>=141&&value.model==='stamp'&&value.paperInteraction===0
 &&['mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'].every(k=>value[k]===undefined)
 &&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))&&t.kind==='round'&&t.hardness===1&&t.aspect===1&&t.rotation==='fixed'&&t.angle===0
 &&b.version===2&&Object.keys(b).every(k=>['version',...(stationary?['timing']:[]),'rendering','modulations','rotation','strokeInput','speedInput'].includes(k))
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>k==='size'||k==='rotation'))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')
 &&obj(r)&&Object.keys(r).every(k=>['mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'].includes(k))&&r.mode==='buildUp'&&r.accumulation==='directOver'&&r.blendMode==='normal'&&(r.wetEdges===undefined||r.wetEdges===0)&&(r.burntEdges===undefined||r.burntEdges===0)&&(r.burntEdgesMode===undefined||r.burntEdgesMode==='multiply')&&(r.opacityCeiling===undefined||r.opacityCeiling==='uniform')
 if(valid&&!stationary&&immutableSoakData(value))cache.add(value)
 return valid
}
export function hasBristleResize141Scope(value:unknown,policy?:BrushStructurePolicy):boolean{
 return ordinaryInitializationScope(value,false,policy)}
export function hasBristleSource143Scope(value:unknown,policy?:BrushStructurePolicy):boolean{
 return ordinaryInitializationScope(value,true,policy)}
export function hasBristleInitializationScope(value:unknown,policy?:BrushStructurePolicy):boolean{
 return hasBristleResize141Scope(value,policy)||hasBristleSource143Scope(value,policy)||hasBristleSoak140Scope(value,policy)}
export function bristleInitializationSourceSide(brush:import('./brushes.js').BrushDescriptor):number|undefined {
 const h=brush.bristle
 if((hasBristleResize141Scope(brush)||hasBristleSource143Scope(brush))&&h?.version===1)return h.initialization!.sourceSide
 if(hasBristleSoak140Scope(brush)&&h?.version===2)return h.soak!.initialSide
 return undefined
}

/** Versioned native point raster only; later unrelated revisions never opt in. */
export function hasBristleNativePointCoverage(value:unknown):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const b=value as Record<string,unknown>,h=b.bristle
 if((b.version!==142&&b.version!==144)||!h||typeof h!=='object'||Array.isArray(h))return false
 const bristle=h as Record<string,unknown>
 return bristle.version===1&&bristle.antialias===true&&bristle.compositing===true&&(b.version===142?hasBristleResize141Scope(value):hasBristleSource143Scope(value))
}

/** Shared family structure; only explicit195 mode lifts its timing clause. */
export function isBristleDescriptor(d:Record<string,unknown>,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(d,policy)
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(d.bristle===undefined)return true
 if(!record(d.tip))return false
 return !(!isBrushBristle(d.bristle)||d.model!=='stamp'||d.spray!==undefined||d.sketch!==undefined||d.curveTrace!==undefined||d.scatter!==undefined||d.mixer!==undefined||!record(d.behavior)||d.behavior.version!==2||d.behavior.dual!==undefined||!stationary&&d.behavior.timing!==undefined||d.behavior.wetMix!==undefined||d.behavior.taper!==undefined||d.texture!==undefined||d.wet!==undefined||d.paperInteraction!==0||d.tip.kind!=='round'||d.tip.profile!==undefined||!record(d.behavior.rendering)||(d.behavior.rendering.accumulation!=='directOver'&&!hasBristleWash135Scope(d,policy))||d.behavior.rendering.blendMode!=='normal')
}
