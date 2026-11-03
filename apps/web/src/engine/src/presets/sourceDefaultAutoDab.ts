import {sourceAutoCoverageScale} from './sourceAutoCoverageScale'
import { CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE } from '@grafetto/shared'
import { createSourceDefaultAutoDensityRandom, type SourceDefaultAutoDensityIdentity } from './sourceDefaultAutoDensitySeed'
import type { SourceCoverageEvaluator } from './sourceCoverageEvaluator'
import { sourceAutoGeometry, type SourceAutoGeometry, type SourceAutoGeometryShape } from './sourceAutoGeometry'
import { prepareSourceDefaultAutoMask, type SourceDefaultAutoMaskRequest, type SourceDefaultAutoMaskTip } from './sourceDefaultAutoMaskReference'

/** Closed default-auto profile, independent of image/CAS materials and PNG. */
export interface SourceDefaultAutoDabRequest {
  readonly coverageScaleFactor?:number
  readonly dialect: 'krita-default-auto-qt5-arm64-v1'
  readonly softness?:number
  readonly tip: SourceDefaultAutoMaskTip
  readonly storedScale: number
  readonly storedAngle: number
  readonly shape: SourceAutoGeometryShape
  readonly subpixelX: number
  readonly subpixelY: number
  /** Explicit requested arithmetic route; native tiny-size scalar fallback applies. */
  readonly coverageProfile: SourceDefaultAutoMaskRequest['profile']
  /** Caller reservation, capped to1M A8 bytes and4096 per side before allocation. */
  readonly maxPixels: number
  readonly maxWorkSamples: number
}
export interface SourceDefaultAutoDab {
  readonly dialect: SourceDefaultAutoDabRequest['dialect']
  readonly geometry: SourceAutoGeometry
  readonly center: readonly [number, number]
  readonly generatorScale: readonly [number, number]
  readonly coverageAngle: number
  readonly requestedProfile: SourceDefaultAutoMaskRequest['profile']
  readonly route: 'scalar' | 'neon64-vector' | 'browser-number'
  readonly samplesPerPixel: 1 | 9 | 36
  /** Fresh caller-owned A8 plane, row0 corresponds to native local y0.
   * Coverage only: neither ink alpha nor destination/color composition. */
  readonly mask: Uint8Array
}
/** Synchronous bounded CPU fallback. No cache, global state or quota ownership.
 * Math.sin/cos identity is proven only for retained native fixture inputs. */
export function prepareSourceDefaultAutoDab(request: SourceDefaultAutoDabRequest) {
  const { tip, shape } = request
  if (request.dialect !== 'krita-default-auto-qt5-arm64-v1'
    || tip.kind !== 'auto' || tip.generator !== 'default' || !['circle', 'rect'].includes(tip.shape)
    || (!Number.isSafeInteger(tip.spikes)||tip.spikes<2||tip.spikes>64) || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || typeof tip.antialias !== 'boolean'
    || !['scalar-f64-fma-v1', 'neon64-f32-fma-v1', 'browser-number-coverage-v1'].includes(request.coverageProfile)
    || ![tip.diameter, tip.ratio, tip.horizontalFade, tip.verticalFade, request.storedScale, request.storedAngle,
      shape.scale, shape.ratio, shape.rotation, request.subpixelX, request.subpixelY].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || request.storedScale < 0 || shape.scale <= 0 || shape.ratio <= 0
    || tip.horizontalFade < 0 || tip.horizontalFade > 1 || tip.verticalFade < 0 || tip.verticalFade > 1
    || request.subpixelX < 0 || request.subpixelX >= 1 || request.subpixelY < 0 || request.subpixelY >= 1
    || !Number.isSafeInteger(request.maxPixels) || request.maxPixels <= 0 || request.maxPixels > 1024 * 1024
    || !Number.isSafeInteger(request.maxWorkSamples) || request.maxWorkSamples <= 0 || request.maxWorkSamples > 16 * 1024 * 1024) {
    throw new RangeError('Unsupported source default auto dab')
  }
  const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
    diameter: tip.diameter, ratio: tip.ratio, spikes: tip.spikes, scale: request.storedScale, angle: request.storedAngle },
  shape, request.subpixelX, request.subpixelY)
  const [width, height] = geometry.maskSize
  // Geometry is allocation-free. Reject both fixed bounds and caller reservation
  // before the mask evaluator can construct its Uint8Array.
  if (width > 4096 || height > 4096 || width * height > request.maxPixels) throw new RangeError('Default auto dab exceeds reserved window')
  const center = [geometry.hotSpot[0] - .5 + request.subpixelX, geometry.hotSpot[1] - .5 + request.subpixelY] as const
  const coverageScaleFactor=sourceAutoCoverageScale(request.coverageScaleFactor,request.coverageProfile)
  const generatorScale = [shape.scale*coverageScaleFactor, shape.scale * shape.ratio*coverageScaleFactor] as const
  const coverageAngle = shape.rotation + request.storedAngle
  const evaluator = prepareSourceDefaultAutoMask({ tip,softness:request.softness, profile: request.coverageProfile,
    scaleX: generatorScale[0], scaleY: generatorScale[1], cos: Math.cos(coverageAngle), sin: Math.sin(coverageAngle),
    centerX: center[0], centerY: center[1], width, height,
    maxPixels: request.maxPixels, maxWorkSamples: request.maxWorkSamples })
  return { dialect: request.dialect, geometry, center, generatorScale, coverageAngle,
    requestedProfile: request.coverageProfile, evaluator }
}


/** Off-path convenience wrapper over the same incremental arithmetic cursor. */
export function sourceDefaultAutoDab(request: SourceDefaultAutoDabRequest): SourceDefaultAutoDab {
  const { evaluator, ...metadata } = prepareSourceDefaultAutoDab(request)
  const mask = new Uint8Array(evaluator.pixels)
  while (!evaluator.done) evaluator.advance(mask, evaluator.completedPixels, 65536)
  return { ...metadata, mask, route: evaluator.route, samplesPerPixel: evaluator.samplesPerPixel }
}

/** Opt-in scalar density stage over an already quantized, exclusively borrowed
 * A8 plane. Not admitted by the default-auto descriptor/profile. The caller owns
 * the sampler state and must not mutate this plane until the cursor finishes.
 * Native applicator RNG is separate from the stroke option RNG; this API makes
 * no claim of reproducing its seed or random realization. No allocation/cache. */
export function prepareSourceDefaultAutoDensity(mask: Uint8Array, density: number, sample: () => number) {
  if (!(mask instanceof Uint8Array) || mask.length > 1024 * 1024
    || !Number.isFinite(density) || density < 0 || density > 1 || typeof sample !== 'function') {
    throw new RangeError('Invalid default auto density plane')
  }
  let completedPixels = 0
  let failed = false
  let busy = false
  let failure: unknown
  return {
    get completedPixels() { return completedPixels },
    get done() { return completedPixels === mask.length && !failed },
    advance(maxPixels: number): boolean {
      if (failed) throw failure
      if (busy) throw new Error('Density cursor is already advancing')
      if (!Number.isSafeInteger(maxPixels) || maxPixels <= 0) throw new RangeError('Invalid density work bound')
      const end = completedPixels + Math.min(maxPixels, mask.length - completedPixels)
      busy = true
      try {
        while (completedPixels < end) {
          if (density !== 1 && mask[completedPixels] !== 0) {
            const value = sample()
            if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Invalid density sample')
            if (!(density >= value)) mask[completedPixels] = 0
          }
          completedPixels++
        }
      } catch (error) {
        failed = true
        failure = error
        throw error
      } finally {
        busy = false
      }
      return completedPixels === mask.length
    },
  }
}

/** New explicit behavior profile. Source pin retains original density; the base
 * evaluator computes coverage only and the same borrowed stripe is then thinned. */
export function prepareSourceSeededDefaultAutoDab(request: Omit<SourceDefaultAutoDabRequest,'coverageProfile'|'tip'> & {
  readonly tip: Omit<SourceDefaultAutoMaskTip,'density'> & {readonly density:number}
  readonly coverageProfile: typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
}, identity: SourceDefaultAutoDensityIdentity) {
  if(request.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||!Number.isFinite(request.tip.density)||request.tip.density<0||request.tip.density>1)
    throw new RangeError('Invalid seeded density request')
  const random=createSourceDefaultAutoDensityRandom(identity)
  const prepared=prepareSourceDefaultAutoDab({...request,coverageProfile:'neon64-f32-fma-v1',tip:{...request.tip,density:1}})
  const base=prepared.evaluator,density=request.tip.density
  if(density===1)return {...prepared,requestedProfile:request.coverageProfile}
  if(base.pixels*(base.samplesPerPixel+1)>request.maxWorkSamples){base.cancel();throw new RangeError('Density work exceeds reserved window')}
  let completed=0,work=0,cancelled=false,busy=false
  let pending:{target:Uint8Array;offset:number;length:number;cursor:ReturnType<typeof prepareSourceDefaultAutoDensity>}|undefined
  const evaluator:SourceCoverageEvaluator={
    pixels:base.pixels,route:base.route,samplesPerPixel:base.samplesPerPixel,
    get completedPixels(){return completed},get workSamples(){return work},get done(){return completed===base.pixels},
    advance(target,offset,maxSamples){
      if(cancelled)throw new Error('Density evaluator cancelled')
      if(busy)throw new Error('Density evaluator is already advancing')
      if(!(target instanceof Uint8Array)||!Number.isSafeInteger(offset)||offset<0||offset>target.length||!Number.isSafeInteger(maxSamples)||maxSamples<=0)
        throw new RangeError('Invalid density continuation range')
      busy=true
      try{
        if(pending){
          if(pending.target!==target||pending.offset!==offset)throw new Error('Density stripe changed during continuation')
          const previous=pending.cursor.completedPixels
          const done=pending.cursor.advance(maxSamples),consumed=pending.cursor.completedPixels-previous
          work+=consumed
          if(!done)return {written:0,consumed,done:false}
          const written=pending.length;pending=undefined;completed+=written
          return {written,consumed,done:completed===base.pixels}
        }
        const result=base.advance(target,offset,maxSamples);work+=result.consumed
        if(result.written)pending={target,offset,length:result.written,cursor:prepareSourceDefaultAutoDensity(target.subarray(offset,offset+result.written),density,()=>random.generateNormalized())}
        return {written:0,consumed:result.consumed,done:completed===base.pixels}
      }catch(error){pending=undefined;cancelled=true;try{base.cancel()}catch{/* Preserve first error. */}throw error}
      finally{busy=false}
    },
    cancel(){pending=undefined;cancelled=true;base.cancel()},
  }
  return {...prepared,requestedProfile:request.coverageProfile,evaluator}
}
