// Frozen Mini M01, source 672cecc4; ordinary resolution.
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { createProgram } from '../../../../apps/web/src/engine/src/raster/utils'

/** Only called at a gesture boundary, never in live dab batches. */
export function createMaterialBlend(gl: WebGLRenderingContext, size: number) {
  const program=createProgram(gl,`attribute vec2 a_position;varying vec2 uv;void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`,`precision highp float;varying vec2 uv;uniform sampler2D a,b;uniform float t;void main(){gl_FragColor=mix(texture2D(a,uv),texture2D(b,uv),t);}`)
  const position=gl.getAttribLocation(program,'a_position'),a=gl.getUniformLocation(program,'a'),b=gl.getUniformLocation(program,'b'),t=gl.getUniformLocation(program,'t')
  const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const out=new AccumulationBuffer(gl,size,size)
  return {
    mix(from:AccumulationBuffer,to:AccumulationBuffer,progress:number,dest:AccumulationBuffer){
      out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,from.texture);gl.uniform1i(a,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,to.texture);gl.uniform1i(b,1);gl.uniform1f(t,progress);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();out.copyTo(dest);gl.activeTexture(gl.TEXTURE0)
    },
    destroy(){out.destroy();gl.deleteProgram(program);gl.deleteBuffer(quad)},
  }
}
