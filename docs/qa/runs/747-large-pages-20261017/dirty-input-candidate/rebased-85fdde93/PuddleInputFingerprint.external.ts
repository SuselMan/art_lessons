import type {AccumulationBuffer} from '/home/suselman/projects/pencil-agents/747-single-rect/docs/qa/runs/747-large-pages-20261017/dirty-input-candidate/rebased-85fdde93/AccumulationBuffer.external.ts'
import type {RibbonStrokeScratch} from '/home/suselman/projects/pencil-agents/747-single-rect/apps/web/src/engine/src/buffers/RibbonStrokeScratch'
const planes=['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad'] as const
export type InputFingerprint=Array<{buffer:AccumulationBuffer;revision:number}|null>
export function rawInputFingerprint(entry:Partial<Record<typeof planes[number],AccumulationBuffer|null>>):InputFingerprint|null {
 const result:InputFingerprint=[]
 for(const name of planes){const buffer=entry[name];if(!buffer){result.push(null);continue}
  const revision=buffer.contentRevision
  if(!Number.isSafeInteger(revision)||revision<0)return null
  result.push({buffer,revision})
 }
 return result
}
export function sameInputFingerprint(a:InputFingerprint|null|undefined,b:InputFingerprint|null):boolean {
 return !!a&&!!b&&a.length===b.length&&a.every((value,i)=>value===null?b[i]===null:!!b[i]&&value.buffer===b[i]!.buffer&&value.revision===b[i]!.revision)
}
function encode(value:unknown,seen:Set<object>):string|null {
 if(value===null)return 'null'
 if(value===undefined)return 'undefined'
 if(typeof value==='number')return Number.isFinite(value)?Object.is(value,-0)?'-0':String(value):null
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
 if(typeof value!=='object'||seen.has(value))return null
 seen.add(value)
 try{
  const entries=Array.isArray(value)?value.map(v=>encode(v,seen)):Object.keys(value).sort().map(k=>{const v=encode((value as Record<string,unknown>)[k],seen);return v===null?null:JSON.stringify(k)+':'+v})
  return entries.some(v=>v===null)?null:(Array.isArray(value)?'[':'{')+entries.join(',')+(Array.isArray(value)?']':'}')
 }finally{seen.delete(value)}
}
/** Exact current engine host.render inputs, excluding bounds (geometry checked separately). */
export function m70PresentationInputSignature(scratch:RibbonStrokeScratch,context:NonNullable<RibbonStrokeScratch['finishContext']>):string|null {
 if(context.profile.materialModel!=='m70-r2-v1'||scratch.foreignSources?.length||scratch.foreignImportedGestures.size)return null
 const sc=scratch.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
 return encode({preset:context.preset,profile:context.profile,color:context.color,opacity:context.opacity,fieldSeed:context.fieldSeed,water:sc.water,migratePx:sc.migratePx,bristleRadiusPx:sc.bristleRadiusPx,direction:scratch.noteDirection(0,0),gesture:scratch.gesture},new Set())
}
