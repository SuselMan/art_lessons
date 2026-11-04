/** INTERNAL two-field service for an explicitly registered engine context.
 * No method/prototype patching; foreign code must invalidate before raw writes.
 * Unknown contexts always read native state. This is not a general GL cache. */
type Color=readonly[number,number,number,number]
type Mask=readonly[boolean,boolean,boolean,boolean]
export interface GlClearStateOwner {invalidate():void;release():void}
interface RecordState {readonly gl:WebGLRenderingContext;readonly generation:object;readonly current:()=>boolean;readonly clear:WebGLRenderingContext['clearColor'];readonly mask:WebGLRenderingContext['colorMask'];active:boolean;epoch:object;color?:Color;writeMask?:Mask}
const records=new WeakMap<WebGLRenderingContext,RecordState>()
let foreignDepth=0,invalidationEpoch:object={}
/** Scoped invalidation only, not ambient GL state. No service mirror is read or
 * updated while generic callbacks may invoke arbitrary native writers. */
export function beginUntrackedGlClearState():()=>void {
 foreignDepth++;invalidationEpoch={};let released=false
 return ()=>{if(released)return;released=true;foreignDepth--;invalidationEpoch={}}
}
export function withUntrackedGlClearState<T>(work:()=>T):T {const end=beginUntrackedGlClearState();try{return work()}finally{end()}}
const colorValue=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1&&!Object.is(v,-0)&&Math.fround(v)===v
const colorCopy=(value:readonly number[]):Color=>Object.freeze([value[0],value[1],value[2],value[3]])
const maskCopy=(value:readonly boolean[]):Mask=>Object.freeze([value[0],value[1],value[2],value[3]])
function live(gl:WebGLRenderingContext):RecordState|undefined {
 if(foreignDepth)return
 const state=records.get(gl);if(!state?.active)return
 if(state.epoch!==invalidationEpoch){state.color=undefined;state.writeMask=undefined;state.epoch=invalidationEpoch}
 try{if(gl.clearColor===state.clear&&gl.colorMask===state.mask&&state.current()===true&&!gl.isContextLost())return state}catch{/* Pure engine generation predicates fail closed. */}
 state.active=false;state.color=undefined;state.writeMask=undefined
}
/** Native query seeds the exact physical generation once. Never shares an
 * existing active registration, nor assumes default GL state. */
export function registerGlClearState(gl:WebGLRenderingContext,generation:object,current:()=>boolean):GlClearStateOwner {
 if(!generation||typeof generation!=='object'||typeof current!=='function'||records.get(gl)?.active)throw Error('GL clear state owner already registered or invalid')
 if(gl.isContextLost()||current()!==true)throw Error('GL clear state generation unavailable')
 const color=gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array|null,mask=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[]|null
 const state:RecordState={gl,generation,current,clear:gl.clearColor,mask:gl.colorMask,active:true,epoch:invalidationEpoch}
 if(color?.length===4&&Array.from(color).every(colorValue))state.color=colorCopy(Array.from(color))
 if(mask?.length===4&&mask.every(v=>typeof v==='boolean'))state.writeMask=maskCopy(mask)
 // Queries/callbacks may synchronously change the registration/generation.
 if(records.get(gl)?.active||gl.isContextLost()||current()!==true)throw Error('GL clear state changed during registration')
 records.set(gl,state)
 return Object.freeze({invalidate(){if(records.get(gl)===state){state.color=undefined;state.writeMask=undefined}},release(){state.active=false;state.color=undefined;state.writeMask=undefined;if(records.get(gl)===state)records.delete(gl)}})
}
/** Explicit boundary for future untracked foreign GL writers. It does not
 * adopt them: the next capture queries each invalidated native field. */
export function invalidateGlClearState(gl:WebGLRenderingContext):void {const state=records.get(gl);if(state){state.color=undefined;state.writeMask=undefined}}
export function setGlClearColor(gl:WebGLRenderingContext,r:number,g:number,b:number,a:number):void {
 const state=live(gl);if(state)state.color=undefined
 // Delegate original arguments exactly once, including coercion/NaN/infinity.
 gl.clearColor(r,g,b,a)
 if(state&&live(gl)===state&&[r,g,b,a].every(colorValue))state.color=colorCopy([r,g,b,a])
}
export function setGlColorMask(gl:WebGLRenderingContext,r:boolean,g:boolean,b:boolean,a:boolean):void {
 const state=live(gl);if(state)state.writeMask=undefined
 gl.colorMask(r,g,b,a)
 if(state&&live(gl)===state&&[r,g,b,a].every(v=>typeof v==='boolean'))state.writeMask=maskCopy([r,g,b,a])
}
/** Snapshot values never alias private mirror arrays or native query results. */
export function captureGlClearState(gl:WebGLRenderingContext):Readonly<{color:Color|null;mask:Mask|null}> {
 const state=live(gl)
 let color=state?.color,mask=state?.writeMask
 if(!color){const native=gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array|null;color=native?.length===4?colorCopy(Array.from(native)):undefined;if(state&&live(gl)===state&&color?.every(colorValue))state.color=colorCopy(color)}
 if(!mask){const native=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[]|null;mask=native?.length===4?maskCopy(native):undefined;if(state&&live(gl)===state&&mask?.every(v=>typeof v==='boolean'))state.writeMask=maskCopy(mask)}
 if(state&&live(gl)!==state)return captureGlClearState(gl)
 return Object.freeze({color:color?colorCopy(color):null,mask:mask?maskCopy(mask):null})
}
