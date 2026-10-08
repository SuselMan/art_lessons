import type {CanonicalFieldBuffer} from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import {spatialSummary} from './stageAudit'
/** Snapshot commands join the ORIGINAL source encoder immediately after initialization.
 * Mapping is deferred until its caller has submitted/completed that encoder. */
export function captureSolventInit(device:GPUDevice,encoder:GPUCommandEncoder,fields:Record<string,CanonicalFieldBuffer>){
 const roles=Object.entries(fields)
 if(roles.reduce((n,[,b])=>n+b.width*b.height*4,0)>12*1024*1024)throw new Error('Solvent init capture exceeds12MiB')
 if(new Set(roles.map(([,b])=>b.texture)).size!==roles.length)throw new Error('Solvent init roles alias')
 const snapshots:Array<{role:string;field:CanonicalFieldBuffer;buffer:GPUBuffer;pitch:number}>=[]
 try{for(const [role,field] of roles){const pitch=Math.ceil(field.width*4/256)*256,buffer=device.createBuffer({size:pitch*field.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});snapshots.push({role,field,buffer,pitch});encoder.copyTextureToBuffer({texture:field.texture},{buffer,bytesPerRow:pitch},[field.width,field.height])}}catch(error){snapshots.forEach(s=>s.buffer.destroy());throw error}
 let used=false
 const read=async()=>{
  if(used)throw new Error('Solvent init capture already consumed');used=true
  const result:Record<string,unknown>={}
  try{for(const s of snapshots){await s.buffer.mapAsync(GPUMapMode.READ);const mapped=new Uint8Array(s.buffer.getMappedRange()),bytes=new Uint8Array(s.field.width*s.field.height*4);for(let y=0;y<s.field.height;y++)bytes.set(mapped.subarray(y*s.pitch,y*s.pitch+s.field.width*4),y*s.field.width*4);s.buffer.unmap();const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer)),v=>v.toString(16).padStart(2,'0')).join('');result[s.role]={width:s.field.width,height:s.field.height,nonzero:bytes.reduce((n,v)=>n+ +(v!==0),0),sha256,...spatialSummary(bytes,s.field.width,s.field.height,null),representatives:[0,Math.floor(s.field.width*s.field.height/2),s.field.width*s.field.height-1].map(p=>({pixel:p,rgba:Array.from(bytes.subarray(p*4,p*4+4))}))}}return result}finally{snapshots.forEach(s=>s.buffer.destroy())}
 }
 return Object.assign(read,{dispose:()=>snapshots.forEach(s=>s.buffer.destroy())})
}
