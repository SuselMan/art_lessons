/** CPU-only proposal passport. Not installed in execution or an admission policy.
 * Field identity is not immutable contents; passing never authorizes FIFO bypass. */
export interface NativeSourceOwnershipInput {layerId:string;generation:number;backend:object;ownsLiveField:(field:object)=>boolean;fields:Readonly<Record<string,{owner:object;field:object;width:number;height:number;destroyed?:boolean}>>}
export function captureNativeSourceReadSet(input:NativeSourceOwnershipInput){
 if(typeof input.ownsLiveField!=='function'||!input.layerId||!Number.isSafeInteger(input.generation)||input.generation<1||Object.keys(input.fields).length===0)throw Error('Concrete native owner passport required')
 const fields=Object.entries(input.fields).map(([role,buffer])=>{if(buffer.destroyed||buffer.owner!==input.backend||!buffer.field||!input.ownsLiveField(buffer.field)||!Number.isSafeInteger(buffer.width)||!Number.isSafeInteger(buffer.height)||buffer.width<=0||buffer.height<=0)throw Error('Live source field owner/extent required');return Object.freeze({role,buffer,field:buffer.field,width:buffer.width,height:buffer.height})})
 return Object.freeze({layerId:input.layerId,generation:input.generation,backend:input.backend,ownsLiveField:input.ownsLiveField,fields:Object.freeze(fields)})
}
export function assertNativeSourceReadSetIdentity(snapshot:ReturnType<typeof captureNativeSourceReadSet>,current:NativeSourceOwnershipInput){
 if(current.layerId!==snapshot.layerId||current.generation!==snapshot.generation||current.backend!==snapshot.backend||Object.keys(current.fields).length!==snapshot.fields.length)throw Error('Native source owner epoch changed')
 for(const row of snapshot.fields){const buffer=current.fields[row.role];if(!buffer||buffer!==row.buffer||buffer.field!==row.field||buffer.owner!==snapshot.backend||buffer.destroyed||!snapshot.ownsLiveField(buffer.field)||buffer.width!==row.width||buffer.height!==row.height)throw Error('Native source read set changed: '+row.role)}
 return {identity:true,contentRevisionProven:false,earlyAdmissionAuthorized:false} as const
}
export function assertNativePendingSourceDisjoint(previous:ReturnType<typeof captureNativeSourceReadSet>,next:ReturnType<typeof captureNativeSourceReadSet>){
 if(previous.backend!==next.backend||previous.layerId!==next.layerId||previous.generation===next.generation)throw Error('Distinct same-device source generation required')
 if(previous.fields.map(x=>x.role).sort().join()!==next.fields.map(x=>x.role).sort().join())throw Error('Pending source role set differs')
 for(const passport of [previous,next])for(const row of passport.fields){if(row.buffer.destroyed||row.buffer.field!==row.field||!passport.ownsLiveField(row.field))throw Error('Pending source field no longer live')}
 const shared=new Set(previous.fields.map(x=>x.field));if(next.fields.some(x=>shared.has(x.field)))throw Error('Pending material/source texture alias')
 return {disjoint:true,baselineCopyProven:false,publicationOrderingProven:false,earlyAdmissionAuthorized:false} as const
}
