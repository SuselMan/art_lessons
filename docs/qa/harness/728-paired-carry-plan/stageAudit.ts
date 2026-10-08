import type {CanonicalFieldBuffer} from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const fnv=(bytes:Uint8Array)=>{let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h.toString(16)}
export interface StageRole {width:number;height:number;nonzero:number;sha256:string}
export interface StageRow {operation:number;stage:string;roles:Record<string,StageRole|null>;cpuSourceHash:string;cpuPlanHash:string;cpuPassHash:string;sourceCalls:number;planCalls:number;passCalls:number;planParameters:unknown[]}
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
 snapshot(operation:number,stage:string,buffers:Record<string,CanonicalFieldBuffer|null|undefined>,read:(b:CanonicalFieldBuffer)=>Promise<Uint8Array>):Promise<StageRow>{
  const sum=Object.values(buffers).reduce((n,b)=>n+(b?b.width*b.height*4:0),0);if(sum>40*1024*1024)throw new Error('Per-operation stage exceeds40MiB budget')
  const pending=Object.entries(buffers).map(([role,b])=>({role,width:b?.width??0,height:b?.height??0,bytes:b?read(b):null}))
  const cpu={cpuSourceHash:fnv(new TextEncoder().encode(this.source.join(','))),cpuPlanHash:fnv(new TextEncoder().encode(this.plan.join(','))),cpuPassHash:fnv(new TextEncoder().encode(this.passes.join(','))),sourceCalls:this.source.length,planCalls:this.plan.length,passCalls:this.passes.length,planParameters:structuredClone(this.params)}
  return(async()=>{const roles:Record<string,StageRole|null>={};for(const p of pending){if(!p.bytes){roles[p.role]=null;continue}const bytes=await p.bytes;roles[p.role]={width:p.width,height:p.height,nonzero:bytes.reduce((n,v)=>n+ +(v!==0),0),sha256:await digest(bytes)}}return{operation,stage,roles,...cpu}})()
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
