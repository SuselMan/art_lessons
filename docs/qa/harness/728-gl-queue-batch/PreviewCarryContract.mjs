/** OFF visual carry requirements. Never infer canonical pressure from render coverage. */
export const PREVIEW_PRESSURE_THREE_OWNER_BYTES=3*2*128*128*4;
export function previewCarryContract({source,targets,options}){
 const {pigmentLoad,colourLoad,coverage,solventLoad}=source;
 if(![pigmentLoad,colourLoad,coverage,solventLoad].every(f=>f?.texture))throw Error('Frozen source material required');
 const {oldP,oldC,outP,outC,fixedP,pressure0,pressure1}=targets;
 const fields=[oldP,oldC,outP,outC,fixedP,pressure0,pressure1];
 if(fields.some(f=>f?.width!==128||f?.height!==128)||new Set(fields.map(f=>f.texture)).size!==fields.length||fields.some(f=>Object.values(source).some(s=>s?.texture===f.texture)))throw Error('Carry source/output alias or dimensions');
 for(const k of['budgetPx','costMax','effectiveWet','standing','rate','pow','travel','dryCost','climb','floor'])if(!Number.isFinite(options?.[k]))throw Error('Explicit frozen carry option '+k+' required');
 if(options.budgetPx<=1.5||options.costMax<=options.budgetPx||options.effectiveWet<0||options.effectiveWet>1||options.standing<0||options.rate<0||options.rate>1||options.travel<0||options.travel>1||options.floor<=0)throw Error('Carry parameter range');
 // Unit axis faces cannot leap across a dry gap. Larger stride needs an explicit
 // production path mask proof, not just matching endpoint wetness.
 if(options.stride!==1)throw Error('Initial preview carry requires unit stride');
 return Object.freeze({source:Object.freeze({...source}),targets:Object.freeze({...targets}),options:Object.freeze({...options}),order:Object.freeze([16,15]),oldDensity:oldP});
}
/** CPU topology oracle: nearest axis path, not a GLSL mass parity claim. */
export function connectedWetAxis(coverage,w,h,x,y,nx,ny){
 if(coverage.length!==w*h||![x,y,nx,ny].every(Number.isInteger))throw Error('Wet lattice required');
 return nx>=0&&ny>=0&&nx<w&&ny<h&&Math.abs(nx-x)+Math.abs(ny-y)===1&&coverage[y*w+x]>0&&coverage[ny*w+nx]>0;
}
