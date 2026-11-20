import{it,expect,beforeAll,vi}from'vitest'
import{readFileSync}from'node:fs'
import{prepareMyPaintKernel,mypaintKernel}from'./mypaintKernel'
beforeAll(async()=>{const old=globalThis.fetch;globalThis.fetch=vi.fn(async()=>new Response(readFileSync(new URL('../../../../public/brush-kernels/mypaint-1.6.1.wasm',import.meta.url))));try{await prepareMyPaintKernel()}finally{globalThis.fetch=old}})
it('matches the old JavaScript conversion for every unsigned16-bit channel value',()=>{
 const k=mypaintKernel(),p=k.grafetto_alloc(64*64*12);let mismatch=0
 try{for(let batch=0;batch<4;batch++){
  const q=new Uint16Array(k.memory.buffer,p,64*64*4);for(let i=0;i<q.length;i++)q[i]=batch*q.length+i
  k.grafetto_quantize(p);const bytes=new Uint8Array(k.memory.buffer,p+64*64*8,64*64*4)
  for(let i=0;i<q.length;i++){const expected=Math.round(Math.min(1,(batch*q.length+i)/32768)*255);if(bytes[i]!==expected||q[i]!==Math.round(expected*32768/255))mismatch++}
  k.grafetto_unpack(p);for(let i=0;i<q.length;i++)if(q[i]!==Math.round(bytes[i]*32768/255))mismatch++
 }}finally{k.grafetto_free(p)}
 expect(mismatch).toBe(0)
})
