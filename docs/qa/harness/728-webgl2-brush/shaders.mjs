/** Diagnostic GLSL syntax adaptation only; math functions remain literal production source. */
export function brushVariants(vertex, fragment) {
  if (!fragment.includes('precision highp float;') || !fragment.includes('gl_FragColor=result/255.0;')) throw Error('Production brush signature changed')
  const vertex300='#version 300 es\n'+vertex.replace('attribute vec2 a_position;', 'in vec2 a_position;').replace('varying vec2 v_uv;', 'out vec2 v_uv;')
  const common=fragment.replace('varying vec2 v_uv;', 'in vec2 v_uv;').replaceAll('texture2D(', 'texture(')
  const single300='#version 300 es\n'+common.replace('  precision highp float;', '  precision highp float;\n  layout(location=0) out vec4 outRecord;').replace('gl_FragColor=', 'outRecord=')
  const mainStart=common.indexOf('  void main() {')
  if(mainStart<0)throw Error('No production main')
  const mrt300='#version 300 es\n'+common.slice(0,mainStart).replace('  precision highp float;', '  precision highp float;\n  layout(location=0) out vec4 outPigment;\n  layout(location=1) out vec4 outColor;')+`  void main() {
    vec2 center=snapUV(v_uv);
    vec4 ownP=floor(texture(u_pigment,center)*255.0+0.5), resultP=ownP;
    vec4 ownC=floor(texture(u_color,center)*255.0+0.5), resultC=ownC;
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), neighbour=snapUV(center+dir*u_step);
      float outgoing=integerFraction(center,neighbour,dir);
      float incoming=integerFraction(neighbour,center,-dir);
      resultP-=floor(ownP*outgoing);
      resultP+=floor(floor(texture(u_pigment,neighbour)*255.0+0.5)*incoming);
      resultC-=floor(ownC*outgoing);
      resultC+=floor(floor(texture(u_color,neighbour)*255.0+0.5)*incoming);
    }
    outPigment=resultP/255.0;
    outColor=resultC/255.0;
  }
`
  return {vertex100:vertex,fragment100:fragment,vertex300,single300,mrt300}
}
