import type {CanonicalFieldBuffer} from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const fnv=(bytes:Uint8Array)=>{let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h.toString(16)}
export interface StageRole {width:number;height:number;nonzero:number;sha256:string;bbox?:[number,number,number,number]|null;nonzeroOutsideRevealRect?:number;revealRectGL?:readonly number[]|null}
export interface StageRow {operation:number;stage:string;roles:Record<string,StageRole|null>;cpuSourceHash:string;cpuPlanHash:string;cpuPassHash:string;sourceCalls:number;planCalls:number;passCalls:number;planParameters:unknown[]}
/** Bounds are top-down pixels; reveal rectangle uses the production bottom-up GL contract. */
export function spatialSummary(bytes:Uint8Array,width:number,height:number,rect:readonly number[]|null){
 if(bytes.length!==width*height*4)throw new Error('Spatial capture dimensions mismatch')
 let left=width,top=height,right=0,bottom=0,outside=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;let nz=0;for(let c=0;c<4;c++)nz+=+(bytes[i+c]!==0)
  if(!nz)continue
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1)
  const gy=height-y-.5
  if(!rect||x+.5<rect[0]||x+.5>=rect[0]+rect[2]||gy<rect[1]||gy>=rect[1]+rect[3])outside+=nz
 }
 return{bbox:right?[left,top,right-left,bottom-top] as [number,number,number,number]:null,nonzeroOutsideRevealRect:outside,revealRectGL:rect?[...rect]:null}
}
/** Hash-only baseline metadata; do not retain hundreds of MiB of per-op pixels. */
export class StageAudit {
 private readonly ids=new WeakMap<object,number>();private nextId=0
 private source:string[]=[];private plan:string[]=[];private passes:string[]=[]
 private params:unknown[]=[]
 private normalize(value:unknown,depth=0):unknown {
  if(depth>10)return'bounded-depth'
  if(ArrayBuffer.isView(value))return{type:value.constructor.name,bytes:value.byteLength,hash:fnv(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))}
  if(Array.isArray(value))return value.map(v=>this.normalize(v,depth+1))
  if(value instanceof Set)return[...value].map(v=>this.normalize(v,depth+1)).sort()
  if(value&&typeof value==='object'){
   const v=value as Record<string,unknown>
   if(typeof v.width==='number'&&typeof v.height==='number'&&('field'in v||'texture'in v)){if(!this.ids.has(value))this.ids.set(value,++this.nextId);return{id:this.ids.get(value),width:v.width,height:v.height,filter:v.filter,label:'field'in v?(v.field as {label?:string}).label:v.label}}
   return Object.fromEntries(Object.entries(v).filter(([k])=>!['owner','device','encoder'].includes(k)).map(([k,x])=>[k,this.normalize(x,depth+1)]))
  }
  return typeof value==='function'?'callback':value
 }
 reset(){this.source=[];this.plan=[];this.passes=[];this.params=[]}
 record(kind:'source'|'plan'|'pass',args:unknown[]){const v=this.normalize(args),encoded=JSON.stringify(v),hash=fnv(new TextEncoder().encode(encoded));if(kind==='source')this.source.push(hash);else if(kind==='pass')this.passes.push(hash);else{this.plan.push(hash);if(this.params.length<4)this.params.push(v)}}
 snapshot(operation:number,stage:string,buffers:Record<string,CanonicalFieldBuffer|null|undefined>,read:(b:CanonicalFieldBuffer)=>Promise<Uint8Array>,revealRect?:readonly number[]|null):Promise<StageRow>{
  const sum=Object.values(buffers).reduce((n,b)=>n+(b?b.width*b.height*4:0),0);if(sum>40*1024*1024)throw new Error('Per-operation stage exceeds40MiB budget')
  const frozenRect=revealRect?[...revealRect]:revealRect
  const pending=Object.entries(buffers).map(([role,b])=>({role,width:b?.width??0,height:b?.height??0,bytes:b?read(b):null}))
  const cpu={cpuSourceHash:fnv(new TextEncoder().encode(this.source.join(','))),cpuPlanHash:fnv(new TextEncoder().encode(this.plan.join(','))),cpuPassHash:fnv(new TextEncoder().encode(this.passes.join(','))),sourceCalls:this.source.length,planCalls:this.plan.length,passCalls:this.passes.length,planParameters:structuredClone(this.params)}
  return(async()=>{const roles:Record<string,StageRole|null>={};for(const p of pending){if(!p.bytes){roles[p.role]=null;continue}const bytes=await p.bytes;roles[p.role]={width:p.width,height:p.height,nonzero:bytes.reduce((n,v)=>n+ +(v!==0),0),sha256:await digest(bytes),...(frozenRect!==undefined?spatialSummary(bytes,p.width,p.height,frozenRect):{})}}return{operation,stage,roles,...cpu}})()
 }
}
export function compareStages(a:StageRow[],b:StageRow[]){
 if(a.length!==b.length)return{exact:false,firstDivergence:{reason:'stage count',a:a.length,b:b.length}}
 for(let i=0;i<a.length;i++){
  if(a[i].operation!==b[i].operation||a[i].stage!==b[i].stage)return{exact:false,firstDivergence:{index:i,reason:'stage order'}}
  const cpuDifferences=[];for(const key of ['cpuSourceHash','cpuPlanHash','cpuPassHash'] as const)if(a[i][key]!==b[i][key])cpuDifferences.push({key,a:a[i][key],b:b[i][key]})
  const roleDifferences=[];for(const role of new Set([...Object.keys(a[i].roles),...Object.keys(b[i].roles)]))if(JSON.stringify(a[i].roles[role])!==JSON.stringify(b[i].roles[role]))roleDifferences.push({role,a:a[i].roles[role],b:b[i].roles[role]})
  if(cpuDifferences.length||roleDifferences.length)return{exact:false,firstDivergence:{index:i,operation:a[i].operation,stage:a[i].stage,cpuDifferences,roleDifferences}}
 }
 return{exact:true,firstDivergence:null}
}
