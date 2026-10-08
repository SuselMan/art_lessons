/** Strict common-GL input contract for the actual first mode11/6 boundary.
 * These SHA values are actual Surface checkpoints, not synthetic zero roles. */
export const FIRST_BAND_INPUTS={
 pressure:{sha256:'288caf3f8a39735b582e759b2f72dd4f295d5590674d8c59bfea7f11b3012e50',filter:'linear'},
 inward:{sha256:'1f786696b913e5fd261f565fe7af4d0f262d8f09e94f67101bb94f9154dfc5b6',filter:'linear'},
 coverage:{sha256:'b6e964b3ad23708a40d25ecc68ab8c4daf91d651e2f01948e6787489dc8515bb',filter:'nearest'},
} as const
export interface FirstBandSnapshot {role:keyof typeof FIRST_BAND_INPUTS;sha256:string;filter:'linear'|'nearest';width:number;height:number;bytes:number;rowConvention:'world-top';packetSha256:string;sourceApi:'GL'}
export function validateFirstBandInputs(rows:readonly FirstBandSnapshot[],packetSha256:string){
 if(!/^[a-f0-9]{64}$/.test(packetSha256)||rows.length!==3)throw Error('Exact common GL band input set required')
 const seen=new Set<string>()
 for(const row of rows){const expected=FIRST_BAND_INPUTS[row.role];if(!expected||seen.has(row.role)||row.sha256!==expected.sha256||row.filter!==expected.filter||row.width!==1536||row.height!==1536||row.bytes!==1536*1536*4||row.rowConvention!=='world-top'||row.packetSha256!==packetSha256||row.sourceApi!=='GL')throw Error('Common GL first band input passport differs');seen.add(row.role)}
 return true
}
export const FIRST_BAND_RECIPE=Object.freeze({worldOrigin:[0,40],worldScale:1,mode11:{k:1,band:[.9617441184796373,0],size:[.009563970380090697,1]},mode6:{k:1,band:[.9617441184796373,.75],size:[.009563970380090697,1/12],origin:[1,1],dir:[1,1],tau:[0,0,0],world:[0,-1576,1]}})
