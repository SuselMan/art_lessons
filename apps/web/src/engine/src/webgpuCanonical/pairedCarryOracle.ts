/// <reference types="@webgpu/types" />
import type {CanonicalWatercolorWebGpu} from './backend'
import type {CanonicalGpuContext} from './types'
import {CanonicalFieldBuffer} from './fieldBuffer'
import type {SettlePlanFieldOptions} from '../watercolor/SettlePlanContracts'
interface Snapshot {width:number;height:number;pitch:number;buffer:GPUBuffer}
const difference=(a:Uint8Array,b:Uint8Array)=>{let changed=0,max=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d);total+=d}return{changed,max,total}}
/** QA-only single actual pair. Copies are encoded at exact boundaries, not
 * deferred reads of textures that the next iteration can mutate. */
export class CanonicalCarryOracle {
 private readonly snapshots=new Map<string,Snapshot>()
 readonly metadata:unknown
 constructor(ctx:CanonicalGpuContext,owner:CanonicalWatercolorWebGpu,fields:{p:CanonicalFieldBuffer;c:CanonicalFieldBuffer;fixed:CanonicalFieldBuffer;outP:CanonicalFieldBuffer;outC:CanonicalFieldBuffer},k:number,options:SettlePlanFieldOptions<CanonicalFieldBuffer>,paired:()=>void,legacy:(p:CanonicalFieldBuffer,c:CanonicalFieldBuffer)=>void){
  const {p,c,fixed,outP,outC}=fields
  if(outP.width>2048||outP.height>2048)throw new Error('Carry oracle exceeds bounded2048 extent')
  const ids=new Map<CanonicalFieldBuffer,number>();const id=(b:CanonicalFieldBuffer)=>{if(!ids.has(b))ids.set(b,ids.size+1);return ids.get(b)}
  this.metadata={k,options:{...options,c:undefined,d:options.d?.field.label,e:options.e?.field.label,path:options.path?.field.label},fields:Object.fromEntries(Object.entries(fields).map(([role,b])=>[role,{id:id(b),width:b.width,height:b.height,filter:b.filter,label:b.field.label}]))}
  const expectedP=new CanonicalFieldBuffer(owner,outP.width,outP.height,'nearest','carry oracle expectedP'),expectedC=new CanonicalFieldBuffer(owner,outC.width,outC.height,'nearest','carry oracle expectedC')
  try{
   outP.copyTo(expectedP);outC.copyTo(expectedC)
   for(const [name,b]of Object.entries({oldP:p,oldC:c,fixed,cost:options.d,solvent:options.e,path:options.path}))if(b)this.capture(ctx,name,b)
   paired();legacy(expectedP,expectedC)
   for(const [name,b]of Object.entries({pairedP:outP,pairedC:outC,expectedP,expectedC}))this.capture(ctx,name,b)
  }catch(error){this.destroy();throw error}finally{expectedP.destroy();expectedC.destroy()}
 }
 private capture(ctx:CanonicalGpuContext,name:string,b:CanonicalFieldBuffer){
  if(b.width>2048||b.height>2048)throw new Error('Oracle input exceeds bounded2048 extent')
  const pitch=Math.ceil(b.width*4/256)*256,buffer=ctx.device.createBuffer({label:'carry oracle '+name,size:pitch*b.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
  const retained=[...this.snapshots.values()].reduce((n,s)=>n+s.pitch*s.height,0);if(retained+pitch*b.height>128*1024*1024){buffer.destroy();throw new Error('Actual carry oracle exceeds128MiB staging budget')}
  this.snapshots.set(name,{width:b.width,height:b.height,pitch,buffer});ctx.encoder.copyTextureToBuffer({texture:b.texture},{buffer,bytesPerRow:pitch},[b.width,b.height])
 }
 async read(){
  const bytes=new Map<string,Uint8Array>(),roles:Record<string,unknown>={}
  try{for(const [name,s]of this.snapshots){await s.buffer.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(s.buffer.getMappedRange()),data=new Uint8Array(s.width*s.height*4);for(let y=0;y<s.height;y++)data.set(raw.subarray(y*s.pitch,y*s.pitch+s.width*4),y*s.width*4);s.buffer.unmap();bytes.set(name,data);roles[name]={width:s.width,height:s.height,nonzero:data.reduce((n,v)=>n+ +(v!==0),0),sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('')}}
   const pigment=difference(bytes.get('expectedP')!,bytes.get('pairedP')!),color=difference(bytes.get('expectedC')!,bytes.get('pairedC')!);return{metadata:this.metadata,roles,pigment,color,exact:!pigment.changed&&!color.changed,scope:'ONE actual chronological pair; QA copies/shadow passes perturb workload, not a timing gate'}
  }finally{this.destroy()}
 }
 destroy(){for(const s of this.snapshots.values())s.buffer.destroy();this.snapshots.clear()}
}
