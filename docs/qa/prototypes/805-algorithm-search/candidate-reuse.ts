import type {AlgorithmInput,AlgorithmConfig} from './protocol'
import type {Candidate} from './webgpu/contract'
export interface ReuseDefinition {create(device:GPUDevice,size:number,config:AlgorithmConfig):Promise<Candidate>}
export interface ReuseInput {id:string;input:AlgorithmInput}
const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v
/** No timing/rendering; every owned candidate is destroyed even on failed upload/read/digest. */
export async function runCandidateReuse(device:GPUDevice,definition:ReuseDefinition,inputs:readonly ReuseInput[],sequence:readonly string[],digest:(bytes:Uint8Array)=>Promise<string>,config:AlgorithmConfig={}){
 if(inputs.some(i=>i.input.size!==inputs[0]?.input.size)||inputs.length<1||inputs.length>4||new Set(inputs.map(i=>i.id)).size!==inputs.length||sequence.length<1||sequence.length>12||sequence.some(id=>!inputs.some(i=>i.id===id)))throw Error('Invalid bounded reuse inputs/sequence')
 const read=async(candidate:Candidate,entry:ReuseInput)=>{await candidate.upload(entry.input);candidate.run();await device.queue.onSubmittedWorkDone();const pixels=await candidate.readback();if(pixels.length!==entry.input.size**2*4)throw Error('Reuse output size');if(entry.input.rgba.every(v=>v===0)&&pixels.some(v=>v!==0))throw Error('Zero pigment generated in '+entry.id);const outputSHA=await digest(pixels),metadata=stable(candidate.metadata),metadataJSON=JSON.stringify(metadata),metadataSHA=await digest(new TextEncoder().encode(metadataJSON));return{outputSHA,metadataSHA,metadata}}
 const baseline:Record<string,Awaited<ReturnType<typeof read>>>=Object.create(null)
 for(const entry of inputs){let candidate:Candidate|undefined;try{candidate=await definition.create(device,entry.input.size,config);baseline[entry.id]=await read(candidate,entry)}finally{candidate?.destroy()}}
 let candidate:Candidate|undefined;const rows:{id:string;outputSHA:string;metadataSHA:string;exactFresh:boolean}[]=[]
 try{candidate=await definition.create(device,inputs[0].input.size,config);for(const id of sequence){const entry=inputs.find(i=>i.id===id)!,r=await read(candidate,entry),fresh=baseline[id];if(r.outputSHA!==fresh.outputSHA||r.metadataSHA!==fresh.metadataSHA)throw Error('Reuse differs from fresh: '+id+' at sequence '+rows.length);rows.push({id,outputSHA:r.outputSHA,metadataSHA:r.metadataSHA,exactFresh:true})}}finally{candidate?.destroy()}
 return{qualification:'Full carrier SHA and stable metadata against sequential fresh candidates; no timing/PNG or cross-device theorem.',baseline,sequence:rows,pass:true}
}
