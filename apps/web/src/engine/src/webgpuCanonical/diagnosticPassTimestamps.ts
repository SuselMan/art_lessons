/// <reference types="@webgpu/types" />
/** Bounded isolated diagnostic. Copies and uploads outside passes are NOT timed.
 * No resolve, submit, queue acknowledgement or map occurs while encoding input. */
export class DiagnosticPassTimestamps {
 private readonly queries:GPUQuerySet
 private used=0
 private closed=false
 private reading=false
 private readonly rows:Array<{index:number;kind:'compute'|'render';label:string;quantum:number}>=[]
 private quantum=0
 private active=0
 private readonly device:GPUDevice
 private readonly capacity:number
 constructor(device:GPUDevice,capacity=256){
  this.device=device;this.capacity=capacity
  if(!import.meta.env.DEV||!device.features.has('timestamp-query'))throw new Error('Timestamp recorder requires DEV enabled device')
  if(!Number.isInteger(capacity)||capacity<1||capacity>1024)throw new Error('Timestamp capacity invalid')
  this.queries=device.createQuerySet({type:'timestamp',count:capacity*2,label:'bounded native pass diagnostic'})
  void device.lost.then(()=>this.destroy(),()=>this.destroy())
 }
 begin(encoder:GPUCommandEncoder){
  if(this.closed||this.reading)throw new Error('Timestamp capture closed')
  const quantum=++this.quantum,pending:typeof this.rows=[]
  this.active++
  let ended=false
  const writes=(kind:'compute'|'render',descriptor:GPUComputePassDescriptor|GPURenderPassDescriptor)=>{
   if(ended||this.closed)throw new Error('Timestamp quantum closed')
   if(descriptor.timestampWrites)throw new Error('Timestamp descriptor already instrumented')
   if(this.used>=this.capacity)throw new Error('Timestamp capture capacity exceeded')
   const index=this.used++
   pending.push({index,kind,label:String(descriptor.label??'').slice(0,160),quantum})
   return{...descriptor,timestampWrites:{querySet:this.queries,beginningOfPassWriteIndex:index*2,endOfPassWriteIndex:index*2+1}}
  }
  const wrapped=new Proxy(encoder,{get:(target,key)=>{
   if(key==='beginComputePass')return(descriptor:GPUComputePassDescriptor={})=>{const prepared=writes('compute',descriptor);try{return target.beginComputePass(prepared)}catch(error){pending.pop();throw error}}
   if(key==='beginRenderPass')return(descriptor:GPURenderPassDescriptor)=>{const prepared=writes('render',descriptor);try{return target.beginRenderPass(prepared as GPURenderPassDescriptor)}catch(error){pending.pop();throw error}}
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
  }})
  return{encoder:wrapped,commit:()=>{if(ended||this.closed)throw new Error('Timestamp quantum already ended');ended=true;this.active--;this.rows.push(...pending)},abort:()=>{if(!ended){ended=true;this.active--}}}
 }
 /** Caller must have ended primary input before invoking this explicit readback.
  * Resolve only submitted pairs; abandoned encoder slots are never read. */
 async readAfterInput(){
  if(this.closed||this.reading||this.active)throw new Error('Timestamp capture closed or encoding')
  this.reading=true
  let resolved:GPUBuffer|undefined,read:GPUBuffer|undefined
  try{
   if(!this.rows.length)return[]
   const size=this.capacity*256
   resolved=this.device.createBuffer({size,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC})
   read=this.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
   const encoder=this.device.createCommandEncoder({label:'after input timestamp resolve'})
   for(const row of this.rows)encoder.resolveQuerySet(this.queries,row.index*2,2,resolved,row.index*256)
   encoder.copyBufferToBuffer(resolved,0,read,0,size)
   this.device.queue.submit([encoder.finish()])
   await read.mapAsync(GPUMapMode.READ)
   if(this.closed)throw new Error('Timestamp capture disposed during read')
   const values=new BigUint64Array(read.getMappedRange())
   return this.rows.map(row=>{const start=values[row.index*32],end=values[row.index*32+1];if(end<start)throw new Error('Timestamp result invalid');return{...row,nanoseconds:(end-start).toString()}})
  }finally{read?.destroy();resolved?.destroy();this.destroy()}
 }
 destroy(){if(this.closed)return;this.closed=true;this.queries.destroy();this.rows.length=0}
 /** Empty selected material candidates are not part of the measured job.
  * Reserved query indices remain unused; no GPU operation or reuse is introduced. */
 discardRecordedRows(){if(this.closed||this.reading||this.active)throw new Error('Timestamp discard while unavailable');this.rows.length=0}
}
