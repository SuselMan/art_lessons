import{MYPAINT_WASM_SHA256}from'./mypaintKernelBuild'
export interface MyPaintKernel{
 memory:WebAssembly.Memory
 grafetto_create(seed:number):number
 grafetto_destroy(handle:number):void
 grafetto_alloc(bytes:number):number
 grafetto_free(pointer:number):void
 grafetto_quantize(pointer:number):void
 grafetto_unpack(pointer:number):void
 grafetto_base(handle:number,id:number,value:number):void
 grafetto_mapping(handle:number,id:number,input:number,count:number):void
 grafetto_point(handle:number,id:number,input:number,index:number,x:number,y:number):void
 grafetto_begin(handle:number):void
 grafetto_end(handle:number):void
 grafetto_stroke(handle:number,x:number,y:number,pressure:number,tiltX:number,tiltY:number,seconds:number):number
 _initialize():void
}
let kernel:MyPaintKernel|undefined,pending:Promise<void>|undefined,tileRequest:((x:number,y:number,readonly:number)=>number)|undefined
export const mypaintKernelReady=():boolean=>!!kernel
export function mypaintKernel():MyPaintKernel{if(!kernel)throw Error('MyPaint kernel is not prepared');return kernel}
export function withMyPaintTiles<T>(request:NonNullable<typeof tileRequest>,work:()=>T):T{
 if(tileRequest)throw Error('Nested MyPaint tile transaction')
 tileRequest=request;try{return work()}finally{tileRequest=undefined}
}
export function prepareMyPaintKernel():Promise<void>{
 if(kernel)return Promise.resolve()
 return pending??=(async()=>{
  const r=await fetch('/brush-kernels/mypaint-1.6.1.wasm');if(!r.ok)throw Error('MyPaint kernel download failed')
  const bytes=await r.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
  if(hash!==MYPAINT_WASM_SHA256)throw Error('MyPaint kernel integrity mismatch')
  const module=await WebAssembly.compile(bytes),allowed=new Set(['env.grafetto_tile','env.emscripten_notify_memory_growth','wasi_snapshot_preview1.proc_exit','wasi_snapshot_preview1.fd_close','wasi_snapshot_preview1.fd_write','wasi_snapshot_preview1.fd_seek'])
  if(WebAssembly.Module.imports(module).some(x=>x.kind!=='function'||!allowed.has(x.module+'.'+x.name)))throw Error('Unexpected MyPaint kernel imports')
  let exports:MyPaintKernel
  const instance=await WebAssembly.instantiate(module,{env:{grafetto_tile:(x:number,y:number,readonly:number)=>{if(!tileRequest)throw Error('MyPaint tile outside transaction');return tileRequest(x,y,readonly)},emscripten_notify_memory_growth:()=>{}},wasi_snapshot_preview1:{proc_exit:(code:number)=>{throw Error('MyPaint kernel abort '+code)},fd_close:()=>0,fd_seek:()=>0,fd_write:(_fd:number,iov:number,count:number,written:number)=>{const words=new Uint32Array(exports.memory.buffer);let bytes=0;for(let i=0;i<count;i++)bytes+=words[(iov>>>2)+i*2+1];words[written>>>2]=bytes;return 0}}})
  exports=instance.exports as unknown as MyPaintKernel;exports._initialize();kernel=exports
 })().catch(e=>{pending=undefined;throw e})
}
