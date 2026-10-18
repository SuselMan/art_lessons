/** Optional diagnostic only. Query resolution/readback is outside the measured
 * compute passes. Primary rows without profiling remain the controls.
 * Each pair resolves at a distinct256-byte aligned offset, across encoders.
 */
export function createPassProfiler(device:GPUDevice,maxPasses=1){
 if(!Number.isInteger(maxPasses)||maxPasses<1||maxPasses>8)throw Error('Invalid profiler pass bound')
 if(!device.features.has('timestamp-query'))throw Error('Timestamp feature not enabled')
 const queries=device.createQuerySet({type:'timestamp',count:maxPasses*2})
 const resolve=device.createBuffer({size:maxPasses*256,usage:512|4})
 const staging=device.createBuffer({size:maxPasses*256,usage:1|8})
 let passes=0,resolvedPasses=0,destroyed=false,valid=false,lastPassMs:number[]=[]
 return {
  get lastPassMs(){return lastPassMs.slice()},
  run<T>(operation:()=>T):T{
   if(destroyed)throw Error('Profiler destroyed')
   const descriptor=Object.getOwnPropertyDescriptor(device,'createCommandEncoder')
   if(descriptor&&!descriptor.configurable)throw Error('Cannot install owned device profiler')
   const original=device.createCommandEncoder.bind(device);passes=0;resolvedPasses=0;valid=false;lastPassMs=[]
   Object.defineProperty(device,'createCommandEncoder',{configurable:true,value:(options?:GPUCommandEncoderDescriptor)=>{
    const encoder=original(options),begin=encoder.beginComputePass.bind(encoder),finish=encoder.finish.bind(encoder),localPasses:number[]=[]
    Object.defineProperty(encoder,'beginComputePass',{configurable:true,value:(options?:GPUComputePassDescriptor)=>{
     if(options?.timestampWrites||passes>=maxPasses)throw Error('Profiler requires bounded unprofiled compute passes')
     const index=passes++;localPasses.push(index)
     return begin({...options,timestampWrites:{querySet:queries,beginningOfPassWriteIndex:index*2,endOfPassWriteIndex:index*2+1}})
    }})
    Object.defineProperty(encoder,'finish',{configurable:true,value:(options?:GPUCommandBufferDescriptor)=>{
     for(const index of localPasses){encoder.resolveQuerySet(queries,index*2,2,resolve,index*256);encoder.copyBufferToBuffer(resolve,index*256,staging,index*256,16)}
     const result=finish(options);resolvedPasses+=localPasses.length;return result
    }})
    return encoder
   }})
   try{const result=operation();if(!passes||resolvedPasses!==passes)throw Error('Missing finished profiled compute pass');valid=true;return result}finally{
    if(descriptor)Object.defineProperty(device,'createCommandEncoder',descriptor)
    else Reflect.deleteProperty(device,'createCommandEncoder')
   }
  },
  async read(){
   if(destroyed||!valid)throw Error('No profiled result')
   await staging.mapAsync(1)
   try{const ticks=new BigUint64Array(staging.getMappedRange()),times:number[]=[];for(let i=0;i<passes;i++){const start=ticks[i*32],end=ticks[i*32+1];if(end<start)throw Error('Reversed GPU timestamps');times.push(Number(end-start)/1e6)}lastPassMs=times;return times.reduce((a,b)=>a+b,0)}finally{staging.unmap()}
  },
  destroy(){if(destroyed)return;destroyed=true;queries.destroy();resolve.destroy();staging.destroy()},
 }
}
