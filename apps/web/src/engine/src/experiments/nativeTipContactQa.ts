/// <reference types="@webgpu/types" />
/** DEV source specialization only; backend/default shader constants unchanged. */
export const TIP_A_ANCHOR='mix(mix(0.34, 0.39, light), 0.62, release)'
export function specializeNativeTipA(source:string){
 if(source.split(TIP_A_ANCHOR).length!==2)throw Error('DEV tipA source anchor changed')
 return source.replace(TIP_A_ANCHOR,'mix(mix(0.28, 0.39, light), 0.62, release)')
}
export interface NativeTipQaProof {enabled:boolean;modules:{family:'stamp'|'ribbon';sourceChars:number;baselineSha?:string;patchedSha?:string}[]}
export function installNativeTipA(backend:{readonly device:GPUDevice;destroy?:()=>void},enabled:boolean,dev=import.meta.env.DEV):NativeTipQaProof{
 const proof:NativeTipQaProof={enabled:dev&&enabled,modules:[]}
 if(!proof.enabled)return proof
 const internal=backend as unknown as {_deposit?:unknown;_stamps?:unknown;options?:{roomOwnedResources?:boolean}}
 if(!internal.options?.roomOwnedResources||internal._deposit||internal._stamps)throw Error('DEV tipA requires lazy Room-owned source before compilation')
 const original=backend.device
 const digest=async(source:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('')
 const prior=Object.getOwnPropertyDescriptor(original,'createShaderModule')
 const destroy=backend.destroy
 const compile=original.createShaderModule.bind(original)
 const patchedCompile=(desc:GPUShaderModuleDescriptor)=>{
   const sourceModule=desc.code.includes('fn paint(')&&desc.code.includes('fn wcTipContact')
   if(!sourceModule)return compile(desc)
   const family=desc.code.includes('fn nibDistance(')?'stamp':'ribbon',code=specializeNativeTipA(desc.code)
   if(!proof.modules.some(m=>m.family===family)){
    const record:NativeTipQaProof['modules'][number]={family,sourceChars:code.length};proof.modules.push(record)
    void Promise.all([digest(desc.code),digest(code)]).then(([baselineSha,patchedSha])=>{record.baselineSha=baselineSha;record.patchedSha=patchedSha})
   }
   return compile({...desc,code})
 }
 // Preserve native WebIDL identity for GPUCanvasContext.configure and all GPU APIs.
 // Only this owner device receives an own-method shadow; no prototype/global mutation.
 Object.defineProperty(original,'createShaderModule',{value:patchedCompile,configurable:true,writable:true})
 if(destroy)Object.defineProperty(backend,'destroy',{configurable:true,value:()=>{
  if(original.createShaderModule===patchedCompile){if(prior)Object.defineProperty(original,'createShaderModule',prior);else Reflect.deleteProperty(original,'createShaderModule')}
  destroy.call(backend)
 }})
 return proof
}
