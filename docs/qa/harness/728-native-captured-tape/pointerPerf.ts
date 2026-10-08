import {createCanonicalSceneSession,type CanonicalSceneSession} from '../../../../apps/web/src/engine/src/webgpuCanonical/sceneFactory'
import type {Operation,StrokeOperation} from '@grafetto/shared'
let session:CanonicalSceneSession|null=null, settings={pigment:100,color:[.4,.2,.6] as [number,number,number]}, tape:Operation[]=[],events:Record<string,unknown>[]=[],cleanup:()=>void=()=>{},frame=0
const mark=(kind:string,detail:Record<string,unknown>={})=>events.push({kind,time:performance.now(),...detail})
export async function preparePointerPerf400(){
 if(session)throw new Error('Dispose existing perf fixture first')
 events=[];tape=[];settings={pigment:100,color:[.4,.2,.6]};mark('preparation-start');const mount=document.querySelector('#surface')!,canvas=document.createElement('canvas');canvas.style.width='640px';canvas.style.height='640px';mount.replaceChildren(canvas)
 session=await createCanonicalSceneSession(canvas,{onStatus:status=>mark('status',{status,idle:session?.isIdle}),onOperation:op=>{tape.push(op);mark('operation',{id:op.id})}});mark('preparation-done')
 const current=session,queue=current.backend.device.queue,device=current.backend.device,labels=new WeakMap<GPUCommandBuffer,string>();let submission=0
 const create=device.createCommandEncoder.bind(device),submit=queue.submit.bind(queue),done=queue.onSubmittedWorkDone.bind(queue)
 device.createCommandEncoder=(descriptor)=>{const encoder=create(descriptor),finish=encoder.finish.bind(encoder);encoder.finish=(desc)=>{const buffer=finish(desc);labels.set(buffer,descriptor?.label??'unlabelled');return buffer};return encoder}
 queue.submit=(commands)=>{const list=[...commands],id=++submission,t0=performance.now();submit(list);mark('submit',{id,labels:list.map(b=>labels.get(b)??'unknown'),cpuMs:performance.now()-t0,idle:current.isIdle})}
 Object.assign(queue,{onSubmittedWorkDone:()=>{const id=submission,t0=performance.now();return done().then(()=>{mark('existing-queue-completion',{throughSubmission:id,waitWallMs:performance.now()-t0})})}})
 const runner=current.runner,restores:(()=>void)[]=[]
 for(const name of ['begin','move','end'] as const){const original=runner[name].bind(runner);const wrapped=(...args:unknown[])=>{const t0=performance.now();mark('runner-start',{method:name,idle:current.isIdle});try{return (original as (...a:unknown[])=>unknown)(...args)}finally{mark('runner-end',{method:name,cpuMs:performance.now()-t0,idle:current.isIdle})}};Object.assign(runner,{[name]:wrapped});restores.push(()=>Object.assign(runner,{[name]:original}))}
 const pointer=(raw:Event)=>{const event=raw as PointerEvent;mark('pointer',{type:event.type,eventClock:event.timeStamp,pointerType:event.pointerType,pressure:event.pressure,x:event.clientX,y:event.clientY,idle:current.isIdle})}
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.addEventListener(type,pointer,true)
 const tick=()=>{mark('raf-opportunity',{idle:current.isIdle});frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick)
 cleanup=()=>{cancelAnimationFrame(frame);for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.removeEventListener(type,pointer,true);restores.forEach(f=>f());device.createCommandEncoder=create;queue.submit=submit;queue.onSubmittedWorkDone=done}
 current.attach(()=>({tool:'watercolor',preset:`normal:100:${settings.pigment}:PB29:round`,size:400,opacity:1,color:settings.color,nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}))
 const b=canvas.getBoundingClientRect(),client=(x:number,y:number)=>({x:b.left+x/1024*b.width,y:b.top+y/1024*b.height})
 return{waterStart:client(320,512),waterEnd:client(704,512),pigmentCentre:client(512,512),secondColor:client(576,512),settings:{size:400,water:100,...settings},limits:'bounded native scene; current factory options unchanged; no Room/concurrency claim'}
}
export function setPointerPerfSettings(pigment:number,color:[number,number,number]=[.4,.2,.6]){if(!session?.isIdle)throw new Error('Wait for idle');if(pigment<0||pigment>100)throw new Error('Invalid pigment');settings={pigment,color};mark('settings',{...settings})}
export async function drainPointerPerf(){if(!session)throw new Error('No fixture');mark('drain-start');await session.runner.drain();mark('drain-done');return{idle:session.isIdle,operations:tape.length}}
export async function clearPointerPerf(){if(!session?.isIdle)throw new Error('Wait for idle');mark('clear-start');await session.runner.clear();mark('clear-done')}
export async function replayPointerPerf(){if(!session?.isIdle)throw new Error('Wait for idle');mark('replay-start');await session.replay(tape as StrokeOperation[]);mark('replay-done')}
export async function takePointerPerf(){if(!session)throw new Error('No fixture');await session.runner.drain();const result={events:structuredClone(events),tape:structuredClone(tape),limitations:['No GPU timestamp duration: queue completion is wall-clock dependency latency, not GPU execution time','Source/presentation submission and rAF are visibility proxies, not first visible pigment proof','No readPixels/readback during primary timeline','Instrumentation CPU overhead included; use uninstrumented control separately','Real pointer input; no synthetic dabs; source/paper/model/factory options unchanged']};cleanup();await session.runner.retire();session.destroy();session=null;return result}
Object.assign(window,{preparePointerPerf400,setPointerPerfSettings,drainPointerPerf,clearPointerPerf,replayPointerPerf,takePointerPerf})
