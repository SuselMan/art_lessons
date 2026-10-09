/** Validate conflicting QA modes before a device target is opened. */
export function assertOwnerLaunchFlags(env){
 if(env.DIAGNOSTIC_OWNER_MORPH==='1'&&env.DIAGNOSTIC_MATERIAL_REBASE==='1')throw Error('Choose one diagnostic morph mode before opening device');
 if(env.ANGULAR_RESIDUAL==='1'&&env.RESIDUAL_MATERIAL!=='1')throw Error('Angular diagnostic requires residual opt-in before device');
 if(env.RESIDUAL_TIMELINE==='1'&&(env.RESIDUAL_MATERIAL!=='1'||env.MORPH_FILMSTRIP!=='1'||env.MORPH_FILMSTRIP_UP!=='1'))throw Error('Residual timeline requires residual four-frame UP capture before opening device');
 if(env.COMPLETE_FRONT_CYCLES==='1'&&env.MULTISCALE_CARRY!=='1')throw Error('Complete front cycles requires multiscale before opening device');
}
