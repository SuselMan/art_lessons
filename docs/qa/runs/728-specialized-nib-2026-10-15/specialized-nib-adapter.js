import {DAB_VERT,DAB_FRAG} from '/src/engine/src/raster/shaders.ts';
import {createProgram,getUniforms} from '/src/engine/src/raster/utils.ts';
export function install(e){const gl=e.gl,stamps=e._stamps,passes=e._ribbonPasses,original=passes.drawRibbonNibPass,cache=new Map();const stats={draws:0,programs:0};
 passes.drawRibbonNibPass=function(...a){const mode=a[5],depth=a[16]?1:0;if(mode!==6&&mode!==7)return original.apply(this,a);const key=mode+':'+depth;let entry=cache.get(key);if(!entry){const frag=DAB_FRAG.replace('uniform float u_inkMode;',`const float u_inkMode=${mode}.0;`).replace('uniform float u_depthWrite;',`const float u_depthWrite=${depth}.0;`);const program=createProgram(gl,DAB_VERT,frag);entry={program,uniforms:getUniforms(gl,program,Object.keys(stamps.uniforms)),pos:gl.getAttribLocation(program,'a_position')};cache.set(key,entry);stats.programs++}
 const saved=[stamps.dabProg,stamps.dabUni,stamps.dabPosLoc];stamps.dabProg=entry.program;stamps.dabUni=entry.uniforms;stamps.dabPosLoc=entry.pos;try{stats.draws++;return original.apply(this,a)}finally{[stamps.dabProg,stamps.dabUni,stamps.dabPosLoc]=saved}};
 return{stats:()=>({...stats}),dispose(){passes.drawRibbonNibPass=original;gl.useProgram(null);for(const entry of cache.values())gl.deleteProgram(entry.program);cache.clear()}};
}
