import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createFullscreenQuad,createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'

/** Display-only wet-paper tint. Never sampled by the solver or stored in raw paint. */
export function createWaterPreview(gl:WebGLRenderingContext){
 const program=createProgram(gl,`attribute vec2 a_position;varying vec2 uv;void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`,`precision highp float;varying vec2 uv;uniform sampler2D paint,water,foreignWater;uniform float strength;void main(){vec4 p=texture2D(paint,uv);float v=texture2D(water,uv).a+texture2D(foreignWater,uv).a;float a=strength*smoothstep(0.,.25,v);gl_FragColor=p+vec4(vec3(.42)*a,a)*(1.-p.a);}`)
 const quad=createFullscreenQuad(gl),position=gl.getAttribLocation(program,'a_position'),uniforms=getUniforms(gl,program,['paint','water','foreignWater','strength'])
 // A transparent fallback avoids sampling paint when one water field is absent.
 const empty=new AccumulationBuffer(gl,1,1);empty.clear()
 return {
  draw(out:AccumulationBuffer,paint:AccumulationBuffer,water:AccumulationBuffer|null,foreignWater:AccumulationBuffer|null,strength:number){
   if(!water&&!foreignWater||strength<=0){paint.copyTo(out);return}
   out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
   for(const [i,[name,buffer]]of Object.entries({paint,water:water??empty,foreignWater:foreignWater??empty}).entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,buffer.texture);gl.uniform1i(uniforms[name],i)}
   gl.uniform1f(uniforms.strength,strength);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0)
  },
  destroy(){empty.destroy();gl.deleteBuffer(quad);gl.deleteProgram(program)}
 }
}
