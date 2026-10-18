import {createFixedWetFloatTail} from './fixed-wet-float-tail'
import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
import {downsample,type LBMConfig} from './lbm'
import {fixedLBMCollide,fixedLBMStream} from './lbm-fixed-source'
export function initialFixedLBM(input:Input,n:number){
 validateInput(input,input.size);const r=input.size/n;if(!Number.isInteger(r))throw Error('Grid must divide size');const initial=downsample(input,n),kind=new Uint32Array(input.size**2),raw=packedRGBA(input.rgba);let activeCells=0,partialPixels=0,dryPixels=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const j=y*n+x;let full=true;for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++)full&&=input.water[(y*r+dy)*input.size+x*r+dx]>0
  activeCells+=Number(full)
  for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++){const i=(y*r+dy)*input.size+x*r+dx;kind[i]=input.water[i]===0?0:full?1:2;partialPixels+=Number(kind[i]===2);dryPixels+=Number(kind[i]===0)}
  if(!full){initial.color.fill(0,j*4,j*4+4);initial.wet[j]=0;initial.paper[j]=-1;const weights=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];for(let q=0;q<9;q++)initial.f[j*9+q]=weights[q]}
 }
 return{...initial,kind,raw,partition:{activeCells,partialPixels,dryPixels,coarseSize:n,ratio:r}}
}
/** Same BGK collision and tracer operators inside full-wet cells; explicit wall streaming plus mobile fine edge. */
export async function createFixedLBM(device:GPUDevice,size:number,config:LBMConfig={}):Promise<Candidate>{
 validateSize(size);if(size!==1024)throw Error('Fixed LBM research tail requires1024');const n=integerOption(config.grid??256,64,512,'grid'),steps=integerOption(config.steps??48,1,256,'steps');if(size%n)throw Error('Grid must divide size')
 const omega=config.omega??1,drag=config.drag??0.08,diffusion=config.diffusion??0.12,evaporation=config.evaporation??0.001
 for(const [name,v,lo,hi] of [['omega',omega,0.6,1.4],['drag',drag,0,1],['diffusion',diffusion,0,0.24],['evaporation',evaporation,0,0.02]] as const)if(!Number.isFinite(v)||v<lo||v>hi)throw Error('Invalid '+name)
 const fBytes=n*n*36,cBytes=n*n*16,wBytes=n*n*4,outBytes=size*size*4
 if(device.limits.maxStorageBuffersPerShaderStage<8||device.limits.maxStorageBufferBindingSize<Math.max(fBytes,size*size*16)||device.limits.maxBufferSize<Math.max(fBytes,size*size*16)||device.limits.maxComputeInvocationsPerWorkgroup<64)throw Error('Fixed D2Q9 device limits insufficient')
 const sources=[fixedLBMCollide(),fixedLBMStream()],all:GPUBuffer[]=[];let tail:Awaited<ReturnType<typeof createFixedWetFloatTail>>|undefined
 const alloc=(bytes:number,flags:number,label:string)=>{const b=buffer(device,bytes,flags,label);all.push(b);return b}
 try{
  const [collide,stream]=await Promise.all(sources.map((s,i)=>pipeline(device,s,'fixed-lbm-'+i)))
  const sourceSHA=await Promise.all(sources.map(async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('')))
  const use=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC,pop=[alloc(fBytes,use,'f0'),alloc(fBytes,use,'f1')],post=alloc(fBytes,use,'post'),fluid=alloc(cBytes,use,'fluid'),colors=[alloc(cBytes,use,'c0'),alloc(cBytes,use,'c1')],wet=[alloc(wBytes,use,'w0'),alloc(wBytes,use,'w1')],paper=alloc(wBytes,use,'immutable-paper-walls'),params=alloc(32,BUFFER.UNIFORM|BUFFER.COPY_DST,'params'),output=alloc(outBytes,BUFFER.STORAGE|BUFFER.COPY_SRC,'output'),stage=alloc(outBytes,BUFFER.COPY_DST|BUFFER.MAP_READ,'readback')
  const bind=(p:GPUComputePipeline,bs:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:bs.map((b,binding)=>({binding,resource:{buffer:b}}))})
  const cg=[0,1].map(i=>bind(collide,[pop[i],post,fluid,wet[i],paper,params])),sg=[0,1].map(i=>bind(stream,[post,pop[1-i],fluid,colors[i],colors[1-i],wet[i],wet[1-i],paper,params]))
  tail=await createFixedWetFloatTail(device,{size,grid:n,mobile:colors[steps%2],output,phases:12});const edge=tail
  let dead=false,uploaded=false,ready=false,partition:ReturnType<typeof initialFixedLBM>['partition']|null=null
  return{get metadata(){return{algorithm:'D2Q9-BGK-pull-stream',domainPolicyRevision:'initial-fixed-v1',size,grid:n,steps,omega,drag,diffusion,evaporation,fineModel:'f32-cardinal-quarter-component',fineSteps:12,partition,sourceSHA:[...sourceSHA,...edge.metadata.sourceSHA],fineLedger:edge.metadata.ledger,dispatches:steps*2+14,allocatedGPUBytes:all.reduce((s,b)=>s+b.size,0)+edge.metadata.ownedBytes,seedUsed:false,waterPolicy:'immutable initial full-wet bulk, on-link walls including diagonal corners; raw partial wet mobile in fine stage',reconstruction:'owner-nearest bulk + raw partial, twelve wet-only cardinal component phases; dry original literal',conservation:'Original f32 BGK/tracer interpolation and byte output are not integer conservative; f32 fine exchange is mathematically paired, no exact integer-mass claim',limitations:'Fine boundary has short local horizon; coarse partial cells cannot carry early BGK velocity. Different model revision, not an exact optimization.'}},async upload(input){if(dead)throw Error('Destroyed');uploaded=false;ready=false;validateInput(input,size);const a=initialFixedLBM(input,n);partition=a.partition;const bytes=new ArrayBuffer(32),u=new Uint32Array(bytes),f=new Float32Array(bytes);u[0]=n;u[1]=size;f[2]=omega;f[3]=drag;f[4]=diffusion;f[5]=evaporation;for(const [b,v]of [[pop[0],a.f],[colors[0],a.color],[wet[0],a.wet],[paper,a.paper]] as const)device.queue.writeBuffer(b,0,v);device.queue.writeBuffer(params,0,bytes);await device.queue.onSubmittedWorkDone();await edge.upload(input);uploaded=true},run(){if(dead||!uploaded)throw Error('Fresh upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();for(let s=0;s<steps;s++){p.setPipeline(collide);p.setBindGroup(0,cg[s%2]);p.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));p.setPipeline(stream);p.setBindGroup(0,sg[s%2]);p.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8))}p.end();device.queue.submit([e.finish()]);edge.run();ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){if(dead||!ready)throw Error('No output');const ledger=await edge.readbackLedger();if(ledger.dryMaterial||ledger.invalid||ledger.negative||ledger.inactiveCoarseNonzero)throw Error('Fixed LBM raw material guard failed');return readPacked(device,output,size,stage)},destroy(){if(dead)return;dead=true;edge.destroy();for(const b of all)b.destroy()}}
 }catch(error){tail?.destroy();for(const b of all)b.destroy();throw error}
}
export {createFixedLBM as create}
