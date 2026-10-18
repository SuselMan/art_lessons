/** Tiny operator-owned device probes only. No context/resource creation on import. */
export const EXPECTED_OUTPUT=[1.000244140625,.12345679,-.25,4] as const
const value='vec4(1.000244140625,0.12345679,-0.25,4.0)'
export const outputProbes=[
 {id:'webgl1-original',context:'webgl',legal:true,vertex:'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}',fragment:`precision highp float;void main(){gl_FragColor=${value};}`},
 // Diagnostic compile-negative control: GLSL ES100 reserved built-in, NOT a portable fix.
 {id:'webgl1-redeclare-highp',context:'webgl',legal:false,vertex:'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}',fragment:`precision highp float;highp vec4 gl_FragColor;void main(){gl_FragColor=${value};}`},
 {id:'webgl2-explicit-highp',context:'webgl2',legal:true,vertex:'#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}',fragment:`#version 300 es
precision highp float;
layout(location=0) out highp vec4 outColor;
void main(){outColor=${value};}`}
] as const
/** Only use after actual WebGL2 RGBA32F + EXT_color_buffer_float tiny render/read gate. */
export function fragment300(source:string){
 if(source.includes('#version')||source.includes('outColor')||!source.includes('gl_FragColor')||/\b(varying|attribute|gl_FragData)\b/.test(source))throw Error('Unexpected GLSL100 source for mechanical conversion')
 return '#version 300 es\nlayout(location=0) out highp vec4 outColor;\n'+source.replace(/\btexture2D\b/g,'texture').replace(/\bgl_FragColor\b/g,'outColor')
}
