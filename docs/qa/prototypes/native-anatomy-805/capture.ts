/** Synchronous QA callbacks; actual buffer snapshots, never generated illustrations. */
export interface Plane {width:number;height:number;readPixels():Uint8Array}
export interface AnatomyEvent {stage:string;outputs:Record<string,Plane|null|undefined>;detail:unknown}
export interface Snapshot {stage:string;ordinal:number;role:string;width:number;height:number;rows:'gl-bottom-up';rgba:Uint8Array}
export function installAnatomyCapture(gl:WebGLRenderingContext,options:{select:(e:AnatomyEvent,ordinal:number)=>boolean;onEvent?:(e:AnatomyEvent,ordinal:number)=>void;onSnapshot:(s:Snapshot)=>void;maxReadBytes?:number}){
 const key='__qaNativeAnatomy805',target=globalThis as unknown as Record<string,unknown>,descriptor=Object.getOwnPropertyDescriptor(target,key);if(target[key]!==undefined)throw Error('Native anatomy capture already installed')
 let ordinal=0,bytes=0,disposed=false,inCallback=false;const cap=options.maxReadBytes??128*1024*1024;if(!Number.isSafeInteger(cap)||cap<0)throw Error('Invalid snapshot cap')
 const hook=(e:AnatomyEvent)=>{if(disposed)return;if(inCallback)throw Error('Reentrant anatomy callback');inCallback=true;try{const at=ordinal++;options.onEvent?.(e,at);if(!options.select(e,at))return;for(const [role,p]of Object.entries(e.outputs)){if(!p)continue;const n=p.width*p.height*4;if(!Number.isSafeInteger(n)||n<4||bytes+n>cap)throw Error('Anatomy snapshot byte cap');const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING);let data:Uint8Array;try{data=p.readPixels()}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,fbo)}if(data.byteLength!==n)throw Error('Anatomy plane size mismatch');bytes+=n;options.onSnapshot({stage:e.stage,ordinal:at,role,width:p.width,height:p.height,rows:'gl-bottom-up',rgba:data})}}finally{inCallback=false}}
 Object.defineProperty(target,key,{configurable:true,writable:true,value:hook})
 return{get readBytes(){return bytes},get eventCount(){return ordinal},dispose(){if(disposed)return;disposed=true;if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key]}}
}
/** CUMULATIVE prefix wall incl ONE actual full-plane read, never per-stage GPU elapsed.
 * Caller provides fresh replay and cleanup (cancel/destroy even if reset aborts early).
 * Untimed picture replays and whole baselines must be separate experiments.
 */
export function measureAnatomyPrefix(options:{gl:WebGLRenderingContext;stage:string;occurrence:number;role:string;execute:()=>void;cleanup:()=>void;now?:()=>number;maxReadBytes?:number}){
 if(!Number.isSafeInteger(options.occurrence)||options.occurrence<0)throw Error('Invalid prefix occurrence')
 const stop={},clock=options.now??(()=>performance.now());let seen=0,result:Snapshot|undefined,elapsed=0,started=0
 const hook=installAnatomyCapture(options.gl,{maxReadBytes:options.maxReadBytes,select:()=>false,onSnapshot:()=>{},onEvent(e,ordinal){if(e.stage!==options.stage||seen++!==options.occurrence)return;const p=e.outputs[options.role];if(!p)throw Error('Prefix role not present: '+options.role);const n=p.width*p.height*4;if(n>(options.maxReadBytes??64*1024*1024))throw Error('Prefix read cap');const fbo=options.gl.getParameter(options.gl.FRAMEBUFFER_BINDING);let rgba:Uint8Array;try{rgba=p.readPixels()}finally{options.gl.bindFramebuffer(options.gl.FRAMEBUFFER,fbo)}if(rgba.byteLength!==n)throw Error('Prefix read size');result={stage:e.stage,ordinal,role:options.role,width:p.width,height:p.height,rows:'gl-bottom-up',rgba};elapsed=clock()-started;throw stop}})
 try{started=clock();try{options.execute()}catch(error){if(error!==stop)throw error}if(!result)throw Error('Prefix stage not reached');return{snapshot:result,cumulativePrefixWallMs:elapsed,scope:'fresh replay through selected producer plus one full-plane dependency read; NOT per-stage GPU elapsed' as const}}
 finally{try{hook.dispose()}finally{options.cleanup()}}
}
