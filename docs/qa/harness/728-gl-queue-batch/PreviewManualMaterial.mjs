import{PREVIEW_PAIRED_BILINEAR_GLSL}from'../728-room-moment/previewPairedBilinear.mjs';
/** All P/C texture calls are reconstructed before existing material math. */
export function previewManualMaterialShader(source){
 const marker='  vec4 wcInkAvg(';if(!source.includes(marker))throw Error('Original material shader anchor missing');
 let p=0,c=0;const rewritten=source.replace(/texture2D\(u_inkLoad\s*,/g,()=>{p++;return'previewPAt('}).replace(/texture2D\(u_inkColor\s*,/g,()=>{c++;return'previewCAt('});
 if(!p||!c)throw Error('Both original moment samplers required');
 const footprint=PREVIEW_PAIRED_BILINEAR_GLSL.replace(/uniform sampler2D u_previewP;\n|uniform sampler2D u_previewC;\n|uniform vec2 u_previewSize;\n/g,'').replace('void previewPairAt(vec2 uv, out vec4 p, out vec4 c)','vec4 previewMomentAt(highp sampler2D field, vec2 uv)').replaceAll('u_previewSize','vec2(128.0)').replace(/ c=texture2D[^\n]+\n/,'').replace(' p=texture2D',' return texture2D').replaceAll('u_previewP','field');
 const helper=footprint+'\nvec4 previewPAt(vec2 uv){return previewMomentAt(u_inkLoad,uv);}\nvec4 previewCAt(vec2 uv){return previewMomentAt(u_inkColor,uv);}\n';
 return{source:rewritten.replace(marker,helper+marker),counts:{p,c}};
}
/** Compile only opt-in, own program, same production uniform binder/context. */
export async function createPreviewManualMaterial(ribbon,{diagnosticKind=null}={}){
 const[{DAB_VERT,DAB_FRAG},{RibbonPasses},{getUniforms}]=await Promise.all([import('/src/engine/src/raster/shaders.ts'),import('/src/engine/src/raster/RibbonPasses.ts'),import('/src/engine/src/raster/utils.ts')]);
 const ctx=ribbon.ctx,gl=ctx.gl(),original=ctx.stamps(),fragment=diagnosticKind?(await import('./PreviewMaterialDiagnostic.mjs')).previewMaterialDiagnosticShader(DAB_FRAG,diagnosticKind):previewManualMaterialShader(DAB_FRAG);let program=null;const shaders=[];
 try{for(const[type,source]of[[gl.VERTEX_SHADER,DAB_VERT],[gl.FRAGMENT_SHADER,fragment.source]]){const shader=gl.createShader(type);if(!shader)throw Error('Preview shader allocation');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Preview compile: '+gl.getShaderInfoLog(shader))}program=gl.createProgram();if(!program)throw Error('Preview program allocation');for(const shader of shaders)gl.attachShader(program,shader);gl.bindAttribLocation(program,original.positionLoc,'a_position');gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Preview link: '+gl.getProgramInfoLog(program));
 const shadow={program,uniforms:getUniforms(gl,program,[...Object.keys(original.uniforms),...(diagnosticKind?['u_previewProbeOrigin']:[])]),positionLoc:original.positionLoc,bindNoise:location=>original.bindNoise(location)},passes=new RibbonPasses({...ctx,stamps:()=>shadow});let disposed=false;
 return{passes,counts:fragment.counts,setProbeOrigin(origin){if(!diagnosticKind)throw Error('Not a diagnostic material program');gl.useProgram(program);gl.uniform2f(shadow.uniforms.u_previewProbeOrigin,origin[0],origin[1])},disposeAfterFence(){if(disposed)return;disposed=true;gl.deleteProgram(program)}}
 }catch(error){if(program)gl.deleteProgram(program);throw error}finally{for(const shader of shaders)gl.deleteShader(shader)}
}
