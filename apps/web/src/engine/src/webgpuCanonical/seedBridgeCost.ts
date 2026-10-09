export type SeedBridgeCostPhase='readPixels'|'rowFlip'|'uploadEnqueue'|'queueAck'
export interface SeedBridgeCost {phase:SeedBridgeCostPhase;wallMs:number;ok:boolean;bytes:number}
/** Observes existing boundaries. Adds no fence, copy, retained source or retry. */
export function observeSeedBridge(read:()=>Uint8Array,flip:(bytes:Uint8Array)=>Uint8Array,upload:(bytes:Uint8Array)=>void,idle:()=>Promise<void>,report:(cost:SeedBridgeCost)=>void,now:()=>number=()=>performance.now()):Promise<void>{
 const measured=<T>(phase:SeedBridgeCostPhase,bytes:number,operation:()=>T):T=>{
  const start=now();let ok=false
  try{const result=operation();ok=true;return result}
  finally{try{report({phase,wallMs:now()-start,ok,bytes})}catch{/* Diagnostics cannot change material behavior. */}}
 }
 // Sync locals die on return; the ACK handlers capture only the scalar cost.
 const source=measured('readPixels',0,read)
 const flipped=measured('rowFlip',source.byteLength,()=>flip(source))
 measured('uploadEnqueue',flipped.byteLength,()=>upload(flipped))
 const start=now();let ack:Promise<void>
 try{ack=idle()}catch(error){try{report({phase:'queueAck',wallMs:now()-start,ok:false,bytes:0})}catch{};throw error}
 return ack.then(()=>{try{report({phase:'queueAck',wallMs:now()-start,ok:true,bytes:0})}catch{}},error=>{try{report({phase:'queueAck',wallMs:now()-start,ok:false,bytes:0})}catch{};throw error})
}
