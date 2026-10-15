import {DISPLAY_VERT,WC_DIFFUSE_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
/** Limit only uphill paper drift; retain symmetric colour exchange; same donor fractions for optical and material fields. */
export function concentrationFlowShader(){
 let source=WC_DIFFUSE_FRAG.replace('uniform sampler2D u_ink;','uniform sampler2D u_ink; uniform sampler2D u_density;')
 source=source.replace('float give = gate * (u_d + u_b * max(dh, 0.0));\n        float take = gate * (u_d + u_b * max(-dh, 0.0));',`vec4 mi=texture2D(u_density,v_uv),mj=texture2D(u_density,uvj);
 float diff=u_d*(mi.b-mj.b);
 float drift=u_b*(max(dh,0.)*mi.b-max(-dh,0.)*mj.b);
 float limiter=abs(diff)<1e-8?0.:(diff*drift<0.?min(1.,abs(diff)/max(abs(drift),1e-8)):1.);
 float give=gate*(u_d+limiter*u_b*max(dh,0.));
 float take=gate*(u_d+limiter*u_b*max(-dh,0.));`)
 if(!source.includes('float limiter='))throw Error('M47 diffusion shader changed')
 return source
}
export function createConcentrationFlow(gl:WebGLRenderingContext,passes:any){
 const source=concentrationFlowShader()
 const program=createProgram(gl,DISPLAY_VERT,source),uniforms=getUniforms(gl,program,[...Object.keys(passes._diffuseUni),'u_density']),position=gl.getAttribLocation(program,'a_position')
 return{run<T>(fn:()=>T):T{const old=[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc],step=passes.diffuseStep;[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc]=[program,uniforms,position];passes.diffuseStep=function(...args:any[]){const density=args[11]??args[6];gl.useProgram(program);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,density.texture);gl.uniform1i(uniforms.u_density,3);gl.activeTexture(gl.TEXTURE0);return step.apply(this,args)};try{return fn()}finally{passes.diffuseStep=step;[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc]=old}},destroy(){gl.useProgram(null);gl.deleteProgram(program)}}
}
