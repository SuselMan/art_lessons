import { CIRCLE_BAND_STAMP_FRAG } from '../raster/circleBandShaders'
import { prepareCircleDifference, type CircleDifference } from '../raster/roundCoverage'
import { nativeImageResource, nativeImageDomain, nativeImageDomainUniform, nativeImageUVShift, type NativeImageResource } from './NativeImageBank'
import { proceduralProfileUniforms, proceduralSampleCount } from '../raster/brushProcedural'
import { gaussianSampleCount } from '../raster/gaussianTip'
import { brushTipResource, brushTextureResourceKey } from './BrushPreparation'
import type { MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { advanceWashOpacity } from '../presets/brushWash'
import { brushTextureApplication } from './brushTextureApplication'
import { brushFootprintBounds, brushFootprintCopyRect } from './brushFootprint'
import { BRUSH_BLEND_MODES, type BrushDescriptor, type BrushTip, type Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { wetMixStep } from '../presets/wetMix'
import type { PencilPreset } from '../presets/pencilPresets'
import { beginBrushBehavior, behaviorStampsForDab, secondaryBrushDabs, splitBrushTail, type BehaviorPlaced, type BrushBehaviorState, type SecondarySamplingState } from '../presets/brushBehavior'
import { digitalBrushCeiling, brushDabRandom, curveAt, type BrushPressureSettings } from '../presets/digitalBrushPresets'
import type { BrushTextureId, TipMaskId } from '../presets/tipMasks'
import { BRUSH_COMPOSITE_FRAG, BRUSH_STAMP_FRAG, createBrushStampFragment } from '../raster/brushBehaviorShaders'
import { DAB_VERT } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'
import type { BrushContext, BrushScratch } from './BrushPainter'
const STAMP_UNIFORMS = [
  'u_circleClipped', 'u_circleClip0', 'u_circleClip1', 'u_circleClip2', 'u_circleClip3',
  'u_gaussianGeometry', 'u_tipProfile', 'u_dualProfile', 'u_wickPx',
  'u_wickCap', 'u_tipPacking', 'u_dualTipPacking', 'u_lightnessMaterial',
  'u_lightnessStrength', 'u_dualLightnessMaterial', 'u_textureApplication', 'u_textureMapping',
  'u_dualTextureApplication', 'u_dualTextureMapping', 'u_alphaThreshold', 'u_dualAlphaThreshold',
  'u_tipBounds', 'u_dualBounds', 'u_edgeBleed', 'u_ceilingPass',
  'u_uniformCeiling', 'u_washMode', 'u_washFlow', 'u_washAverage',
  'u_ceilingFallback', 'u_previousCeiling', 'u_dabCenter', 'u_dabRadius',
  'u_angle', 'u_aspectRatio', 'u_resolution', 'u_opacity',
  'u_paperHeightMap', 'u_tip', 'u_paperScale', 'u_paperOrigin',
  'u_paperTexSize', 'u_tipKind', 'u_hardness', 'u_aaPx',
  'u_ceiling', 'u_paper', 'u_paperPressure', 'u_texture',
  'u_texStrength', 'u_texPeriod', 'u_texOrigin', 'u_color',
  'u_flip', 'u_grainTransform', 'u_grainTone', 'u_grainBlend',
  'u_dual', 'u_dualKind', 'u_dualBlend', 'u_dualTransform',
  'u_dualHardness', 'u_dualStrength', 'u_dualTexture', 'u_dualTexOrigin',
  'u_dualTexPeriod', 'u_dualTexStrength', 'u_tipProcedural', 'u_dualProcedural',
  'u_tipProceduralGeometry', 'u_dualProceduralGeometry', 'u_dualProceduralAngle',
  'u_tipImageEnabled', 'u_dualImageEnabled', 'u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain', 'u_dualImageDomain',
]
type BrushTarget = Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>
export interface BehaviorScratch extends BrushScratch {
  brushSecondary(): {scratch:BehaviorScratch;sampling:SecondarySamplingState;tile:(source:AccumulationBuffer)=>AccumulationBuffer}
  brushBehavior?: BrushBehaviorState
  brushCeiling(tile: AccumulationBuffer): AccumulationBuffer
  brushCeilingCopy(tile: AccumulationBuffer): AccumulationBuffer
  brushPreview(tile: AccumulationBuffer): {
    coverage: AccumulationBuffer
    ceiling: AccumulationBuffer
  }
}
const modes = ['lightGlaze', 'uniformGlaze', 'intenseGlaze', 'heavyGlaze', 'uniformBlend', 'intenseBlend', 'buildUp']
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v))
const blend = (name: string | undefined): number => Math.max(0, BRUSH_BLEND_MODES.indexOf(name as typeof BRUSH_BLEND_MODES[number]))
type Uniforms = Record<string, WebGLUniformLocation | null>
type BrushBounds = { minX: number; minY: number; maxX: number; maxY: number }
const unionBounds = (a: BrushBounds | undefined, b: BrushBounds): BrushBounds => a ? ({
  minX: Math.min(a.minX,b.minX), minY: Math.min(a.minY,b.minY),
  maxX: Math.max(a.maxX,b.maxX), maxY: Math.max(a.maxY,b.maxY),
}) : b
/** Bounds in world coordinates -> integer GL copy rectangle. */
const boundsCopyRect = (bounds: BrushBounds, tile: { originX: number; originY: number; buffer: AccumulationBuffer }, halo = 0) => {
  const left = Math.max(0,Math.floor(bounds.minX-tile.originX-halo))
  const right = Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX+halo))
  const top = Math.max(0,Math.floor(bounds.minY-tile.originY-halo))
  const bottom = Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY+halo))
  return right>left && bottom>top ? { x:left,y:tile.buffer.height-bottom,width:right-left,height:bottom-top } : null
}
/** Uses the same frozen-original / coverage resources as the other digital brushes.
 * Only v2 descriptors opt into colour coverage and these equations. */
export class BrushBehaviorPainter {
  private circleStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private previewBounds = new WeakMap<BrushBehaviorState,BrushBounds>()
  private bindings = new WeakMap<BehaviorScratch, {
    target: BrushTarget
    preset: PencilPreset
    brush: BrushDescriptor
    pressure: BrushPressureSettings
    color: [
      number,
      number,
      number
    ]
  }>();
  private minmax: {
    MAX_EXT: number
  } | null = null;
  private stamp!: WebGLProgram
  private imageStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private proceduralStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private composite!: WebGLProgram
  private su!: Uniforms
  private cu!: Uniforms
  private sp = -1;
  private cp = -1;
  private readonly ctx: BrushContext
  private readonly tip: (id: TipMaskId, gray?: string, group?: MaterialTextureGroup, native?: NativeImageResource) => WebGLTexture
  private readonly grain: (id: BrushTextureId, discrete?: boolean) => WebGLTexture
  private readonly protectTextures: (keys: readonly string[]) => void
  private readonly leaseTextures: (brush: BrushDescriptor) => () => void
  constructor(ctx: BrushContext, tip: (id: TipMaskId, gray?: string, group?: MaterialTextureGroup, native?: NativeImageResource) => WebGLTexture, grain: (id: BrushTextureId, discrete?: boolean) => WebGLTexture, protectTextures: (keys: readonly string[]) => void, leaseTextures: (brush: BrushDescriptor) => () => void) { this.ctx = ctx; this.tip = tip; this.grain = grain; this.protectTextures = protectTextures; this.leaseTextures = leaseTextures }
  private tipView(id: TipMaskId, gray?: string, tip?: BrushTip, native?: NativeImageResource): {texture:WebGLTexture; mode:number} {
    if (tip?.imageSampling && !native) throw Error('Native image lookup requires an explicit selected level')
    const resource=brushTipResource(id,gray,tip)
    return {texture:this.tip(id,gray,resource.materialGroup,native),mode:resource.materialChannels==='rg' ? 1 : resource.materialChannels==='ba' ? 2 : 0}
  }
  initGL(): void {
    this.circleStamp = undefined
    this.proceduralStamp = undefined
    this.imageStamp = undefined
    const gl = this.ctx.gl
    this.minmax = gl.getExtension('EXT_blend_minmax') as {
      MAX_EXT: number
    } | null
    this.stamp = createProgram(gl, DAB_VERT, BRUSH_STAMP_FRAG)
    this.composite = createProgram(gl, DAB_VERT, BRUSH_COMPOSITE_FRAG)
    this.su = getUniforms(gl, this.stamp, STAMP_UNIFORMS)
    this.cu = getUniforms(gl, this.composite, ['u_physicalAccumulation','u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution', 'u_original', 'u_strokeCoverage', 'u_ceiling', 'u_opacity', 'u_blend', 'u_mode', 'u_burntEdge', 'u_burntBlend', 'u_edgePx', 'u_luminance', 'u_gammaCorrect', 'u_secondaryCoverage', 'u_secondaryMode', 'u_secondaryEnabled', 'u_surfaceCloud', 'u_surfaceGrain', 'u_surface', 'u_surfaceOrigin', 'u_screenOrigin', 'u_screentone', 'u_erase'])
    this.sp = gl.getAttribLocation(this.stamp, 'a_position')
    this.cp = gl.getAttribLocation(this.composite, 'a_position')
  }
  /** Compile the bounded profile capability during explicit brush readiness. */
  prepareProcedural(): void { this.stampFor(true) }

  prepareCircleBand(): void { this.circleProgram() }

  private circleProgram(): { program: WebGLProgram; uniforms: Uniforms; position: number } {
    if (!this.circleStamp) {
      const gl = this.ctx.gl, program = createProgram(gl, DAB_VERT, CIRCLE_BAND_STAMP_FRAG)
      this.circleStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
    }
    return this.circleStamp
  }

  prepareIntegerImages(): void { this.stampFor(true, true) }

  private stampFor(procedural: boolean, integerImages = false): { program: WebGLProgram; uniforms: Uniforms; position: number } {
    if (integerImages) {
      if (!this.imageStamp) {
        const gl = this.ctx.gl, program = createProgram(gl, DAB_VERT, createBrushStampFragment(true, true))
        this.imageStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
      }
      return this.imageStamp
    }
    if (!procedural) return { program: this.stamp, uniforms: this.su, position: this.sp }
    if (!this.proceduralStamp) {
      const gl = this.ctx.gl
      const program = createProgram(gl, DAB_VERT, createBrushStampFragment(true))
      this.proceduralStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
    }
    return this.proceduralStamp
  }
  finish(scratch: BehaviorScratch, endpoint?: Dab & {baseSize:number}): void {
    const b = this.bindings.get(scratch); if (b)
      this.paint(b.target, [], b.preset, b.brush, b.pressure, b.color, scratch, true, endpoint)
  }
  destroy(): void {
    const gl = this.ctx.gl
    if (this.circleStamp) gl.deleteProgram(this.circleStamp.program)
    this.circleStamp = undefined
    gl.deleteProgram(this.stamp)
    gl.deleteProgram(this.composite)
    if (this.proceduralStamp) gl.deleteProgram(this.proceduralStamp.program)
    this.proceduralStamp = undefined
    if (this.imageStamp) gl.deleteProgram(this.imageStamp.program)
    this.imageStamp = undefined
  }
  paint(target: BrushTarget, dabs: Dab[], preset: PencilPreset, brush: BrushDescriptor, pressure: BrushPressureSettings, color: [
    number,
    number,
    number
  ], scratch: BehaviorScratch, finish = false, endpoint?:Dab & {baseSize:number}): void {
    const { gl, paper } = this.ctx, behavior = brush.behavior!
    if (!dabs.length && !scratch.brushBehavior)
      return
    const releaseTextures = this.leaseTextures(brush)
    try {
    this.bindings.set(scratch, { target, preset, brush, pressure, color })
    const state = scratch.brushBehavior ?? (scratch.brushBehavior = beginBrushBehavior(dabs[0]))
    const independent = behavior.dual?.sampling === 'independent' ? behavior.dual.brush : undefined
    const secondaryState = independent ? scratch.brushSecondary() : undefined
    let secondaryDirty: BrushBounds | undefined
    if (independent && secondaryState) {
      const secondaryTarget: BrushTarget={
        resolveForPaint:bounds=>target.resolveForPaint(bounds).map(tile=>({...tile,buffer:secondaryState.tile(tile.buffer)})),
        // Includes the child's old + new provisional tail, even on finish()
        // or when centreline resampling emits no new secondary dab.
        markContentPainted:bounds=>{ secondaryDirty=unionBounds(secondaryDirty,bounds) },
      }
      const child={...independent,behavior:independent.behavior??{version:2 as const}}
      this.paint(secondaryTarget, secondaryBrushDabs(brush,child,dabs,secondaryState.sampling,pressure.size,endpoint),{...preset,sizeMultiplier:1/Math.max(child.tip.aspect,1)},child,pressure,[1,1,1],secondaryState.scratch,finish)
    }

    const accumulation=behavior.rendering?.accumulation
    const circleBand = brush.tip.profile?.kind === 'circleBand'
    if (circleBand !== (accumulation === 'maxAlpha')) throw Error('Circle band requires max-alpha accumulation')
    if(accumulation==='alphaDarken'){
      if(state.washColor && color.some((value,index)=>value!==state.washColor![index]))state.washVaryingPigment=true
      state.washColor??=[...color]
    }
    const constantPigment=!state.washVaryingPigment && !brush.tip.material && !behavior.colorAdjustment && !['hue','saturation','brightness'].some(key=>behavior.dynamics?.[key as 'hue'] || behavior.modulations?.[key as 'hue'])
    const incoming = dabs.flatMap(dab => {
      const previous = state.previous
      let flow = brush.flow
      if (brush.flowPer === 'pass' && flow < 1) {
        const diameter = Math.max(dab.size * preset.sizeMultiplier, 0.5)
        const travel = previous ? this.ctx.segmentLength(dab, previous, diameter * 0.5) : diameter * Math.max(brush.spacing, 0.001)
        flow = 1 - Math.pow(1 - flow, Math.min(travel / (diameter * (brush.flowSpan ?? 1)), 1))
      }
      // A secondary wet component contributes optical coverage here. Canvas
      // colour pickup remains the parent mixer's job, rather than a second
      // competing reservoir painting directly into the same layer.
      const wet=brush.model==='mixer' && behavior.wetMix ? wetMixStep(behavior.wetMix,state,dab,previous?Math.hypot(dab.x-previous.x,dab.y-previous.y)/Math.max(.5,dab.size):0,!previous,state):undefined
      if(wet)flow*=wet.strength
      const opacity = digitalBrushCeiling(brush, dab.pressure, pressure.opacity)*(wet?state.charge:1)
      // Only admitted paint dabs enter the native-style opacity history.
      // Geometry/RNG still advance above, but a discarded tiny footprint must
      // not leave a high average behind for the next visible low-opacity dab.
      return behaviorStampsForDab(brush, dab, state, color).filter(st=>st.size*preset.sizeMultiplier*.5>=.25).map(st => {
        // Native BuildUp OVER consumes the operation opacity per dab. Keeping
        // it for the final composite instead imposes a whole-stroke ceiling.
        const ceiling=clamp(opacity*st.opacityScale*(accumulation==='directOver' ? state.opacity : 1))
        const wash=accumulation==='alphaDarken' ? advanceWashOpacity(state.washOpacity??=( {average:0,maximum:0} ),ceiling) : undefined
        return {...st,...(circleBand ? {aspect:1,angle:0} : {}),radius:st.size*preset.sizeMultiplier*.5,flow:flow*st.flowScale,ceiling,pressure:dab.pressure,
          ...(wash ? {washAverage:wash.average,washFeedback:!wash.canBlend || !constantPigment} : {})}
      })
    })
    // Prepare once per admitted placed dab, before tile traversal. The same
    // stroke state survives operation chunks; a new scratch starts a new disc.
    const circleClips = new Map<BehaviorPlaced, CircleDifference>()
    if (circleBand) {
      let previous = state.previousCoverageCircle
      for (const stamp of incoming) {
        const current = { x: stamp.x, y: stamp.y, radius: stamp.radius }
        circleClips.set(stamp, prepareCircleDifference(previous, current))
        previous = current
      }
      if (previous) state.previousCoverageCircle = previous
    }
    const all = [...(state.pending ?? []), ...incoming]
    const tail = splitBrushTail(all, state.distance, behavior.taper?.end ?? 0, finish, behavior.taper?.size, behavior.taper?.opacity)
    state.pending = tail.pending
    const stamps = [...tail.ready, ...tail.preview]
    const oldPreview = this.previewBounds.get(state)
    if (!stamps.length && !secondaryDirty && !oldPreview)
      return
    const edge = (behavior.rendering?.burntEdges || brush.wet?.feather) ? scratch.noteBrushEdgePx(clamp((dabs[0]?.size ?? state.previous?.size ?? 1) * preset.sizeMultiplier * 0.06, 1.5, 14)) : 0
    let dirty: BrushBounds | undefined = oldPreview
    let nextPreview: BrushBounds | undefined
    for (const s of all) {
      const footprint=brushFootprintBounds(s.x,s.y,s.radius,s.aspect,s.angle,edge+1)
      if(footprint) dirty=unionBounds(dirty,footprint)
    }
    for (const s of tail.preview) {
      const footprint=brushFootprintBounds(s.x,s.y,s.radius,s.aspect,s.angle,edge+1)
      if(footprint) nextPreview=unionBounds(nextPreview,footprint)
    }
    if (nextPreview) this.previewBounds.set(state,nextPreview)
    else this.previewBounds.delete(state)
    if(secondaryDirty) dirty=unionBounds(dirty,secondaryDirty)
    if(!dirty)return
    // Only current changes are dirty. Historical primary coverage remains in
    // scratch and the output tile; it does not require recompositing.
    const bounds = {minX:Math.floor(dirty.minX),minY:Math.floor(dirty.minY),maxX:Math.ceil(dirty.maxX),maxY:Math.ceil(dirty.maxY)}
    const secondary = independent ? undefined : behavior.dual?.brush
    const protect=(tip?:TipMaskId,grain?:BrushTextureId,dual?:TipMaskId,dualGrain?:BrushTextureId,grid?:boolean,dualGrid?:boolean,gray?:string,dualGray?:string,mainImage?:NativeImageResource,dualImage?:NativeImageResource):void=>this.protectTextures([
      'g:cloud','g:grit',
      ...(tip && (!brush.tip.imageSampling || mainImage) ? [brushTextureResourceKey({...brushTipResource(tip,gray,brush.tip),nativeImage:mainImage})] : []),
      ...(dual && (!secondary?.tip.imageSampling || dualImage) ? [brushTextureResourceKey({...brushTipResource(dual,dualGray,secondary?.tip),nativeImage:dualImage})] : []),
      ...(grain ? [brushTextureResourceKey({id:grain,grain:true,discrete:grid?true:undefined})] : []),
      ...(dualGrain ? [brushTextureResourceKey({id:dualGrain,grain:true,discrete:dualGrid?true:undefined})] : []),
    ])
    const integerImages = !!brush.tip.imageSampling || !!secondary?.tip.imageSampling
    const animated = !!brush.tip.animation || !!secondary?.tip.animation || integerImages
    protect(stamps[0]?.mask ?? brush.tip.mask,brush.texture?.id,stamps[0]?.dualMask ?? secondary?.tip.mask,secondary?.texture?.id,!!brush.texture?.application,!!secondary?.texture?.application,stamps[0]?.gray ?? brush.tip.material?.gray,stamps[0]?.dualGray ?? secondary?.tip.material?.gray)
    const procedural = brush.tip.kind === 'procedural' || secondary?.tip.kind === 'procedural' || integerImages
    const selected = circleBand ? this.circleProgram() : this.stampFor(procedural, integerImages)
    const mainView = !animated && brush.tip.mask ? this.tipView(brush.tip.mask,brush.tip.material?.gray,brush.tip) : {texture:paper.texture,mode:0}
    const mask=mainView.texture
    const texture = brush.texture ? this.grain(brush.texture.id,!!brush.texture.application) : paper.texture
    const dualView = !animated && secondary?.tip.mask ? this.tipView(secondary.tip.mask,secondary.tip.material?.gray,secondary.tip) : {texture:paper.texture,mode:0}
    const dualMask=dualView.texture
    const dualTexture = secondary?.texture ? this.grain(secondary.texture.id,!!secondary.texture.application) : paper.texture
    const dualPeriod = Math.max(0.5, secondary?.texture?.periodPx ?? 1)
    const g = behavior.grain
    const period = Math.max(0.5, (brush.texture?.periodPx ?? 1) * (g ? 0.1 + g.zoom * 1.9 : 1))
    const wrap = (v: number): number => ((v % period) + period) % period
    for (const tile of target.resolveForPaint(bounds)) {
      const original = scratch.getOrCreate(tile.buffer).original
      let coverage = scratch.getOrCreate(tile.buffer).coverage
      let ceiling = scratch.brushCeiling(tile.buffer)
      coverage.beginDraw()
      gl.useProgram(selected.program)
      const u = selected.uniforms
      const primaryApplication=brushTextureApplication(brush.texture,state.seed,tile.originX,tile.originY)
      const secondaryApplication=brushTextureApplication(secondary?.texture,state.seed,tile.originX,tile.originY,1)
      gl.uniform4f(u.u_textureApplication,...primaryApplication.application);gl.uniform4f(u.u_textureMapping,...primaryApplication.mapping)
      gl.uniform4f(u.u_dualTextureApplication,...secondaryApplication.application);gl.uniform4f(u.u_dualTextureMapping,...secondaryApplication.mapping)
      gl.uniform2f(u.u_resolution, coverage.width, coverage.height)
      const world = paper.worldSize()
      gl.uniform2f(u.u_paperTexSize, world.w, world.h)
      gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
      gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
      for (const [unit, tex, name] of [[0, paper.texture, 'u_paperHeightMap'], [1, animated ? paper.texture : mask, 'u_tip'], [2, texture, 'u_texture'], [3, animated ? paper.texture : dualMask, 'u_dual'], [4, dualTexture, 'u_dualTexture'], [5, paper.texture, 'u_previousCeiling']] as const) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(u[name], unit)
      }
      const threshold=brush.tip.alphaThreshold, dualThreshold=secondary?.tip.alphaThreshold
      gl.uniform3f(u.u_alphaThreshold,threshold?.value ?? 0,threshold?.softness ?? 0,threshold ? 1 : 0)
      gl.uniform3f(u.u_dualAlphaThreshold,dualThreshold?.value ?? 0,dualThreshold?.softness ?? 0,dualThreshold ? 1 : 0)
      const tipBounds=brush.tip.maskBounds, dualBounds=secondary?.tip.maskBounds
      gl.uniform4f(u.u_tipBounds,tipBounds?.x ?? 0,tipBounds?.y ?? 0,tipBounds?.width ?? 1,tipBounds?.height ?? 1)
      gl.uniform4f(u.u_dualBounds,dualBounds?.x ?? 0,dualBounds?.y ?? 0,dualBounds?.width ?? 1,dualBounds?.height ?? 1)
      gl.uniform1f(u.u_tipPacking,mainView.mode);gl.uniform1f(u.u_dualTipPacking,dualView.mode)
      gl.uniform1f(u.u_lightnessMaterial,brush.tip.material ? 1 : 0)
      gl.uniform1f(u.u_lightnessStrength,brush.tip.material?.strength ?? 1)
      gl.uniform1f(u.u_dualLightnessMaterial,secondary?.tip.material ? 1 : 0)
      gl.uniform1f(u.u_tipKind, brush.tip.profile ? 2 : brush.tip.kind === 'bitmap' ? 1 : 0)
      gl.uniform2f(u.u_tipProfile,brush.tip.profile?.kind === 'gaussian' ? brush.tip.profile.fade : .5,brush.tip.profile?.antialias ? 1 : 0)
      gl.uniform2f(u.u_dualProfile,secondary?.tip.profile?.kind === 'gaussian' ? secondary.tip.profile.fade : .5,secondary?.tip.profile?.antialias ? 1 : 0)
      gl.uniform1f(u.u_wickCap,4)
      if (procedural && !circleBand) {
        gl.uniform4f(u.u_tipProcedural, ...proceduralProfileUniforms(brush.tip.profile))
        gl.uniform4f(u.u_dualProcedural, ...proceduralProfileUniforms(secondary?.tip.profile))
      }
      gl.uniform1f(u.u_wickPx,brush.tip.profile || secondary?.tip.profile ? 1 : 0)
      gl.uniform1f(u.u_hardness, brush.tip.hardness)
      gl.uniform1f(u.u_aaPx, 1)
      gl.uniform1f(u.u_paper, brush.paperInteraction)
      gl.uniform1f(u.u_texPeriod, period)
      gl.uniform2f(u.u_texOrigin, wrap(tile.originX), wrap(tile.originY))
      gl.uniform2f(u.u_grainTone, g?.brightness ?? 0, g?.contrast ?? 0)
      gl.uniform1f(u.u_grainBlend, g ? blend(g.blendMode) : 1)
      gl.uniform1f(u.u_dualHardness, secondary?.tip.hardness ?? 0.7)
      gl.uniform1f(u.u_dualTexPeriod, dualPeriod)
      gl.uniform1f(u.u_dualTexStrength, secondary?.texture?.strength ?? 0)
      gl.uniform2f(u.u_dualTexOrigin, ((tile.originX % dualPeriod) + dualPeriod) % dualPeriod, ((tile.originY % dualPeriod) + dualPeriod) % dualPeriod)
      gl.uniform1f(u.u_dualKind, secondary ? secondary.tip.profile ? 3 : secondary.tip.kind === 'bitmap' ? 2 : 1 : 0)
      gl.uniform1f(u.u_dualBlend, blend(behavior.dual?.blendMode))
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
      gl.enableVertexAttribArray(selected.position)
      gl.vertexAttribPointer(selected.position, 2, gl.FLOAT, false, 0, 0)
      const drawStamps = (list: BehaviorPlaced[], ceilingPass: boolean, fallback = false, beforeStamp?: (stamp:BehaviorPlaced)=>void): void => {
        gl.uniform1f(u.u_ceilingFallback, fallback ? 1 : 0)
        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, animated ? paper.texture : dualMask)
        gl.activeTexture(gl.TEXTURE4)
        gl.bindTexture(gl.TEXTURE_2D, dualTexture)
        gl.uniform1f(u.u_ceilingPass, ceilingPass ? 1 : 0)
        gl.uniform1f(u.u_uniformCeiling, behavior.rendering?.opacityCeiling==='uniform' ? 1 : 0)
        let lastFlow:number|undefined, lastAverage:number|undefined
        let lastMode=accumulation==='directOver' ? 4 : accumulation==='over' ? 1 : 0
        gl.uniform1f(u.u_washMode,lastMode)
        if(accumulation)gl.uniform1f(u.u_opacity,1)
        for (const s of list) {
          if(animated) {
            const currentMask=s.mask ?? brush.tip.mask, currentDual=s.dualMask ?? secondary?.tip.mask
            const imageRatio = secondary ? Math.max(0.01, curveAt(secondary.sizeByPressure, s.pressure) / Math.max(0.01, curveAt(brush.sizeByPressure, s.pressure)) * (secondary.scatter?.scale ?? 1)) : 1
            const mainImage = currentMask && brush.tip.imageSampling ? nativeImageResource(currentMask, brush.tip, 2 * s.radius * s.aspect) : undefined
            const childRadiusX = s.radius * s.aspect * imageRatio / (1 + s.edgeSoftness * .15)
            const dualImage = currentDual && secondary?.tip.imageSampling ? nativeImageResource(currentDual, secondary.tip, 2 * childRadiusX) : undefined
            protect(currentMask,brush.texture?.id,currentDual,secondary?.texture?.id,!!brush.texture?.application,!!secondary?.texture?.application,s.gray ?? brush.tip.material?.gray,s.dualGray ?? secondary?.tip.material?.gray,mainImage,dualImage)
            // Resolve the whole group before binding. Lazy upload restores GL
            // state and cannot evict another sampler in this protected group.
            const mainView=currentMask ? this.tipView(currentMask,s.gray ?? brush.tip.material?.gray,brush.tip,mainImage) : {texture:paper.texture,mode:0}
            const mainTexture=mainView.texture
            const secondView=currentDual ? this.tipView(currentDual,s.dualGray ?? secondary?.tip.material?.gray,secondary?.tip,dualImage) : {texture:paper.texture,mode:0}
            const secondTexture=secondView.texture
            gl.uniform1f(u.u_tipPacking,mainView.mode);gl.uniform1f(u.u_dualTipPacking,secondView.mode)
            gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mainTexture)
            gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,secondTexture)
            if (integerImages) {
              const mainBounds = mainImage?.bounds ?? brush.tip.maskBounds
              const childBounds = dualImage?.bounds ?? secondary?.tip.maskBounds
              gl.uniform4f(u.u_tipBounds, mainBounds?.x ?? 0, mainBounds?.y ?? 0, mainBounds?.width ?? 1, mainBounds?.height ?? 1)
              gl.uniform4f(u.u_dualBounds, childBounds?.x ?? 0, childBounds?.y ?? 0, childBounds?.width ?? 1, childBounds?.height ?? 1)
              gl.uniform1f(u.u_tipImageEnabled, mainImage ? 1 : 0)
              gl.uniform1f(u.u_dualImageEnabled, dualImage ? 1 : 0)
              const tipShift = mainImage ? nativeImageUVShift(mainImage, s.radius*s.aspect, s.radius, s.angle, s.flipX, s.flipY) : [0,0] as const
              gl.uniform2f(u.u_tipImageUVShift, tipShift[0], tipShift[1])
              gl.uniform2f(u.u_dualImageUVShift, 0, 0)
              if (mainImage) gl.uniform4f(u.u_tipImageDomain, ...nativeImageDomainUniform(nativeImageDomain(brush.tip,s.x,s.y,s.radius*s.aspect,s.radius,s.angle), tile.originX,tile.originY,coverage.height))
              if (dualImage && secondary) {
                const childAngle = secondary.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle
                gl.uniform2f(u.u_dualImageUVShift, ...nativeImageUVShift(dualImage, childRadiusX, childRadiusX/secondary.tip.aspect, childAngle))
                gl.uniform4f(u.u_dualImageDomain, ...nativeImageDomainUniform(nativeImageDomain(secondary.tip,s.x,s.y,childRadiusX,childRadiusX/secondary.tip.aspect,childAngle), tile.originX,tile.originY,coverage.height))
              }
            }
          }
          const footprint=brushFootprintBounds(s.x,s.y,s.radius,s.aspect,s.angle,1)
          if(!footprint || footprint.maxX<tile.originX || footprint.maxY<tile.originY || footprint.minX>tile.originX+coverage.width || footprint.minY>tile.originY+coverage.height) continue
          beforeStamp?.(s)
          if (circleBand) {
            const difference = circleClips.get(s)
            gl.uniform2f(u.u_dabCenter, s.x - tile.originX, s.y - tile.originY)
            gl.uniform1f(u.u_dabRadius, s.radius)
            gl.uniform1f(u.u_angle, 0)
            gl.uniform1f(u.u_aspectRatio, 1)
            gl.uniform1f(u.u_wickPx, 1)
            gl.uniform1f(u.u_wickCap, Math.max(4, 1 / s.radius))
            gl.uniform3fv(u.u_color, s.color)
            gl.uniform1f(u.u_circleClipped, difference?.clips.length ? 1 : 0)
            const planes = difference?.clips.flat() ?? []
            for (let i = 0; i < 4; i++) {
              const plane = planes[i]
              if (!plane) { gl.uniform3f(u[`u_circleClip${i}`], 0, 0, 0); continue }
              const [a, b] = plane, dx = b.x - a.x, dy = b.y - a.y
              // Local displacement keeps the plane stable across tile origins.
              gl.uniform3f(u[`u_circleClip${i}`], -dy, dx, dx * (s.y - a.y) - dy * (s.x - a.x))
            }
            gl.drawArrays(gl.TRIANGLES, 0, 6)
            continue
          }
          gl.uniform2f(u.u_dabCenter, s.x - tile.originX, s.y - tile.originY)
          gl.uniform2f(u.u_grainTone,g?.brightness??0,clamp((g?.contrast??0)+s.wetGrade,-1,1))
          gl.uniform1f(u.u_edgeBleed, s.edgeSoftness)
          gl.uniform1f(u.u_dabRadius, s.radius)
          gl.uniform1f(u.u_angle, s.angle)
          gl.uniform1f(u.u_aspectRatio, s.aspect)
          const ratio = secondary ? Math.max(0.01, curveAt(secondary.sizeByPressure, s.pressure) / Math.max(0.01, curveAt(brush.sizeByPressure, s.pressure)) * (secondary.scatter?.scale ?? 1)) : 1
          if(brush.tip.profile || secondary?.tip.profile) {
            const radius=Math.fround(s.radius),aspect=Math.fround(s.aspect)
            const mainRadius=Math.fround(radius*aspect)
            const childRadius=Math.fround(mainRadius*ratio/(1+s.edgeSoftness*.15))
            const childAspect=(secondary?.tip.aspect ?? 1)/brush.tip.aspect*aspect
            gl.uniform4f(u.u_gaussianGeometry,mainRadius,gaussianSampleCount(2*mainRadius/Math.max(1,aspect),!!brush.tip.profile?.antialias),
              childRadius,gaussianSampleCount(2*childRadius/Math.max(1,childAspect),!!secondary?.tip.profile?.antialias))
          }
          if (procedural) {
            const mainRx = Math.fround(Math.fround(s.radius) * Math.fround(s.aspect))
            const mainRy = Math.fround(s.radius)
            const childRx = Math.fround(mainRx * ratio / (1 + s.edgeSoftness * .15))
            const childRy = Math.fround(childRx / (secondary?.tip.aspect ?? 1))
            const standard = brush.tip.profile?.kind === 'standard' || !!brush.tip.imageSampling
            // A child profile does not expand a legacy parent's clipping quad.
            const wick = standard ? Math.SQRT2 / Math.min(1, s.aspect)
              : brush.tip.profile || secondary?.tip.profile?.kind === 'gaussian' ? 1 : 0
            gl.uniform1f(u.u_wickPx, wick)
            gl.uniform1f(u.u_wickCap, Math.max(4, wick / Math.max(s.radius, .0001)))
            gl.uniform4f(u.u_tipProceduralGeometry, mainRx, mainRy, proceduralSampleCount(2 * Math.min(mainRx, mainRy), !!brush.tip.profile?.antialias), 0)
            gl.uniform4f(u.u_dualProceduralGeometry, childRx, childRy, proceduralSampleCount(2 * Math.min(childRx, childRy), !!secondary?.tip.profile?.antialias), 0)
            gl.uniform1f(u.u_dualProceduralAngle, secondary?.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle)
          }
          const dualAngle = (secondary?.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle) - s.angle
          gl.uniform4f(u.u_dualTransform, (1+s.edgeSoftness*.15) / ratio, (1+s.edgeSoftness*.15)*(secondary?.tip.aspect ?? 1) / brush.tip.aspect / ratio, Math.cos(dualAngle), Math.sin(dualAngle))
          gl.uniform1f(u.u_dualStrength, secondary ? secondary.flow * curveAt(secondary.flowByPressure, s.pressure) * curveAt(secondary.opacityByPressure, s.pressure) : 1)
          const flowValue=clamp(s.flow)
          if(lastFlow!==flowValue){gl.uniform1f(accumulation?u.u_washFlow:u.u_opacity,flowValue);lastFlow=flowValue}
          if(accumulation==='alphaDarken'){
            const average=s.washAverage??0, mode=s.washFeedback?2:3
            if(lastAverage!==average){gl.uniform1f(u.u_washAverage,average);lastAverage=average}
            if(lastMode!==mode){gl.uniform1f(u.u_washMode,mode);lastMode=mode}
          }
          gl.uniform1f(u.u_ceiling, s.ceiling)
          gl.uniform1f(u.u_paperPressure, s.pressure)
          gl.uniform3fv(u.u_color, s.color)
          gl.uniform2f(u.u_flip, s.flipX, s.flipY)
          const jitter = g?.offsetJitter ? brushDabRandom(state.seed, 42) * period : 0
          const moving = g?.mode === 'moving' ? 1 - g.movement : 0
          const rotation = (g?.rotation ?? 0) * Math.PI
          // Rotate the full world origin before reducing modulo the grain period.
          // Reducing first would create a phase seam at every tile for arbitrary angles.
          const cos = Math.cos(rotation), sin = Math.sin(rotation)
          const ox = tile.originX - s.x * moving + jitter, oy = tile.originY - s.y * moving + jitter
          gl.uniform4f(u.u_grainTransform, wrap(cos * ox + sin * oy), wrap(-sin * ox + cos * oy), cos, sin)
          const depth = (brush.texture?.strength ?? 0) * s.grainDepth
          gl.uniform1f(u.u_texStrength, g ? clamp(Math.max(g.depthMinimum, depth) * (1 - g.depthJitter * brushDabRandom(state.seed, 43))) : depth)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
      }
      const drawCeilings = (list: BehaviorPlaced[]): void => {
        if (this.minmax) {
          ceiling.beginMaxDraw(this.minmax)
          drawStamps(list, true)
          ceiling.endDraw()
          return
        }
        const copy = scratch.brushCeilingCopy(tile.buffer)
        for (const item of list) {
          const rect = brushFootprintCopyRect(item.x, item.y, item.radius, item.aspect, item.angle, tile.originX, tile.originY, ceiling.width, ceiling.height)
          if (!rect) continue
          gl.activeTexture(gl.TEXTURE7)
          // Only this quad samples previous ceiling. Keep tile-sized storage
          // and identical offsets so the shader's gl_FragCoord UV is unchanged.
          ceiling.copyRegionInto(copy, rect.x, rect.y, rect.x, rect.y, rect.width, rect.height)
          ceiling.beginReplaceDraw()
          gl.activeTexture(gl.TEXTURE5)
          gl.bindTexture(gl.TEXTURE_2D, copy.texture)
          drawStamps([item], true, true)
          ceiling.endDraw()
        }
        gl.activeTexture(gl.TEXTURE5)
        gl.bindTexture(gl.TEXTURE_2D, paper.texture)
      }
      const drawPhysical=(list:BehaviorPlaced[]):void=>{
        const copy=circleBand || accumulation==='alphaDarken' && list.some(s=>s.washFeedback) ? ceiling : undefined
        let fastBound=false, lastAverage:number|undefined
        // Preserve one uninterrupted render pass for ordinary OVER and rising
        // constant-pigment Wash. Max-alpha always samples its previous stroke
        // pixel; Wash needs feedback only on its explicitly selected dabs.
        drawStamps(list,false,false,item=>{
          if((circleBand || item.washFeedback) && copy){
            const rect=brushFootprintCopyRect(item.x,item.y,item.radius,item.aspect,item.angle,tile.originX,tile.originY,coverage.width,coverage.height)
            if(!rect)return
            gl.activeTexture(gl.TEXTURE7)
            coverage.copyRegionInto(copy,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
            coverage.beginReplaceDraw()
            gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,copy.texture)
            fastBound=false
          }else{
            if(!fastBound){
              coverage.beginDraw()
              if(accumulation==='alphaDarken')gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE_MINUS_SRC_ALPHA)
              fastBound=true
            }
            if(accumulation==='alphaDarken' && lastAverage!==item.washAverage){
              gl.blendColor(0,0,0,item.washAverage??0);lastAverage=item.washAverage
            }
          }
        })
        coverage.endDraw()
        if (!circleBand) gl.blendColor(0,0,0,0)
        gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,paper.texture)
      }
      if(accumulation)drawPhysical(tail.ready)
      else {drawStamps(tail.ready,false);coverage.endDraw();drawCeilings(tail.ready)}
      if (tail.preview.length) {
        const preview = scratch.brushPreview(tile.buffer)
        gl.activeTexture(gl.TEXTURE7)
        // The composite only reads dirty pixels, plus bounded neighbor taps
        // for Burnt Edges/feather. Never sample pooled pixels outside this copy.
        const rect=boundsCopyRect(bounds,tile,edge+2)
        if(!rect)continue
        coverage.copyRegionInto(preview.coverage,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
        ceiling.copyRegionInto(preview.ceiling,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
        coverage = preview.coverage
        ceiling = preview.ceiling
        coverage.beginDraw()
        if(accumulation)drawPhysical(tail.preview)
        else {drawStamps(tail.preview,false);coverage.endDraw();drawCeilings(tail.preview)}
      }
      tile.buffer.beginReplaceDraw()
      gl.useProgram(this.composite)
      const c = this.cu, render = behavior.rendering
      gl.uniform2f(c.u_resolution, tile.buffer.width, tile.buffer.height)
      for (const [unit, tex, name] of [[0, original.texture, 'u_original'], [1, coverage.texture, 'u_strokeCoverage'], [2, ceiling.texture, 'u_ceiling']] as const) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(c[name], unit)
      }
      gl.uniform1f(c.u_opacity, accumulation==='directOver' ? 1 : state.opacity)
      gl.uniform1f(c.u_physicalAccumulation,accumulation?1:0)
      gl.uniform1f(c.u_mode, render ? modes.indexOf(render.mode) : 6)
      gl.uniform1f(c.u_blend, blend(render?.blendMode))
      gl.uniform1f(c.u_burntEdge, render?.burntEdges ?? 0)
      gl.uniform1f(c.u_burntBlend, blend(render?.burntEdgesMode))
      gl.uniform1f(c.u_edgePx, edge)
      gl.uniform1f(c.u_luminance, render?.luminance ? 1 : 0)
      gl.uniform1f(c.u_gammaCorrect, render?.gammaCorrect ? 1 : 0)
      gl.activeTexture(gl.TEXTURE6)
      gl.bindTexture(gl.TEXTURE_2D,secondaryState ? secondaryState.tile(tile.buffer).texture : paper.texture)
      gl.uniform1i(c.u_secondaryCoverage,6)
      gl.uniform1f(c.u_secondaryMode,blend(behavior.dual?.blendMode))
      gl.uniform1f(c.u_secondaryEnabled,secondaryState?1:0)
      const wet=brush.wet
      const wrapSurface=(v:number,p:number):number=>((v%p)+p)%p
      gl.uniform4f(c.u_surface,wet?.granulation??0,wet?.mottle??0,wet?.bloom??0,wet?.feather??0)
      gl.uniform4f(c.u_surfaceOrigin,wrapSurface(tile.originX,640),wrapSurface(tile.originY,640),wrapSurface(tile.originX,224),wrapSurface(tile.originY,224))
      for(const [unit,id,name] of [[3,'cloud','u_surfaceCloud'],[4,'grit','u_surfaceGrain']] as const){
        gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.grain(id));gl.uniform1i(c[name],unit)
      }
      gl.uniform1f(c.u_screentone,brush.screentonePx??0)
      gl.uniform1f(c.u_erase,behavior.erase?1:0)
      const screenPeriod=(brush.screentonePx??0)*2
      gl.uniform2f(c.u_screenOrigin,screenPeriod?wrapSurface(tile.originX,screenPeriod):0,screenPeriod?wrapSurface(tile.originY,screenPeriod):0)


      const cx = (bounds.minX + bounds.maxX) * 0.5, cy = (bounds.minY + bounds.maxY) * 0.5
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
      gl.enableVertexAttribArray(this.cp)
      gl.vertexAttribPointer(this.cp, 2, gl.FLOAT, false, 0, 0)
      gl.uniform2f(c.u_dabCenter, cx - tile.originX, cy - tile.originY)
      // Tight axis-aligned quad: partial preview storage is valid only in
      // bounds (+ sampling halo). The former enclosing square wrote outside it.
      const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY
      gl.uniform1f(c.u_dabRadius, height*0.5)
      gl.uniform1f(c.u_angle, 0)
      gl.uniform1f(c.u_aspectRatio, width/height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      tile.buffer.endDraw()
    }
    target.markContentPainted(bounds)
    } finally { releaseTextures() }
  }
}
