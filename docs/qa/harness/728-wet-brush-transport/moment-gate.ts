/// <reference types="@webgpu/types" />
import {WetBrushMomentGpu,packMomentRecords,momentGpuOracle,auditMomentRecords,type MomentGpuPass} from '../../../../apps/web/src/engine/src/experiments/wetBrushMomentGpu'
/** Actual GPU integer kernel gate; timing includes submit/readback and is NOT GPU time. */
export async function runMomentGate(fixture?:{width:number;height:number;p:Uint8Array;c:Uint8Array;wet:Uint8Array;contact:Uint8Array}){
 const width=fixture?.width??17,height=fixture?.height??13,n=width*height
 const p=fixture?.p??new Uint8Array(n*4),c=fixture?.c??new Uint8Array(n*4),wet=fixture?.wet??new Uint8Array(n).fill(255),contact=fixture?.contact??wet
 if(!fixture)for(let i=0;i<n;i++){p.set([i%256,200,100,220],i*4);c.set([i%2?90:10,30,20,100],i*4)}
 const audit=auditMomentRecords(p,c);if(!audit.supported)return{valid:false,audit,reason:'Unsupported actual carrier; no GPU work performed'}
 let oracle:Uint32Array=packMomentRecords(p,c,wet,contact)
 if(!navigator.gpu)throw Error('Actual WebGPU required');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No adapter');const device=await adapter.requestDevice(),errors:string[]=[],owned:GPUBuffer[]=[]
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message));const allocate=(size:number,usage:GPUBufferUsageFlags)=>{const b=device.createBuffer({size,usage});owned.push(b);return b}
 try{const size=oracle.byteLength,buffers=[allocate(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC),allocate(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC)],invalid=allocate(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),read=allocate(size+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),operator=new WetBrushMomentGpu(device)
 device.queue.writeBuffer(buffers[0],0,oracle);let index=0;const start=performance.now(),encoder=device.createCommandEncoder()
 for(let iteration=0;iteration<8;iteration++)for(const axis of [0,1] as const)for(const parity of [0,1] as const){const pass:MomentGpuPass={width,height,axis,parity,mixRate:48,advectionRate:80,direction:iteration%2?-256:256};oracle=momentGpuOracle(oracle,pass);owned.push(...operator.encode(encoder,buffers[index],buffers[1-index],invalid,pass,true));index=1-index}
 encoder.copyBufferToBuffer(buffers[index],0,read,0,size);encoder.copyBufferToBuffer(invalid,0,read,size,4);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const actual=new Uint32Array(read.getMappedRange().slice(0,size)),bad=new Uint32Array(read.getMappedRange().slice(size))[0];read.unmap();let differences=0,maxDifference=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-oracle[i]);if(d){differences++;maxDifference=Math.max(d,maxDifference)}}
 return{valid:differences===0&&bad===0&&errors.length===0,width,height,passes:32,audit,invalidPairs:bad,differences,maxDifference,errors,submitAndReadbackMs:performance.now()-start,limitations:['Synthetic Q8 fixture unless actual records supplied','Integer storage gate does not prove texture pack/unpack fidelity','No Room integration or artwork quality claim']}
 }finally{for(const b of owned)b.destroy();device.destroy()}
}
