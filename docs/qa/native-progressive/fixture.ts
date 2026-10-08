import {CanonicalWatercolorWebGpu} from '../../../apps/web/src/engine/src/webgpuCanonical/backend'
import {createCanonicalSettleField,destroyCanonicalSettleField} from '../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import {CanonicalBoundedSceneRunner} from '../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const hash=(bytes:Uint8Array)=>{let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return(h>>>0).toString(16)}
const pointer=(x:number,t:number)=>({x,y:500,pressure:.8,tiltX:0,tiltY:0,speed:.2,timeStamp:t,pointerType:'pen'})
async function run(progressive:boolean,fullField1536:boolean){
 const backend=await CanonicalWatercolorWebGpu.create({canvas:document.querySelector('canvas')!,width:64,height:64,paper:{bytes:new Uint8Array(64*64*4).fill(128),width:64,height:64,origin:[0,0],texSize:[64,64],scale:1}})
 const errors:string[]=[];backend.device.addEventListener('uncapturederror',(e)=>errors.push(e.error.message))
 const captures:Promise<string>[]=[],r=new CanonicalBoundedSceneRunner(backend,{sourceOptions,progressiveSettle:progressive,now:()=>1000,timestamp:()=>100,operationId:()=> 'fixed',yieldSettleFrame:()=>new Promise(resolve=>setTimeout(resolve,30)),onSettlePreview:()=>captures.push(backend.readField(r.target.buffer.field).then(hash))})
 let compact:ReturnType<typeof createCanonicalSettleField>|undefined;if(!fullField1536)r.fieldOwner.fieldFor=(w,h)=>{compact??=createCanonicalSettleField(backend,Math.ceil(w/64)*64,Math.ceil(h/64)*64);for(const role of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'] as const)compact[role].clear();return compact}
 const s={tool:'watercolor' as const,preset:'normal:100:100:PB29:round',size:20,opacity:1,color:[.2,.3,.7] as [number,number,number],nibAngle:{angle:0,anchor:'canvas' as const},tiltResponse:'smooth' as const}
 r.begin(pointer(490,0),s,{strokeId:'same',layerId:'L',userId:'u'});r.move(pointer(515,40));r.end(pointer(515,50));const blocked=!r.isIdle;await r.drain()
 const bytes=await backend.readField(r.target.buffer.field),frames=await Promise.all(captures);r.destroy();if(compact)destroyCanonicalSettleField(compact);backend.destroy();return{bytes,frames,errors,blocked}
}
;(window as any).gate=async(fullField1536=false)=>{const a=await run(false,fullField1536),b=await run(true,fullField1536);let diff=0,max=0;for(let i=0;i<a.bytes.length;i++){const d=Math.abs(a.bytes[i]-b.bytes[i]);if(d)diff++;max=Math.max(max,d)}return{fullField1536,diff,max,serial:hash(a.bytes),progressive:hash(b.bytes),frames:b.frames,distinct:new Set(b.frames).size,errors:[...a.errors,...b.errors],blocked:b.blocked}}
