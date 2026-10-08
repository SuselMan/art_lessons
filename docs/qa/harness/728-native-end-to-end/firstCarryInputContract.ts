/** Original op45 FIRST stride only. No seeded rim substitution and no inward rerun.
 * Mobile pigment is frozen GL op1 c; pressure frozen GL outward141. */
export const FIRST_CARRY_INPUTS={
 mobile:{filter:'nearest',sha256:'844fc54407736a493f21c5d0b594c4a78326788507b7ddea509f3368cc5d0641'},
 pressure:{filter:'linear',sha256:'288caf3f8a39735b582e759b2f72dd4f295d5590674d8c59bfea7f11b3012e50'},
} as const
export const FIRST_CARRY_RECIPE={mode:15,k:.5,dir:[1,1],band:[.9473981629095012,1],size:[3,104.55908584594727],tau:[.45,.7,0],origin:[1,.35],pathPacked:false,additiveZeroFaces:false,scissor:[0,0,1536,1536]} as const
export interface FirstCarrySnapshot {role:keyof typeof FIRST_CARRY_INPUTS;filter:'linear'|'nearest';sha256:string;width:number;height:number;bytes:number;sourceApi:'GL';rowConvention:'world-top';packetSha256:string}
export function validateFirstCarryInputs(rows:readonly FirstCarrySnapshot[],packetSha256:string){
 if(packetSha256!=='1cf7698e3d2fa6a713a00dad8d2e7f0d05dbb7f74139c91096e366d74560e76f'||rows.length!==2)throw Error('First carry actual source packet required')
 const seen=new Set<string>();for(const row of rows){const x=FIRST_CARRY_INPUTS[row.role];if(!x||seen.has(row.role)||row.filter!==x.filter||row.sha256!==x.sha256||row.width!==1536||row.height!==1536||row.bytes!==9437184||row.sourceApi!=='GL'||row.rowConvention!=='world-top'||row.packetSha256!==packetSha256)throw Error('First carry common input passport mismatch');seen.add(row.role)}
}
