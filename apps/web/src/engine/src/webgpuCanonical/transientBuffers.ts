/** An encode failure discards its command encoder. Buffers allocated by that
 * failed pass are still ours, and must not escape before the caller can retain
 * them. Successful passes transfer ownership of the returned buffers. */
export function withTransientGpuBuffers(encode:(retain:<T extends GPUBuffer>(buffer:T)=>T)=>GPUBuffer[]):GPUBuffer[] {
 const allocated=new Set<GPUBuffer>()
 try{return encode(buffer=>{allocated.add(buffer);return buffer})}
 catch(error){for(const buffer of allocated)buffer.destroy();throw error}
}
