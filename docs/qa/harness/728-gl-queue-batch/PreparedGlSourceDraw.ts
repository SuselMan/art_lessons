import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import type { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { PaintTarget } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type { RibbonPasses,RibbonPassesContext } from '../../../../apps/web/src/engine/src/raster/RibbonPasses'

/** QA opt-in binder; reuses existing stamp/ribbon programs, no Dab or dose reconstruction. */
export function drawPreparedGlSource(command:CanonicalDrawCommand,destination:AccumulationBuffer,
 coverage:AccumulationBuffer,tile:PaintTarget,context:RibbonPassesContext,ribbon:RibbonPasses,presetHardness:number):void {
 const uniforms=command.kind==='stamp'?command.stamp.uniforms:command.batch.uniforms
 if(uniforms.worldOrigin[0]!==tile.originX||uniforms.worldOrigin[1]!==(-tile.originY||0))throw Error('Prepared source tile origin mismatch')
 const colour=command.phase==='color'
 if(command.kind==='ribbon'){
  const u=command.batch.uniforms
  ribbon.drawRibbonBands(destination,tile,command.batch.vertices,command.phase==='coverage'?'coverage':command.batch.inkBlend==='max'?'ink-max':'ink',u.aaPx,u.cloudDeposit,u.granDeposit,[...u.mottleSeed],u.washWater,u.waterRetain,u.bristleCombs,u.bristleInk,colour?u.tau:null,u.poolBlot,u.useAvailableWater?coverage:null)
  return
 }
 const gl=context.gl(),s=command.stamp,stamps=context.stamps(),u=stamps.uniforms
 if(command.phase==='coverage')destination.beginDraw()
 else if(s.inkBlend==='max'){const ext=context.minmaxExt();if(!ext)throw Error('Prepared MAX requires original capability');destination.beginMaxDraw(ext)}
 else destination.beginAdditiveDraw()
 try{
  gl.useProgram(stamps.program);stamps.bindNoise(u.u_wcNoiseTex)
  gl.uniform2f(u.u_resolution,destination.width,destination.height)
  for(const [unit,location]of[[0,u.u_paperHeightMap],[1,u.u_original],[2,u.u_strokeCoverage],[3,u.u_inkLoad]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,context.paperTex());gl.uniform1i(location,unit)}
  gl.uniform1f(u.u_eraseMode,0);gl.uniform1i(u.u_grainMode,0);gl.uniform1f(u.u_inkMode,command.inkMode)
  gl.uniform1f(u.u_wickPx,0);gl.uniform1f(u.u_wickCap,0);gl.uniform1f(u.u_aaPx,uniforms.aaPx)
  gl.uniform1f(u.u_hardness,presetHardness);gl.uniform1f(u.u_nibShape,s.nibShape==='roundedBox'?1:0);gl.uniform1f(u.u_nibCorner,s.cornerRadius);gl.uniform1f(u.u_inkEdge,s.inkEdge)
  if(s.inkClip){gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,coverage.texture);gl.activeTexture(gl.TEXTURE0)}
  gl.uniform1f(u.u_inkClip,s.inkClip);gl.uniform2f(u.u_paperOrigin,uniforms.worldOrigin[0],uniforms.worldOrigin[1])
  gl.uniform1f(u.u_cloudDeposit,uniforms.cloudDeposit);gl.uniform1f(u.u_granDeposit,uniforms.granDeposit);gl.uniform2f(u.u_mottleSeed,uniforms.mottleSeed[0],uniforms.mottleSeed[1])
  gl.bindBuffer(gl.ARRAY_BUFFER,context.quadBuf());gl.enableVertexAttribArray(stamps.positionLoc);gl.vertexAttribPointer(stamps.positionLoc,2,gl.FLOAT,false,0,0)
  gl.uniform2f(u.u_dabCenter,s.center[0],s.center[1]);gl.uniform1f(u.u_dabRadius,s.radius);gl.uniform1f(u.u_angle,s.angle);gl.uniform1f(u.u_aspectRatio,s.aspect)
  gl.uniform1f(u.u_pressure,s.pressure);gl.uniform1f(u.u_opacity,s.opacity);gl.uniform1f(u.u_inkWater,s.inkWater);gl.uniform2f(u.u_acrossLocal,s.acrossLocal[0],s.acrossLocal[1])
  gl.uniform1f(u.u_paperWet,s.paperWet);gl.uniform1f(u.u_puddle,s.puddle);gl.uniform1f(u.u_poolBlot,uniforms.poolBlot)
  gl.uniform1f(u.u_washWater,uniforms.washWater);gl.uniform1f(u.u_waterRetain,uniforms.waterRetain);gl.uniform1f(u.u_inkStrength,s.inkStrength)
  gl.uniform1f(u.u_bristleCombs,uniforms.bristleCombs);gl.uniform1f(u.u_bristleInk,uniforms.bristleInk);gl.uniform1f(u.u_depthWrite,colour?1:0)
  gl.uniform3fv(u.u_tau,colour?[...uniforms.tau]:[0,0,0]);gl.drawArrays(gl.TRIANGLES,0,6)
 }finally{destination.endDraw()}
}

/** Actual GL operations behind the typed replay port; invocation remains QA-only. */
export function createPreparedGlSourcePort(input:{
 bindCurrentCanonical:()=>import('./TypedGlSourceReplayPrototype').LateSourceBindings<AccumulationBuffer>
 tile:PaintTarget;context:RibbonPassesContext;ribbon:RibbonPasses
 watercolor:import('../../../../apps/web/src/engine/src/raster/WatercolorPasses').WatercolorPasses
 presetHardness:number
}):import('./TypedGlSourceReplayPrototype').TypedGlSourcePort<AccumulationBuffer>{
 return {
  bindCurrentCanonical:input.bindCurrentCanonical,
  clear:field=>field.clear(),
  copy:(source,destination)=>{if(source===destination||source.texture===destination.texture)throw Error('Source copy must own a distinct destination');source.copyTo(destination)},
  draw:(command,destination,coverage,blend)=>{
   const recorded=command.phase==='coverage'?'over':command.kind==='stamp'?command.stamp.inkBlend:command.batch.inkBlend
   if(recorded!==blend)throw Error('Prepared source blend mismatch')
   if(destination.texture===coverage.texture&&command.phase!=='coverage')throw Error('Source feedback alias')
   drawPreparedGlSource(command,destination,coverage,input.tile,input.context,input.ribbon,input.presetHardness)
  },
  basePlusFilm:(destination,base,film,rect)=>{
   if(destination.texture===base.texture||destination.texture===film.texture)throw Error('Source sum feedback alias')
   input.watercolor.fieldOp(destination,base,film,1,1,{scissor:[...rect]})
  },
 }
}
