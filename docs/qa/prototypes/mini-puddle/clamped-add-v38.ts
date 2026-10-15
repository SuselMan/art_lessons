import {DISPLAY_VERT,WC_FIELD_ADD_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
/** Ablation: carrier saturation must not divide every pigment channel. */
export function createClampedAdd(gl:WebGLRenderingContext,passes:any){
 const source=WC_FIELD_ADD_FRAG.replace(/^.*#define WC_FIELD_FIT.*$/m,'#define WC_FIELD_FIT(v) clamp((v),0.,1.)')
 const program=createProgram(gl,DISPLAY_VERT,source),uniforms=getUniforms(gl,program,['u_a','u_b','u_k']),position=gl.getAttribLocation(program,'a_position')
 return{run<T>(fn:()=>T):T{const old=passes._plainAdd;passes._plainAdd={program,uniforms,position};try{return fn()}finally{passes._plainAdd=old}},destroy(){gl.useProgram(null);gl.deleteProgram(program)}}
}
