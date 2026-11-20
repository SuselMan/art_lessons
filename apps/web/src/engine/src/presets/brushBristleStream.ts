import type {BristleInkGeometry} from './brushBristle'
import {advanceBristleInkLine,beginBristleInkLine,type BristleInkLine,type BristleInkProfile,type BristleInkState} from './brushBristleInk'
export interface BristleStreamLine {readonly geometry:BristleInkGeometry;readonly color:readonly[number,number,number];readonly flow:number;readonly ceiling:number}
export interface BristleStreamRequest {
 readonly ordinal:number
 readonly lines:readonly BristleStreamLine[]
 readonly start:BristleInkState
 result?:BristleInkState
 committed:boolean
}
export interface BristleStreamCursor {state:BristleInkState;nextLine:number;line?:BristleInkLine;sampleOrdinal:number}
export interface BristleStreamSample {x:number;y:number;flow:number;ceiling:number;color:[number,number,number];group:number;sampleOrdinal:number}
const copy=(s:BristleInkState):BristleInkState=>({hairs:s.hairs.map(h=>({...h}))})
const equal=(a:BristleInkState,b:BristleInkState)=>a.hairs.length===b.hairs.length&&a.hairs.every((h,i)=>h.counter===b.hairs[i].counter&&h.inkAmount===b.hairs[i].inkAmount)
function validState(s:BristleInkState):boolean{return s.hairs.length>0&&s.hairs.length<=4096&&s.hairs.every(h=>Number.isSafeInteger(h.counter)&&h.counter>=0&&Number.isFinite(h.inkAmount)&&h.inkAmount>=0&&h.inkAmount<=1)}
/** One immutable request-start snapshot, never all trajectory samples. Every
 * tile replays from this same value; the gesture receives one final commit. */
export function createBristleStreamRequest(start:BristleInkState,lines:readonly BristleStreamLine[],ordinal:number):BristleStreamRequest{
 if(!validState(start)||!Number.isSafeInteger(ordinal)||ordinal<0||lines.length>4096)throw RangeError('Invalid Bristle streamed request')
 const seen=new Set<number>()
 const captured=lines.map(line=>{
  const {geometry:g}=line
  if(seen.has(g.hair)||!Number.isInteger(g.hair)||g.hair<0||g.hair>=start.hairs.length||!Number.isFinite(line.flow)||line.flow<0||line.flow>1||!Number.isFinite(line.ceiling)||line.ceiling<0||line.ceiling>1)throw RangeError('Invalid Bristle streamed hair')
  seen.add(g.hair)
  // Reuse the trajectory validator without advancing any hair state.
  beginBristleInkLine(start,g.hair,g.start,g.end,g.length,g.pressure,line.color,true)
  return Object.freeze({geometry:Object.freeze({...g,start:Object.freeze([...g.start] as [number,number]),end:Object.freeze([...g.end] as [number,number])}),color:Object.freeze([...line.color] as [number,number,number]),flow:line.flow,ceiling:line.ceiling})
 })
 const initial=copy(start);initial.hairs.forEach(Object.freeze);Object.freeze(initial.hairs);Object.freeze(initial)
 return {ordinal,lines:Object.freeze(captured),start:initial,committed:false}
}
export function beginBristleStreamPass(request:BristleStreamRequest):BristleStreamCursor{return {state:copy(request.start),nextLine:0,sampleOrdinal:0}}
/** CPU work and output are bounded by maxSamples. Invisible samples still
 * consume ink. Filtering to a tile must happen AFTER this call. */
export function advanceBristleStreamPass(profile:BristleInkProfile,request:BristleStreamRequest,cursor:BristleStreamCursor,antialias:boolean,maxSamples=2048):{samples:BristleStreamSample[];done:boolean}{
 if(!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>2048||!Number.isInteger(cursor.nextLine)||cursor.nextLine<0||cursor.nextLine>request.lines.length||!validState(cursor.state)||cursor.state.hairs.length!==request.start.hairs.length||!Number.isSafeInteger(cursor.sampleOrdinal)||cursor.sampleOrdinal<0)throw RangeError('Invalid Bristle streamed continuation')
 if(cursor.sampleOrdinal>Number.MAX_SAFE_INTEGER-maxSamples)throw RangeError('Bristle sample ordinal exhausted')
 const samples:BristleStreamSample[]=[]
 while(samples.length<maxSamples&&cursor.nextLine<request.lines.length){
  const item=request.lines[cursor.nextLine],g=item.geometry
  cursor.line??=beginBristleInkLine(cursor.state,g.hair,g.start,g.end,g.length,g.pressure,item.color,antialias)
  if(cursor.line.hair!==g.hair)throw Error('Foreign Bristle streamed line')
  const step=advanceBristleInkLine(profile,cursor.state,cursor.line,maxSamples-samples.length)
  for(const sample of step.samples){
   if(cursor.sampleOrdinal===Number.MAX_SAFE_INTEGER)throw RangeError('Bristle sample ordinal exhausted')
   samples.push({x:sample.x,y:sample.y,flow:item.flow*sample.opacity,ceiling:item.ceiling,color:sample.color,group:request.ordinal,sampleOrdinal:cursor.sampleOrdinal++})
  }
  if(step.done){cursor.nextLine++;cursor.line=undefined}
 }
 return {samples,done:cursor.nextLine===request.lines.length}
}
/** Save/verify a complete pure replay. Later tiles cannot replace the result
 * with a different history, and do not modify the live gesture. */
export function completeBristleStreamPass(request:BristleStreamRequest,cursor:BristleStreamCursor):void{
 if(cursor.nextLine!==request.lines.length||cursor.line)throw Error('Incomplete Bristle streamed request')
 if(request.result){if(!equal(request.result,cursor.state))throw Error('Bristle tile replay changed ink state')}
 else request.result=copy(cursor.state)
}
export function commitBristleStreamRequest(request:BristleStreamRequest,live:BristleInkState):boolean{
 if(request.committed)return false
 if(!request.result)throw Error('Bristle streamed request has no completed pass')
 if(!equal(request.start,live))throw Error('Bristle gesture advanced before request completion')
 live.hairs=request.result.hairs.map(h=>({...h}));request.committed=true;return true
}
