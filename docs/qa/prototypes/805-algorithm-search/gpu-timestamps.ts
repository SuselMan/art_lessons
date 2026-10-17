/** Optional diagnostic only. Query resolution/readback is outside the measured
 * compute pass. Primary end-to-end rows without profiling remain the controls. */
export function createPassProfiler(device:GPUDevice){
 if(!device.features.has('timestamp-query'))throw Error('Timestamp feature not enabled')
 const queries=device.createQuerySet({type:'timestamp',count:2})
 const resolve=device.createBuffer({size:16,usage:512|4})
 const staging=device.createBuffer({size:16,usage:1|8})
 let passes=0,destroyed=false
 return {
  run<T>(operation:()=>T):T{
   if(destroyed)throw Error('Profiler destroyed')
   const descriptor=Object.getOwnPropertyDescriptor(device,'createCommandEncoder')
   if(descriptor&&!descriptor.configurable)throw Error('Cannot install owned device profiler')
   const original=device.createCommandEncoder.bind(device);passes=0
   Object.defineProperty(device,'createCommandEncoder',{configurable:true,value:(options?:GPUCommandEncoderDescriptor)=>{
    const encoder=original(options),begin=encoder.beginComputePass.bind(encoder),finish=encoder.finish.bind(encoder)
    Object.defineProperty(encoder,'beginComputePass',{configurable:true,value:(options?:GPUComputePassDescriptor)=>{
     if(options?.timestampWrites||++passes!==1)throw Error('Profiler requires exactly one unprofiled compute pass')
     return begin({...options,timestampWrites:{querySet:queries,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}})
    }})
    Object.defineProperty(encoder,'finish',{configurable:true,value:(options?:GPUCommandBufferDescriptor)=>{
     if(passes!==1)throw Error('Missing profiled compute pass')
     encoder.resolveQuerySet(queries,0,2,resolve,0)
     encoder.copyBufferToBuffer(resolve,0,staging,0,16)
     return finish(options)
    }})
    return encoder
   }})
   try{return operation()}finally{
    if(descriptor)Object.defineProperty(device,'createCommandEncoder',descriptor)
    else Reflect.deleteProperty(device,'createCommandEncoder')
   }
  },
  async read(){
   if(destroyed||passes!==1)throw Error('No profiled result')
   await staging.mapAsync(1)
   try{const ticks=new BigUint64Array(staging.getMappedRange());if(ticks[1]<ticks[0])throw Error('Reversed GPU timestamps');return Number(ticks[1]-ticks[0])/1e6}finally{staging.unmap()}
  },
  destroy(){if(destroyed)return;destroyed=true;queries.destroy();resolve.destroy();staging.destroy()},
 }
}
