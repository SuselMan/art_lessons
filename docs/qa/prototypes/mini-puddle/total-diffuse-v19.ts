import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {WC_DIFFUSE_FRAG,DISPLAY_VERT} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
/** M19: the resting pigment also participates in the diffusion potential. */
export function createTotalDiffuse(gl:WebGLRenderingContext,passes:any){
 let fixed:any=null
 const originalGive='float give = gate * (u_d + u_b * max(dh, 0.0));',originalTake='float take = gate * (u_d + u_b * max(-dh, 0.0));'
 if(!WC_DIFFUSE_FRAG.includes(originalGive)||!WC_DIFFUSE_FRAG.includes(originalTake))throw Error('M19 diffuse source changed')
 const shader=WC_DIFFUSE_FRAG.replace('uniform sampler2D u_ink;',`uniform sampler2D u_ink,u_fixed,u_density,u_solvent;uniform float u_hasSolvent;`)
 .replace(originalGive,`float mi=texture2D(u_density,v_uv).a,mj=texture2D(u_density,uvj).a;
 float vi=u_hasSolvent>.5?max(texture2D(u_solvent,v_uv).a,.02):1.;
 float vj=u_hasSolvent>.5?max(texture2D(u_solvent,uvj).a,.02):1.;
 float ci=(mi+texture2D(u_fixed,v_uv).a)/vi,cj=(mj+texture2D(u_fixed,uvj).a)/vj;
 float pairV=2.*vi*vj/max(vi+vj,.004);
 float give=gate*min(u_d+u_b*max(dh,0.),.12)*min(max(ci-cj,0.)*pairV/max(mi,.004),1.);`)
 .replace(originalTake,`float take=gate*min(u_d+u_b*max(-dh,0.),.12)*min(max(cj-ci,0.)*pairV/max(mj,.004),1.);`)
 const program=createProgram(gl,DISPLAY_VERT,shader),uniforms=getUniforms(gl,program,[...Object.keys(passes._diffuseUni),'u_fixed','u_density','u_solvent','u_hasSolvent']),pos=gl.getAttribLocation(program,'a_position')
 const api={reset(){fixed=null},run<T>(fn:()=>T):T{const op=passes.fieldOp,step=passes.diffuseStep;const old=[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc];passes.fieldOp=function(...args:any[]){if(args[3]===15)fixed=args[2];return op.apply(this,args)};passes.diffuseStep=function(...args:any[]){if(!fixed||!args[11])return step.apply(this,args);passes._diffuseProg=program;passes._diffuseUni=uniforms;passes._diffusePosLoc=pos;gl.useProgram(program);for(const [unit,name,buf]of [[3,'u_fixed',fixed],[4,'u_density',args[11]],[5,'u_solvent',args[12]??args[11]]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,buf.texture);gl.uniform1i(uniforms[name],unit)}gl.uniform1f(uniforms.u_hasSolvent,args[12]?1:0);try{return step.apply(this,args)}finally{[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc]=old}};try{return fn()}finally{passes.fieldOp=op;passes.diffuseStep=step;[passes._diffuseProg,passes._diffuseUni,passes._diffusePosLoc]=old}},destroy(){fixed=null;gl.useProgram(null);gl.deleteProgram(program)},probe(){const buffers=Array.from({length:6},()=>new AccumulationBuffer(gl,2,1,'nearest'));const [mobile,rest,cost,water,out,gate]=buffers;const upload=(buf:AccumulationBuffer,values:number[])=>{gl.bindTexture(gl.TEXTURE_2D,buf.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,2,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(values))};const oldFixed=fixed;try{upload(mobile,[20,20,20,20,51,51,51,51]);upload(rest,[153,153,153,153,0,0,0,0]);cost.clear();upload(water,[0,0,0,128,0,0,0,128]);upload(gate,[255,255,255,255,255,255,255,255]);const paper=passes.ctx.paperWorldSize();const step=()=>{passes.diffuseStep({w:2,h:1,coverage:gate},0,0,1,paper.w,paper.h,mobile,out,1,false,gate,mobile,water);return Array.from(out.readPixels())};const native=step();fixed=rest;const total=api.run(step);return{input:[20,51],fixed:[153,0],native,total,gl:gl.getError()}}finally{fixed=oldFixed;buffers.forEach(b=>b.destroy())}}};return api
}
