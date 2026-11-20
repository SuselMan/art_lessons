import {isBrushPattern,copyBrushPattern,brushPatternAssetIds,type BrushPattern} from './brushPattern.js'
import {isBrushGradient} from './brushGradient.js'

/** Immutable inputs external to the brush preset. Recorded once per gesture;
 * repeat unchanged on live/final chunks so replay never reads receiver UI. */
export type BrushSourceContext = {
  readonly version:1
  readonly pattern?:BrushPattern
  /** Author brush background, independent of paper/layer background. RGBA8. */
  readonly background?:readonly[number,number,number,number]
  /** Author viewport rotation in radians, captured once for normal-vector brushes. */
  readonly normalRotation?:number
  /** Bottom to top, already flattened for visibility and folder opacity. */
  readonly projection?:readonly {readonly id:string;readonly opacity:number}[]
  /** 256 straight RGBA8 samples, lowercase hexadecimal, including alpha. */
  readonly gradient?:string
  /** World source minus destination; fixed source additionally captures its centre. */
  readonly clone?:{readonly x:number;readonly y:number;readonly offsetX:number;readonly offsetY:number}
}

const ownedSources=new WeakSet<object>()
const sourceKeys=new WeakMap<BrushSourceContext,string>()
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
export function isBrushSourceContext(value:unknown):value is BrushSourceContext {
  if(!object(value))return false
  if(ownedSources.has(value))return true
  if(value.version!==1||Object.keys(value).some(k=>!['version','projection','gradient','clone','normalRotation','background','pattern'].includes(k)))return false
  if(value.projection===undefined&&value.gradient===undefined&&value.clone===undefined&&value.normalRotation===undefined&&value.background===undefined&&value.pattern===undefined)return false
  if(value.pattern!==undefined&&!isBrushPattern(value.pattern))return false
  if(value.background!==undefined&&(!Array.isArray(value.background)||value.background.length!==4||!value.background.every(v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=255)))return false
  if(value.normalRotation!==undefined&&(typeof value.normalRotation!=='number'||!Number.isFinite(value.normalRotation)||Math.abs(value.normalRotation)>Math.PI*2))return false
  if(value.clone!==undefined){
    const c=value.clone
    if(!object(c)||Object.keys(c).length!==4||!['x','y','offsetX','offsetY'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&Math.abs(c[k] as number)<=1e7))return false
  }
  if(value.projection!==undefined){
    if(!Array.isArray(value.projection)||value.projection.length>256)return false
    const ids=new Set<string>()
    for(const layer of value.projection){
      if(!object(layer)||Object.keys(layer).length!==2||typeof layer.id!=='string'||layer.id.length<1||layer.id.length>200
        ||!Number.isFinite(layer.opacity)||typeof layer.opacity!=='number'||layer.opacity<0||layer.opacity>1||ids.has(layer.id))return false
      ids.add(layer.id)
    }
  }
  return value.gradient===undefined||isBrushGradient(value.gradient)
}

export function copyBrushSourceContext(source:BrushSourceContext):BrushSourceContext {
  if(ownedSources.has(source))return source
  if(!isBrushSourceContext(source))throw Error('Invalid brush source context')
  const copy:BrushSourceContext=Object.freeze({version:1,...(source.pattern===undefined?{}:{pattern:copyBrushPattern(source.pattern)}),...(source.background===undefined?{}:{background:Object.freeze([...source.background])as readonly[number,number,number,number]}),...(source.normalRotation===undefined?{}:{normalRotation:source.normalRotation}),...(source.projection ? {projection:Object.freeze(source.projection.map(layer=>Object.freeze({id:layer.id,opacity:layer.opacity})))} : {}),...(source.gradient===undefined ? {} : {gradient:source.gradient}),...(source.clone ? {clone:Object.freeze({x:source.clone.x,y:source.clone.y,offsetX:source.clone.offsetX,offsetY:source.clone.offsetY})} : {})})
  ownedSources.add(copy);return copy
}

/** A deterministic integrity word, not an authentication or asset identifier. */
export function brushSourceKey(source:BrushSourceContext):string {
  const known=sourceKeys.get(source);if(known!==undefined)return known
  const text=JSON.stringify(ownedSources.has(source)?source:copyBrushSourceContext(source))
  let a=0x811c9dc5,b=0x9e3779b9
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x85ebca6b)>>>0}
  const key=a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')
  if(ownedSources.has(source))sourceKeys.set(source,key)
  return key
}

/** Fits inside the existing seeded-gesture nonce, preserving both invariants. */
export function createBrushSourceNonce(nonce:string,source?:BrushSourceContext):string {
  if(!/^[A-Za-z0-9_-]{10,32}$/.test(nonce))throw Error('Invalid brush source nonce')
  return source ? `bs1_${brushSourceKey(source)}_${nonce}` : nonce
}

/** JSON persistence may round a captured double to its immediate IEEE-754
 * neighbour. Keep the recorded source and normal key unchanged; only the
 * integrity-word check has this one-ULP compatibility window for rotation. */
function matchesSourceKey(source:BrushSourceContext,key:string):boolean {
  if(brushSourceKey(source)===key)return true
  const rotation=source.normalRotation
  if(rotation===undefined)return false
  const bytes=new DataView(new ArrayBuffer(8))
  bytes.setFloat64(0,rotation)
  const bits=bytes.getBigUint64(0)
  for(const direction of[-1,1]as const){
    let adjacent:number
    if(rotation===0)adjacent=direction*Number.MIN_VALUE
    else{
      bytes.setBigUint64(0,bits+BigInt(rotation>0?direction:-direction))
      adjacent=bytes.getFloat64(0)
    }
    if(Number.isFinite(adjacent)&&Math.abs(adjacent)<=Math.PI*2&&brushSourceKey({...source,normalRotation:adjacent})===key)return true
  }
  return false
}

export function hasValidBrushSourceContext(value:unknown):boolean {
  if(!object(value))return false
  const id=typeof value.strokeId==='string'?value.strokeId:''
  const nonce=/^br1\.([A-Za-z0-9_-]{10,64})\./.exec(id)?.[1] ?? id
  const marker=/^bs1_([a-f0-9]{16})_[A-Za-z0-9_-]{10,32}$/.exec(nonce)
  if(value.brushSource===undefined)return !/^bs[0-9]+_/.test(nonce)
  return !!marker&&(value.type===undefined||value.type==='stroke')&&value.tool==='digitalBrush'
    &&isBrushSourceContext(value.brushSource)&&matchesSourceKey(value.brushSource,marker[1])
}

/** Read dependencies stay separate from the layer an operation writes. */
export function brushProjectionLayerIds(op:{type:string;layerId?:string;brushSource?:BrushSourceContext}):string[] {
  return op.type==='stroke' ? (op.brushSource?.projection ?? []).map(layer=>layer.id).filter(id=>id!==op.layerId) : []
}

export function brushSourcePatternAssetIds(source:BrushSourceContext|undefined):`asset:${string}`[]{return brushPatternAssetIds(source?.pattern)}
export function operationBrushSourceAssetIds(op:{brushSource?:BrushSourceContext}):`asset:${string}`[]{return brushSourcePatternAssetIds(op.brushSource)}
