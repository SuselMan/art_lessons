import {expect,it} from 'vitest'
import {privatePublicationPattern,publicationByteComparison} from './privatePublicationProbe'
import {canonicalTopRowsToGlRows} from './roomTileBridge'
it('asymmetric full-RGBA corpus distinguishes versions, orientation and hidden alpha-zero RGB loss',()=>{
 const a=privatePublicationPattern(1,64,64),b=privatePublicationPattern(2,64,64),expected=canonicalTopRowsToGlRows(a,64,64)
 expect(publicationByteComparison(expected,expected)).toEqual({mismatchedBytes:0,hiddenRgbMismatches:0,exact:true})
 expect(publicationByteComparison(a,expected).exact).toBe(false);expect(publicationByteComparison(a,b).exact).toBe(false)
 const lost=expected.slice();for(let i=0;i<lost.length;i+=4)if(lost[i+3]===0)lost.fill(0,i,i+3)
 expect(publicationByteComparison(lost,expected).hiddenRgbMismatches).toBeGreaterThan(0)
 expect(()=>publicationByteComparison(a,b.subarray(4))).toThrow('length')
})

it('runs the actual standalone host branch with raw bridge queue ordering and owned cleanup',async()=>{
 const {vi}=await import('vitest'),{runPrivatePublicationProbe}=await import('./privatePublicationProbe')
 vi.stubGlobal('GPUTextureUsage',{TEXTURE_BINDING:1,COPY_DST:2,RENDER_ATTACHMENT:4,COPY_SRC:8})
 try{
  const queue:Array<()=>void>=[],order:string[]=[],canvases:any[]=[],targets:any[]=[];let ackCount=0,destroyed=0
  const texture:any={bytes:null,createView:()=>texture,destroy:()=>{destroyed++}}
  const device:any={createTexture:()=>texture,createShaderModule:()=>({}),createRenderPipeline:()=>({getBindGroupLayout:()=>({})}),createBindGroup:(d:any)=>d.entries[0].resource,
   createCommandEncoder:()=>{let dst:any,src:any;return{beginRenderPass:(d:any)=>{dst=d.colorAttachments[0].view;return{setPipeline(){},setBindGroup:(_i:number,s:any)=>{src=s},draw(){},end(){}}},finish:()=>()=>{dst.bytes=src.bytes.slice();order.push('render:'+dst.id)}}},
   queue:{writeTexture:(_d:any,b:Uint8Array)=>{const copy=b.slice();queue.push(()=>{texture.bytes=copy;order.push('upload')})},submit:(c:any[])=>queue.push(...c),onSubmittedWorkDone:()=>{ackCount++;while(queue.length)queue.shift()!();return Promise.resolve()}}}
  const makeCanvas=()=>{const c:any={id:canvases.length,width:0,height:0,bytes:null};c.getContext=()=>({configure(){},getCurrentTexture:()=>({createView:()=>c}),unconfigure:()=>{c.closed=true}});canvases.push(c);return c}
  const makeTarget=(_gl:any,w:number,h:number)=>{const t:any={width:w,height:h,restoreCanvasPixels:(c:any)=>{t.bytes=canonicalTopRowsToGlRows(c.bytes,w,h)},readPixels:()=>t.bytes,destroy:()=>{t.closed=true}};targets.push(t);return t}
  const report=await runPrivatePublicationProbe(device,{} as any,makeCanvas,makeTarget)
  expect(report.exact).toBe(true);expect(report.existingAckCount).toBe(ackCount);expect(order).toEqual(['upload','render:0','upload','render:1'])
  expect(canvases.every(c=>c.closed)).toBe(true);expect(targets.every(t=>t.closed)).toBe(true);expect(destroyed).toBe(1)
 }finally{vi.unstubAllGlobals()}
})

it('keeps all publication targets/source alive until every started ACK settles after failure',async()=>{
 const {vi}=await import('vitest'),{runPrivatePublicationProbe}=await import('./privatePublicationProbe')
 vi.stubGlobal('GPUTextureUsage',{TEXTURE_BINDING:1,COPY_DST:2,RENDER_ATTACHMENT:4,COPY_SRC:8})
 try{for(const mode of ['firstReject','writeBThrow','secondEncodeThrow'] as const){
  const primary=Error(mode),secondary=Error('cleanup'),events:string[]=[],acks:Array<{resolve:()=>void;reject:(e:Error)=>void}>=[];let writes=0,contexts=0
  const texture:any={createView:()=>({}),destroy:()=>events.push('source.destroy')}
  const device:any={createTexture:()=>texture,createShaderModule:()=>({}),createRenderPipeline:()=>({getBindGroupLayout:()=>({})}),createBindGroup:()=>({}),createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline(){},setBindGroup(){},draw(){},end(){}}),finish:()=>({})}),queue:{
   writeTexture:()=>{if(++writes===2&&mode==='writeBThrow')throw primary},submit(){},onSubmittedWorkDone:()=>new Promise<void>((resolve,reject)=>acks.push({resolve,reject}))}}
  const makeCanvas=()=>{const id=contexts++;return{width:0,height:0,getContext:()=>({configure(){},getCurrentTexture:()=>{if(id===1&&mode==='secondEncodeThrow')throw primary;return{createView:()=>({})}},unconfigure:()=>events.push('canvas.destroy:'+id)})} as any}
  let targetId=0
  const makeTarget=(_gl:any,width:number,height:number)=>{const id=targetId++;return{width,height,restoreCanvasPixels:()=>events.push('import:'+id),readPixels:()=>new Uint8Array(width*height*4),destroy:()=>{events.push('target.destroy:'+id);if(id===0)throw secondary}} as any}
  let settled=false
  const run=runPrivatePublicationProbe(device,{} as any,makeCanvas,makeTarget);run.then(()=>{settled=true},()=>{settled=true})
  const failure=expect(run).rejects.toBe(primary)
  if(mode==='firstReject')acks[0].reject(primary)
  // Drain microtasks so Promise.all rejection reaches finally/allSettled.
  for(let i=0;i<8;i++)await Promise.resolve()
  expect(settled).toBe(false);expect(events.some(x=>x.includes('destroy'))).toBe(false)
  if(mode==='firstReject'){expect(acks).toHaveLength(2);acks[1].resolve()}else{expect(acks).toHaveLength(1);acks[0].resolve()}
  await failure
  expect(events).toContain('source.destroy');expect(events).toContain('target.destroy:1');expect(events).toContain('canvas.destroy:0');expect(events).toContain('canvas.destroy:1');expect(settled).toBe(true)
 }}finally{vi.unstubAllGlobals()}
})
