import type {Input} from './contract'
import type {initialIntegerDynamic} from './macro8-integer-dynamic'
import type {PackingBuffers} from './macro9-integer-smooth'
/** Internal explicit seam ONLY: coarse policy is insufficient without wet-only fine reconstruction. */
export interface FixedWetCoarseHooks {
 readonly initialize:(input:Input,original:typeof initialIntegerDynamic)=>ReturnType<typeof initialIntegerDynamic>
 readonly transformPair:(source:string)=>string
 readonly observePacking:(buffers:PackingBuffers,finalStateIndex:number)=>void
}
/** Derive gate from the ACTUAL selected source, preserving every arithmetic byte outside this gate. */
export function guardFixedWetPair(source:string){
 const ordinary='let j=u32(partner.y)*p.n+u32(partner.x);'
 const single='var a=src[ia];var b=src[ib];'
 if(source.includes('fixed-wet-face-gate'))throw Error('Fixed wet pair already guarded')
 if(source.includes(ordinary)){
  if(source.split(ordinary).length!==2)throw Error('Fixed wet ordinary pair anchor drift')
  return source.replace(ordinary,ordinary+'/*fixed-wet-face-gate*/if(aux[i].x==0u||aux[j].x==0u){dst[i]=adsorb(src[i],aux[i]);return;}')
 }
 if(source.includes('dst[ia]=adsorb(a,aux[ia]);dst[ib]=adsorb(b,aux[ib]);')&&source.split(single).length===2){
  return source.replace(single,'/*fixed-wet-face-gate*/if(aux[ia].x==0u||aux[ib].x==0u){dst[ia]=adsorb(src[ia],aux[ia]);dst[ib]=adsorb(src[ib],aux[ib]);return;}'+single)
 }
 throw Error('Unsupported fixed wet pair layout')
}

export function captureFixedWetHooks(hooks:FixedWetCoarseHooks|undefined):Readonly<FixedWetCoarseHooks>|undefined{
 if(hooks===undefined)return undefined
 if(!hooks||['initialize','transformPair','observePacking'].some(k=>typeof hooks[k as keyof FixedWetCoarseHooks]!=='function'))throw Error('Invalid fixed wet hooks')
 return Object.freeze({...hooks})
}
