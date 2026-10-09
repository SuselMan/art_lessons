/** Validate conflicting QA modes before a device target is opened. */
export function assertOwnerLaunchFlags(env){
 if(env.DIAGNOSTIC_OWNER_MORPH==='1'&&env.DIAGNOSTIC_MATERIAL_REBASE==='1')throw Error('Choose one diagnostic morph mode before opening device');
 if(env.COMPLETE_FRONT_CYCLES==='1'&&env.MULTISCALE_CARRY!=='1')throw Error('Complete front cycles requires multiscale before opening device');
}
