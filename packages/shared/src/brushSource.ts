import {isBrushGradient} from './brushGradient.js'

/** Immutable inputs external to the brush preset. Recorded once per gesture;
 * repeat unchanged on live/final chunks so replay never reads receiver UI. */
export type BrushSourceContext = {
  readonly version:1
  /** Bottom to top, already flattened for visibility and folder opacity. */
  readonly projection?:readonly {readonly id:string;readonly opacity:number}[]
  /** 256 straight RGBA8 samples, lowercase hexadecimal, including alpha. */
  readonly gradient?:string
}

const ownedSources=new WeakSet<object>()
const sourceKeys=new WeakMap<BrushSourceContext,string>()
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
export function isBrushSourceContext(value:unknown):value is BrushSourceContext {
  if(!object(value))return false
  if(ownedSources.has(value))return true
  if(value.version!==1||Object.keys(value).some(k=>!['version','projection','gradient'].includes(k)))return false
  if(value.projection===undefined&&value.gradient===undefined)return false
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
  const copy:BrushSourceContext=Object.freeze({version:1,...(source.projection ? {projection:Object.freeze(source.projection.map(layer=>Object.freeze({...layer})))} : {}),...(source.gradient===undefined ? {} : {gradient:source.gradient})})
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

export function hasValidBrushSourceContext(value:unknown):boolean {
  if(!object(value))return false
  const id=typeof value.strokeId==='string'?value.strokeId:''
  const nonce=/^br1\.([A-Za-z0-9_-]{10,64})\./.exec(id)?.[1] ?? id
  const marker=/^bs1_([a-f0-9]{16})_[A-Za-z0-9_-]{10,32}$/.exec(nonce)
  if(value.brushSource===undefined)return !/^bs[0-9]+_/.test(nonce)
  return !!marker&&(value.type===undefined||value.type==='stroke')&&value.tool==='digitalBrush'
    &&isBrushSourceContext(value.brushSource)&&marker[1]===brushSourceKey(value.brushSource)
}

/** Read dependencies stay separate from the layer an operation writes. */
export function brushProjectionLayerIds(op:{type:string;layerId?:string;brushSource?:BrushSourceContext}):string[] {
  return op.type==='stroke' ? (op.brushSource?.projection ?? []).map(layer=>layer.id).filter(id=>id!==op.layerId) : []
}
