export async function runPairedCarryGate({hardwareLinear=false,iterations=12}={}){
 if(!Number.isInteger(iterations)||iterations<1||iterations>16)throw new Error('Bounded carry iteration count invalid');
 const m=await import('./kernels.js'),adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice(),W=32,H=40,errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));device.pushErrorScope('validation');
 const create=(j,filter='nearest')=>{const texture=device.createTexture({size:[W,H],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST}),bytes=Uint8Array.from({length:W*H*4},(_,i)=>(i*17+j*31+(i>>4)*3)%190+20);device.queue.writeTexture({texture},bytes,{bytesPerRow:W*4},{width:W,height:H});return{width:W,height:H,texture,view:texture.createView(),filter,format:'rgba8unorm',label:'paired carry gate'}};
 const read=async f=>{const b=device.createBuffer({size:256*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyTextureToBuffer({texture:f.texture},{buffer:b,bytesPerRow:256},[W,H]);device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(b.getMappedRange()),bytes=new Uint8Array(W*H*4);for(let y=0;y<H;y++)bytes.set(raw.subarray(y*256,y*256+W*4),y*W*4);b.unmap();b.destroy();return bytes};
 try{const ops=new m.CanonicalFieldOps(device),paired=new m.CanonicalPairedCarry(device),shared=Array.from({length:4},(_,i)=>create(i+2,i===1?'linear':'nearest')),states=[0,1].map(()=>({p:create(0),c:create(1),pn:create(7),cn:create(8)})),rows=[];
 for(let i=0;i<iterations;i++){
  const opts={d:shared[1],e:shared[2],dir:[1+i%3,1+i%3],origin:[1+i%3,.35],size:[1.3,20],band:[.6,.2],tau:[.025,.1,1],world:[13,-29,1],scissor:i%2?[3,5,23,29]:undefined,diagnosticHardwareLinearInputs:hardwareLinear};
  for(let arm=0;arm<2;arm++){const s=states[arm],encoder=device.createCommandEncoder(),ctx={device,encoder};const buffers=arm?[paired.run(ctx,{pigment:s.p,color:s.c,fixed:shared[0],outPigment:s.pn,outColor:s.cn},.2,opts)]:[ops.run(ctx,{a:s.c,b:shared[0],out:s.cn},16,.2,{...opts,c:s.p}),ops.run(ctx,{a:s.p,b:shared[0],out:s.pn},15,.2,opts)];device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();buffers.forEach(b=>b.destroy());}
  for(const role of ['pn','cn']){const a=await read(states[0][role]),b=await read(states[1][role]),old=await read(states[0][role==='pn'?'p':'c']);const changedFromOld=a.reduce((n,v,j)=>n+ +(v!==old[j]),0);let different=0,max=0;for(let j=0;j<a.length;j++){const d=Math.abs(a[j]-b[j]);different+=+(d>0);max=Math.max(max,d)}rows.push({iteration:i,role,different,max,changedFromOld,nonzero:b.reduce((n,v)=>n+ +(v>0),0)});}
  for(const s of states){[s.p,s.pn]=[s.pn,s.p];[s.c,s.cn]=[s.cn,s.c];}
 }
 const validation=await device.popErrorScope();return{hardwareLinear,rows,errors,validation:validation?.message??null,pass:!validation&&!errors.length&&rows.every(r=>!r.different&&r.nonzero>0)&&rows.some(r=>r.changedFromOld>0)};
 }finally{device.destroy()}
}
Object.assign(window,{runPairedCarryGate});
