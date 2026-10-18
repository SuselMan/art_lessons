import type {AlgorithmConfig,AlgorithmInput} from './protocol'
import type {Candidate} from './webgpu/contract'
import {assertFuzzRequest,assertFuzzConfig,FUZZ_GENERATOR_VERSION} from './deterministic-fuzz-input'
type Digest=(bytes:Uint8Array)=>Promise<string>
type Entry={id:string;control:string;input:AlgorithmInput}
type Definition={id:string;create(device:GPUDevice,size:number,config:AlgorithmConfig):Promise<Candidate>}
const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v
const json=(v:unknown)=>JSON.stringify(stable(v))
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Missing diagnostic metadata');return v as Record<string,unknown>}
export function assertFuzzGuards(metadata:unknown,fine:boolean){
 const m=record(metadata),s=record(m.finalState)
 for(const key of ['coarsePigmentConserved','coarseWaterConserved','coarseGuardPassed','prePackGuardPassed'])if(s[key]!==true)throw Error('Missing/failed coarse guard: '+key)
 for(const key of ['coarseOutOfRangeCells','coarseInvalidPremulCells','coarseRepresentationOverflowCells'])if(s[key]!==0)throw Error('Missing/failed coarse counter: '+key)
 for(const key of ['coarsePigmentCodesRGBA','coarsePigmentDeltaRGBA'])if(!Array.isArray(s[key])||s[key].length!==4||s[key].some((x:unknown)=>!Number.isSafeInteger(x)||Number(x)<0))throw Error('Missing four-channel ledger: '+key)
 if((s.coarsePigmentDeltaRGBA as number[]).some(x=>x!==0))throw Error('Coarse RGB/alpha conservation failure')
 const initial=record(m.initial),expected=initial.initialCoarsePigmentCodesRGBA
 if(!Array.isArray(expected)||expected.length!==4||expected.some((x:unknown)=>!Number.isSafeInteger(x)||Number(x)<0)||json(expected)!==json(s.coarsePigmentCodesRGBA))throw Error('Missing/mismatched initial coarse four-channel sums')
 for(const v of[s.surfaceCodes,s.absorbedCodes,s.totalWaterCodes,initial.initialWaterCodes])if(!Number.isSafeInteger(v)||Number(v)<0)throw Error('Missing water ledger sums')
 if(Number(s.surfaceCodes)+Number(s.absorbedCodes)!==s.totalWaterCodes||s.totalWaterCodes!==initial.initialWaterCodes)throw Error('Water ledger sums disagree')
 if(fine){const f=record(m.fineLedger);if(f.guardPassed!==true||f.initCapacityFailures!==0||f.packFailures!==0||!Array.isArray(f.mobileRGBA16Codes)||f.mobileRGBA16Codes.length!==4||f.mobileRGBA16Codes.some((x:unknown)=>!Number.isSafeInteger(x)||Number(x)<0))throw Error('Missing/failed fine guards and four-channel totals')}
 return stable(metadata)
}
/** Scope only creation, restore own/inherited descriptor even on create failure. No extra GPU work. */
async function createObserved(device:GPUDevice,definition:Definition,size:number,config:AlgorithmConfig,digest:Digest){
 const descriptor=Object.getOwnPropertyDescriptor(device,'createShaderModule'),original=device.createShaderModule,codes:{label:string;code:string}[]=[];let candidate:Candidate|undefined
 try{
  Object.defineProperty(device,'createShaderModule',{configurable:true,writable:true,value:function(this:GPUDevice,d:GPUShaderModuleDescriptor){if(typeof d.code!=='string')throw Error('Unrecordable shader source');codes.push({label:d.label??'',code:d.code});return original.call(this,d)}})
  try{candidate=await definition.create(device,size,config)}finally{if(descriptor)Object.defineProperty(device,'createShaderModule',descriptor);else delete(device as unknown as Record<string,unknown>).createShaderModule}
  if(!codes.length)throw Error('No actual shader modules observed')
  const shaders=[];for(const c of codes)shaders.push({label:c.label,sha256:await digest(new TextEncoder().encode(c.code))})
  return{candidate,shaders,shaderSet:[...new Set(shaders.map(s=>s.sha256))].sort()}
 }catch(e){candidate?.destroy();throw e}finally{codes.length=0}
}
/** 12 repeat/reuse executions; Fine39 adds three fresh fine0 ledger controls. */
export async function runCandidateFuzz(device:GPUDevice,definition:Definition,inputs:readonly Entry[],digest:Digest,config:AlgorithmConfig={}){
 assertFuzzRequest(definition.id,inputs.map(i=>i.id));assertFuzzConfig(definition.id,config);if(inputs.some(i=>i.input.size!==1024||i.input.rgba.length!==4194304||i.input.water.length!==1048576||i.input.paper.length!==1048576))throw Error('Fuzz input size limit')
 let stage='input-hash',recipe='';const fingerprints=async(i:AlgorithmInput)=>({rgba:await digest(i.rgba),water:await digest(i.water),paper:await digest(i.paper),seed:i.seed})
 const inputSHA:Record<string,Awaited<ReturnType<typeof fingerprints>>>=Object.create(null),baseline:Record<string,unknown>=Object.create(null),rows:unknown[]=[]
 const fine=definition.id==='wgsl-macro-gpu-initial-fine'
 try{
  for(const e of inputs){recipe=e.id;inputSHA[e.id]=await fingerprints(e.input)}
  const execute=async(candidate:Candidate,e:Entry)=>{
   recipe=e.id;stage='before-upload';if(json(await fingerprints(e.input))!==json(inputSHA[e.id]))throw Error('Input mutation before upload')
   stage='upload';await candidate.upload(e.input)
   stage='after-upload';if(json(await fingerprints(e.input))!==json(inputSHA[e.id]))throw Error('Input mutation after upload')
   stage='run';candidate.run();await device.queue.onSubmittedWorkDone();stage='readback';const pixels=await candidate.readback()
   if(pixels.length!==4194304)throw Error('Output size')
   stage='output-guards';for(let p=0;p<pixels.length;p+=4){if(pixels[p]>pixels[p+3]||pixels[p+1]>pixels[p+3]||pixels[p+2]>pixels[p+3])throw Error('Output RGB exceeds alpha');if(e.control==='water-only'&&(pixels[p]|pixels[p+1]|pixels[p+2]|pixels[p+3]))throw Error('Water-only generated pigment');if(e.control==='full-dry'&&(pixels[p]!==e.input.rgba[p]||pixels[p+1]!==e.input.rgba[p+1]||pixels[p+2]!==e.input.rgba[p+2]||pixels[p+3]!==e.input.rgba[p+3]))throw Error('Full dry identity failure')}
   const metadata=assertFuzzGuards(candidate.metadata,fine),outputSHA=await digest(pixels),metadataSHA=await digest(new TextEncoder().encode(json(metadata)))
   stage='after-readback';if(json(await fingerprints(e.input))!==json(inputSHA[e.id]))throw Error('Input mutation during run/readback')
   return{outputSHA,metadataSHA,metadata}
  }
  const fresh=async(e:Entry,repeat:boolean)=>{recipe=e.id;stage='create';const observed=await createObserved(device,definition,1024,config,digest);try{const r={...await execute(observed.candidate,e),shaders:observed.shaders,shaderSet:observed.shaderSet};if(repeat&&json(r)!==json(baseline[e.id]))throw Error('Fresh repeat differs');if(!repeat)baseline[e.id]=r;rows.push({mode:repeat?'fresh-repeat':'fresh',id:e.id,outputSHA:r.outputSHA,metadataSHA:r.metadataSHA,exactFresh:true})}finally{observed.candidate.destroy()}}
  for(const e of inputs)await fresh(e,false)
  recipe='';stage='reuse-create';const observed=await createObserved(device,definition,1024,config,digest)
  try{for(const index of[0,1,0,2,1,0]){const e=inputs[index],r={...await execute(observed.candidate,e),shaders:observed.shaders,shaderSet:observed.shaderSet};if(json(r)!==json(baseline[e.id]))throw Error('Reused result/shader/metadata differs from fresh');rows.push({mode:'reuse',id:e.id,outputSHA:r.outputSHA,metadataSHA:r.metadataSHA,exactFresh:true})}}finally{observed.candidate.destroy()}
  for(const e of inputs)await fresh(e,true)
  const fineControls=[]
  if(fine)for(const e of inputs){recipe=e.id;stage='fine0-create';const control=await createObserved(device,definition,1024,{...config,fineSteps:0},digest)
   try{const r=await execute(control.candidate,e),current=record(r.metadata),expected=record(record(baseline[e.id]).metadata),totals=record(current.fineLedger).mobileRGBA16Codes,expectedTotals=record(expected.fineLedger).mobileRGBA16Codes
    stage='fine-four-channel-conservation';if(json(totals)!==json(expectedTotals))throw Error('Fine0/fine4 four-channel totals differ')
    if(json(control.shaders)!==json(record(baseline[e.id]).shaders))throw Error('Fine0 control shader source differs')
    fineControls.push({id:e.id,outputSHA:r.outputSHA,metadataSHA:r.metadataSHA,mobileRGBA16Codes:totals,shaders:control.shaders,exactFineConservation:true,qualification:'Fresh fine0 vs fine4 mobile integer sums, not equality of packed output pixels.'})
   }finally{control.candidate.destroy()}
  }
  return{pass:true,generatorVersion:FUZZ_GENERATOR_VERSION,executions:rows.length+fineControls.length,inputSHA,baseline,rows,fineControls,qualification:'Full carrier repeat/reuse, observed shader sources, strict existing guards. Fine39 additionally compares four integer fine mobile sums against fresh fine0 controls; RGBA8 global mass and artistic quality are not certified. No timing/PNG/raw output.'}
 }catch(e){throw Error(JSON.stringify({probe:'structured-fuzz',stage,recipe,inputSHA,message:e instanceof Error?e.message:String(e)}))}
}
