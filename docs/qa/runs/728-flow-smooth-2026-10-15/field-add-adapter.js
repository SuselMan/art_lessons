import {DISPLAY_VERT} from '/src/engine/src/raster/shaders.ts';import {createProgram,getUniforms} from '/src/engine/src/raster/utils.ts';
export function install(engine){const gl=engine.gl,passes=engine._watercolorPasses,orig=passes.fieldOp;let accepted=0,total=0;
const frag=`precision highp float;varying vec2 v_uv;uniform sampler2D u_a,u_b;uniform float u_k;
#define WC_FIELD_FIT(v) ((v) / max(1.0, max(max((v).r, (v).g), max((v).b, (v).a))))
void main(){vec4 a=texture2D(u_a,v_uv);vec4 b=texture2D(u_b,v_uv);gl_FragColor=WC_FIELD_FIT(a+b*u_k);}`;
const prog=createProgram(gl,DISPLAY_VERT,frag),u=getUniforms(gl,prog,['u_a','u_b','u_k']),pos=gl.getAttribLocation(prog,'a_position');
passes.fieldOp=function(out,a,b,mode,k,opts={}){total++;if(mode!==1||(opts.world?.[2]??0)>0)return orig.apply(this,arguments);accepted++;out.beginReplaceDraw();if(opts.scissor){gl.enable(gl.SCISSOR_TEST);gl.scissor(...opts.scissor)}gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,passes.ctx.screenBuf());gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.texture);gl.uniform1i(u.u_a,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(u.u_b,1);gl.uniform1f(u.u_k,k);gl.drawArrays(gl.TRIANGLES,0,6);if(opts.scissor)gl.disable(gl.SCISSOR_TEST);out.endDraw();gl.activeTexture(gl.TEXTURE0)};
return{stats:()=>({accepted,total}),dispose(){passes.fieldOp=orig;gl.useProgram(null);gl.deleteProgram(prog)}};
}
