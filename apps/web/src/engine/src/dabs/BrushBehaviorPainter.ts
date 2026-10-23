import { BRUSH_BLEND_MODES, type BrushDescriptor, type Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PencilPreset } from '../presets/pencilPresets'
import { beginBrushBehavior, behaviorStampsForDab, type BrushBehaviorState } from '../presets/brushBehavior'
import { digitalBrushCeiling, brushDabRandom, type BrushPressureSettings } from '../presets/digitalBrushPresets'
import type { BrushTextureId, TipMaskId } from '../presets/tipMasks'
import { BRUSH_V2_COMPOSITE_FRAG, BRUSH_V2_STAMP_FRAG } from '../raster/brushBehaviorShaders'
import { DAB_VERT } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'
import type { BrushContext, BrushScratch } from './BrushPainter'

export interface BehaviorScratch extends BrushScratch { brushBehavior?: BrushBehaviorState; brushCeiling(tile: AccumulationBuffer): AccumulationBuffer }
const modes = ['lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp']
const clamp = (v: number, lo=0, hi=1): number => Math.max(lo,Math.min(hi,v))
const blend = (name: string | undefined): number => Math.max(0,BRUSH_BLEND_MODES.indexOf(name as typeof BRUSH_BLEND_MODES[number]))
type Uniforms=Record<string,WebGLUniformLocation|null>
/** Uses the same frozen-original / coverage resources as the other digital brushes.
 * Only v2 descriptors opt into colour coverage and these equations. */
export class BrushBehaviorPainter {
 private minmax: {MAX_EXT:number}|null=null
 private stamp!: WebGLProgram; private composite!: WebGLProgram
 private su!: Uniforms; private cu!: Uniforms; private sp=-1; private cp=-1
 private readonly ctx: BrushContext
 private readonly tip: (id:TipMaskId)=>WebGLTexture
 private readonly grain: (id:BrushTextureId)=>WebGLTexture
 constructor(ctx: BrushContext,tip:(id:TipMaskId)=>WebGLTexture,grain:(id:BrushTextureId)=>WebGLTexture) {this.ctx=ctx;this.tip=tip;this.grain=grain}
 initGL(): void {
  const gl=this.ctx.gl
  this.minmax=gl.getExtension('EXT_blend_minmax') as {MAX_EXT:number}|null
  this.stamp=createProgram(gl,DAB_VERT,BRUSH_V2_STAMP_FRAG)
  this.composite=createProgram(gl,DAB_VERT,BRUSH_V2_COMPOSITE_FRAG)
  this.su=getUniforms(gl,this.stamp,['u_ceilingPass','u_dabCenter','u_dabRadius','u_angle','u_aspectRatio','u_resolution','u_opacity','u_paperHeightMap','u_tip','u_paperScale','u_paperOrigin','u_paperTexSize','u_tipKind','u_hardness','u_aaPx','u_ceiling','u_paper','u_paperPressure','u_texture','u_texStrength','u_texPeriod','u_texOrigin','u_color','u_flip','u_grainTransform','u_grainTone','u_grainBlend','u_dual','u_dualKind','u_dualBlend','u_dualTransform'])
  this.cu=getUniforms(gl,this.composite,['u_dabCenter','u_dabRadius','u_angle','u_aspectRatio','u_resolution','u_original','u_strokeCoverage','u_ceiling','u_useCeiling','u_opacity','u_blend','u_mode','u_wetEdge','u_burntEdge','u_burntBlend','u_edgePx','u_luminance'])
  this.sp=gl.getAttribLocation(this.stamp,'a_position'); this.cp=gl.getAttribLocation(this.composite,'a_position')
 }
 destroy(): void { const gl=this.ctx.gl; gl.deleteProgram(this.stamp); gl.deleteProgram(this.composite) }
 paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,brush:BrushDescriptor,pressure:BrushPressureSettings,color:[number,number,number],scratch:BehaviorScratch):void {
  const {gl,paper}=this.ctx, behavior=brush.behavior!
  if(!dabs.length)return
  const state=scratch.brushBehavior ?? (scratch.brushBehavior=beginBrushBehavior(dabs[0]))
  const stamps=dabs.flatMap(dab=> {
   const previous=state.previous
   let flow=brush.flow
   if(brush.flowPer==='pass'&&flow<1) {
    const diameter=Math.max(dab.size*preset.sizeMultiplier,0.5)
    const travel=previous ? this.ctx.segmentLength(dab,previous,diameter*0.5) : diameter*Math.max(brush.spacing,0.001)
    flow=1-Math.pow(1-flow,Math.min(travel/(diameter*(brush.flowSpan??1)),1))
   }
   const opacity=digitalBrushCeiling(brush,dab.pressure,pressure.opacity)
   return behaviorStampsForDab(brush,dab,state,color).map(st=>({...st,radius:st.size*preset.sizeMultiplier*0.5,flow:flow*st.flowScale,ceiling:opacity*st.opacityScale,pressure:dab.pressure}))
  }).filter(st=>st.radius>=0.25)
  if(!stamps.length)return
  const edge=scratch.noteBrushEdgePx(clamp(dabs[0].size*preset.sizeMultiplier*0.06,1.5,14))
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const s of stamps) {const r=s.radius*Math.max(s.aspect,1)+edge+1; minX=Math.min(minX,s.x-r);minY=Math.min(minY,s.y-r);maxX=Math.max(maxX,s.x+r);maxY=Math.max(maxY,s.y+r)}
  const bounds={minX:Math.floor(minX),minY:Math.floor(minY),maxX:Math.ceil(maxX),maxY:Math.ceil(maxY)}
  const mask=brush.tip.mask ? this.tip(brush.tip.mask) : paper.texture
  const texture=brush.texture ? this.grain(brush.texture.id) : paper.texture
  const secondary=behavior.dual?.brush
  const dualMask=secondary?.tip.mask ? this.tip(secondary.tip.mask) : paper.texture
  const g=behavior.grain
  const period=Math.max(0.5,(brush.texture?.periodPx??1)*(g ? 0.1+g.zoom*1.9 : 1))
  const wrap=(v:number):number=>((v%period)+period)%period
  for(const tile of target.resolveForPaint(bounds)) {
   const {original,coverage}=scratch.getOrCreate(tile.buffer)
   const ceiling=scratch.brushCeiling(tile.buffer)
   coverage.beginDraw(); gl.useProgram(this.stamp)
   const u=this.su
   gl.uniform2f(u.u_resolution,coverage.width,coverage.height)
   const world=paper.worldSize()
   gl.uniform2f(u.u_paperTexSize,world.w,world.h);gl.uniform2f(u.u_paperScale,paper.scale,paper.scale);gl.uniform2f(u.u_paperOrigin,tile.originX,-tile.originY||0)
   for(const [unit,tex,name] of [[0,paper.texture,'u_paperHeightMap'],[1,mask,'u_tip'],[2,texture,'u_texture'],[3,dualMask,'u_dual']] as const) {gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(u[name],unit)}
   gl.uniform1f(u.u_tipKind,brush.tip.kind==='bitmap'?1:0);gl.uniform1f(u.u_hardness,brush.tip.hardness);gl.uniform1f(u.u_aaPx,1);gl.uniform1f(u.u_paper,brush.paperInteraction)
   gl.uniform1f(u.u_texPeriod,period);gl.uniform2f(u.u_texOrigin,wrap(tile.originX),wrap(tile.originY))
   gl.uniform2f(u.u_grainTone,g?.brightness??0,g?.contrast??0);gl.uniform1f(u.u_grainBlend,g ? blend(g.blendMode) : 1)
   gl.uniform1f(u.u_dualKind,secondary ? secondary.tip.kind==='bitmap'?2:1 : 0);gl.uniform1f(u.u_dualBlend,blend(behavior.dual?.blendMode))
   const dualAngle=(secondary?.tip.angle??0)-brush.tip.angle
   gl.uniform4f(u.u_dualTransform,1,brush.tip.aspect/(secondary?.tip.aspect??1),Math.cos(dualAngle),Math.sin(dualAngle))
   gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.quadBuf());gl.enableVertexAttribArray(this.sp);gl.vertexAttribPointer(this.sp,2,gl.FLOAT,false,0,0)
   const drawStamps=(ceilingPass:boolean):void=>{
   gl.uniform1f(u.u_ceilingPass,ceilingPass?1:0)
   for(const s of stamps) {
    const reach=s.radius*Math.max(s.aspect,1)+1
    if(s.x+reach<tile.originX||s.y+reach<tile.originY||s.x-reach>tile.originX+coverage.width||s.y-reach>tile.originY+coverage.height)continue
    gl.uniform2f(u.u_dabCenter,s.x-tile.originX,s.y-tile.originY);gl.uniform1f(u.u_dabRadius,s.radius);gl.uniform1f(u.u_angle,s.angle);gl.uniform1f(u.u_aspectRatio,s.aspect)
    gl.uniform1f(u.u_opacity,clamp(s.flow));gl.uniform1f(u.u_ceiling,s.ceiling);gl.uniform1f(u.u_paperPressure,s.pressure);gl.uniform3fv(u.u_color,s.color);gl.uniform2f(u.u_flip,s.flipX,s.flipY)
    const jitter=g?.offsetJitter ? brushDabRandom(state.seed,42)*period : 0
    const moving=g?.mode==='moving' ? 1-g.movement : 0
    const rotation=(g?.rotation??0)*Math.PI
    gl.uniform4f(u.u_grainTransform,wrap(-s.x*moving+jitter),wrap(-s.y*moving+jitter),Math.cos(rotation),Math.sin(rotation))
    const depth=(brush.texture?.strength??0)*s.grainDepth
    gl.uniform1f(u.u_texStrength,g ? clamp(Math.max(g.depthMinimum,depth)*(1-g.depthJitter*brushDabRandom(state.seed,43))) : depth)
    gl.drawArrays(gl.TRIANGLES,0,6)
   }
   }
   drawStamps(false);coverage.endDraw()
   if(this.minmax) {ceiling.beginMaxDraw(this.minmax);drawStamps(true);ceiling.endDraw()}
   tile.buffer.beginReplaceDraw();gl.useProgram(this.composite)
   const c=this.cu,render=behavior.rendering
   gl.uniform2f(c.u_resolution,tile.buffer.width,tile.buffer.height)
   for(const [unit,tex,name] of [[0,original.texture,'u_original'],[1,coverage.texture,'u_strokeCoverage'],[2,ceiling.texture,'u_ceiling']] as const) {gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(c[name],unit)}
   gl.uniform1f(c.u_useCeiling,this.minmax?1:0)
   gl.uniform1f(c.u_opacity,state.opacity);gl.uniform1f(c.u_mode,render ? modes.indexOf(render.mode) : 6);gl.uniform1f(c.u_blend,blend(render?.blendMode));gl.uniform1f(c.u_wetEdge,render?.wetEdges??0);gl.uniform1f(c.u_burntEdge,render?.burntEdges??0);gl.uniform1f(c.u_burntBlend,blend(render?.burntEdgesMode));gl.uniform1f(c.u_edgePx,edge);gl.uniform1f(c.u_luminance,render?.luminance?1:0)
   const cx=(bounds.minX+bounds.maxX)*0.5,cy=(bounds.minY+bounds.maxY)*0.5
   gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.quadBuf());gl.enableVertexAttribArray(this.cp);gl.vertexAttribPointer(this.cp,2,gl.FLOAT,false,0,0)
   gl.uniform2f(c.u_dabCenter,cx-tile.originX,cy-tile.originY);gl.uniform1f(c.u_dabRadius,Math.hypot(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)*0.5+1);gl.uniform1f(c.u_angle,0);gl.uniform1f(c.u_aspectRatio,1);gl.drawArrays(gl.TRIANGLES,0,6);tile.buffer.endDraw()
  }
  target.markContentPainted(bounds)
 }
}
