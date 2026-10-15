import {DISPLAY_VERT,WC_FIELD_ADD_FRAG,WC_FIELD_OP_FRAG,WC_FIELD_OP_HIGH_FRAG,WC_FIELD_OP_CARRY_FRAG,WC_FIELD_OP_CARRY_COLOUR_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
/** Diagnostic only: independent channel saturation in native material operations. */
export function createClampedFields(gl:WebGLRenderingContext,passes:any){
 const clamp=(s:string)=>s.replace(/^.*#define WC_FIELD_FIT.*$/m,'#define WC_FIELD_FIT(v) clamp((v),0.,1.)')
 const fields=[['_fieldOp',WC_FIELD_OP_FRAG],['_fieldOpHigh',WC_FIELD_OP_HIGH_FRAG],['_fieldOpCarry',WC_FIELD_OP_CARRY_FRAG],['_fieldOpCarryColour',WC_FIELD_OP_CARRY_COLOUR_FRAG]].map(([key,source])=>{const program=createProgram(gl,DISPLAY_VERT,clamp(source));return{key,program,uniforms:getUniforms(gl,program,Object.keys(passes[key+'Uni'])),position:gl.getAttribLocation(program,'a_position')}})
 const program=createProgram(gl,DISPLAY_VERT,clamp(WC_FIELD_ADD_FRAG)),add={program,uniforms:getUniforms(gl,program,['u_a','u_b','u_k']),position:gl.getAttribLocation(program,'a_position')}
 return{run<T>(fn:()=>T):T{const oldAdd=passes._plainAdd,old=fields.map(f=>[passes[f.key+'Prog'],passes[f.key+'Uni'],passes[f.key+'PosLoc']]);for(const f of fields)[passes[f.key+'Prog'],passes[f.key+'Uni'],passes[f.key+'PosLoc']]=[f.program,f.uniforms,f.position];passes._plainAdd=add;try{return fn()}finally{passes._plainAdd=oldAdd;fields.forEach((f,i)=>{[passes[f.key+'Prog'],passes[f.key+'Uni'],passes[f.key+'PosLoc']]=old[i]})}},destroy(){gl.useProgram(null);gl.deleteProgram(program);fields.forEach(f=>gl.deleteProgram(f.program))}}
}
