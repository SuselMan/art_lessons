/** Independent CPU guards, no browser/network. */
export function original47(document) {
 const ops=Array.isArray(document)?document:document?.ops;
 if(!Array.isArray(ops)||ops.length!==47||ops.some((o,i)=>o.seq!==i+1)||new Set(ops.map(o=>o.id)).size!==47)throw Error('Full immutable47 with unique IDs and exact sequential head required');
 if(ops.filter(o=>o.type==='stroke').length!==41||ops.filter(o=>o.type==='layer_clear').length!==1||ops.filter(o=>o.type==='paper_dry').length!==3||ops.filter(o=>o.type==='operation_undo').length!==2)throw Error('Original KJ operation census differs');
 return ops;
}
export function materialGuard(rgba) {
 let nonempty=0,coloured=0;const pixels=rgba.length/4;
 for(let i=0;i<rgba.length;i+=4){if(rgba[i+3])nonempty++;if(rgba[i+3]>=16&&Math.max(rgba[i],rgba[i+1],rgba[i+2])-Math.min(rgba[i],rgba[i+1],rgba[i+2])>=4)coloured++}
 if(!nonempty||nonempty===pixels||!coloured)throw Error('Meaningful transparent pigment required (not empty, opaque paper, or pure gray water)');
 return {nonempty,coloured,pixels};
}
