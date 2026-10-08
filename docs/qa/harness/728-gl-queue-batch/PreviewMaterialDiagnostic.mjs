import{previewManualMaterialShader}from'./PreviewManualMaterial.mjs';
/** OFF64x64 material-only diagnostic. Same shader math through migration,
 * readback channels replace final RGB, NEVER bind result as a paint input.
 * Vertex resolution remains64; fragment source/world resolution remains1024.
 */
export function previewMaterialDiagnosticShader(original,kind){
 if(!['plain','migration','colour'].includes(kind))throw Error('Explicit material diagnostic plane');
 let source=previewManualMaterialShader(original).source;
 const anchor='      float pigment = clamp(coverage * v_opacity * density * gran * cloud * paperMod * (1.0 + wet), 0.0, 1.0);';
 if(source.split(anchor).length!==2)throw Error('Material diagnostic final anchor');
 if(kind==='colour'){
  const tau='      vec3 tauPrior = vec3(0.0);',assign='        tauPrior = localDepth.rgb * WC_DEPTH_SCALE / max(localDepth.a, 5e-5);';
  if(!source.includes(tau)||!source.includes(assign))throw Error('Local depth diagnostic anchors');
  source=source.replace(tau,tau+'\n      float previewLocalDepthA=0.0;').replace(assign,'        previewLocalDepthA=localDepth.a;\n'+assign);
 }
 if(kind!=='plain')source=source.replace(anchor,(kind==='migration'?'      gl_FragColor=vec4(ink.a,deposit,strengthHere,pigmentMass);':'      gl_FragColor=vec4(depth.a,previewLocalDepthA,density,coverage);')+'\n      return;\n'+anchor);
 source=source.replaceAll('gl_FragCoord','(gl_FragCoord+vec4(u_previewProbeOrigin,0.0,0.0))');
 const declaration='uniform vec2 u_previewProbeOrigin;\n';const precision=/precision highp float;/;if(!precision.test(source))throw Error('Shader precision anchor');source=source.replace(precision,'precision highp float;\n'+declaration);
 return{source,kind,output:kind==='plain'?['originalMaterialR','originalMaterialG','originalMaterialB','originalMaterialA']:kind==='migration'?['preMigrationDeposit','postMigrationDeposit','postMigrationStrength','pigmentMass']:['depthAlpha','localDepthAlpha','density','spreadCoverage'],sourceResolution:[1024,1024],targetResolution:[64,64]};
}
