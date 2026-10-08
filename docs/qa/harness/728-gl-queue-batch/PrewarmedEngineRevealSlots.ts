export interface RevealBuffer {readonly width:number;readonly height:number;readonly texture:object}
export interface RevealPoolPort<F extends RevealBuffer>{acquire(width:number,height:number):F;release(field:F):void}
/** Physical buffers are adopted by the existing engine pool, never by the source lease. */
export function prewarmEngineRevealSlots<F extends RevealBuffer>(port:RevealPoolPort<F>,sourceIdentities:ReadonlySet<object>,budgetBytes:number){
 const bytes=4*1024*1024*4;if(!Number.isSafeInteger(budgetBytes)||budgetBytes<bytes)throw Error('Explicit reveal budget requires16MiB');
 const fields:F[]=[],identities=new Set<object>();
 try{for(let i=0;i<4;i++){const f=port.acquire(1024,1024);fields.push(f);if(f.width!==1024||f.height!==1024||sourceIdentities.has(f.texture)||identities.has(f.texture))throw Error('Reveal/source physical identity or dimensions invalid');identities.add(f.texture)}}finally{for(const f of new Set(fields))port.release(f)}
 return Object.freeze({bytes,resources:Object.freeze(fields.map(f=>Object.freeze({identity:f.texture,width:f.width,height:f.height,role:'engine-reveal-pool'as const}))),ownership:'engine-until-engine-dispose'as const});
}
