export interface RevealBuffer {readonly width:number;readonly height:number;readonly texture:object}
export interface RevealPoolPort<F extends RevealBuffer>{acquire(width:number,height:number):F;release(field:F):void}
/** Physical buffers are adopted by the existing engine pool, never by the source lease. */
export function prewarmEngineRevealSlots<F extends RevealBuffer>(port:RevealPoolPort<F>,sourceIdentities:ReadonlySet<object>,budgetBytes:number,slotCount=4){
 if(!Number.isInteger(slotCount)||slotCount<1||slotCount>8)throw Error('Explicit prewarm slot count required');const bytes=slotCount*1024*1024*4;if(!Number.isSafeInteger(budgetBytes)||budgetBytes<bytes)throw Error('Explicit reveal budget insufficient');
 const fields:F[]=[],identities=new Set<object>();
 try{for(let i=0;i<slotCount;i++){const f=port.acquire(1024,1024);fields.push(f);if(f.width!==1024||f.height!==1024||sourceIdentities.has(f.texture)||identities.has(f.texture))throw Error('Reveal/source physical identity or dimensions invalid');identities.add(f.texture)}}finally{for(const f of new Set(fields))port.release(f)}
 return Object.freeze({bytes,resources:Object.freeze(fields.map(f=>Object.freeze({identity:f.texture,width:f.width,height:f.height,role:'engine-reveal-pool'as const}))),ownership:'engine-until-engine-dispose'as const});
}
