import {sourceAutoCoverageScale} from './sourceAutoCoverageScale'
import {sourceAutoCircleFade,sourceAutoRectTransparency,sourceAutoSampleGrid} from './sourceAutoAntialias'
import {sourceSoftnessCurve} from './sourceSoftnessCurve'
import {sourceAutoSector} from './sourceAutoSector'
import { sourceAutoGeometry, type SourceAutoGeometryShape } from './sourceAutoGeometry'
import { sourceCoverageEvaluator } from './sourceCoverageEvaluator'
import { prepareSourceCurveTransfer,sourceCurveTransfer, type SourceCurvePolynomial } from './sourceCurve'
import { sourceFmaF64 as fma64 } from './sourceFmaF64'
import { sourceFmaF32 as fma32 } from './sourceFmaF32'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'

export interface SourceSoftCircleTip {
  readonly kind: 'auto'; readonly generator: 'soft'; readonly shape: 'circle'|'rect'
  readonly diameter: number; readonly ratio: number; readonly horizontalFade: number; readonly verticalFade: number
  readonly spikes: number; readonly softness: 1; readonly randomness: 0; readonly density: 1; readonly antialias: boolean
}
export interface SourceSoftCircleProgram {
  readonly tip: SourceSoftCircleTip
  /** Explicit supplied native SparseLU polynomial; no portable point solver. */
  readonly curve: SourceCurvePolynomial
  readonly resolution: number
  readonly table: readonly number[]
}
const ownedPrograms = new WeakSet<SourceSoftCircleProgram>()
/** Compile the original-resolution table ONCE. This is not raw-points admission
 * or a lookup of static stock tables. Caller supplies authoritative coefficients. */
export function prepareSourceSoftCircleProgram(tip: SourceSoftCircleTip, nativeCurve: SourceCurvePolynomial, maxTableValues: number) {
  if (tip.kind !== 'auto' || tip.generator !== 'soft' || !['circle','rect'].includes(tip.shape)
    || (!Number.isSafeInteger(tip.spikes)||tip.spikes<2||tip.spikes>64) || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || typeof tip.antialias !== 'boolean'
    || ![tip.diameter, tip.ratio, tip.horizontalFade, tip.verticalFade].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || tip.ratio > 1
    || tip.horizontalFade < 0 || tip.horizontalFade > 1 || tip.verticalFade < 0 || tip.verticalFade > 1
    || !Number.isSafeInteger(maxTableValues) || maxTableValues < 2 || maxTableValues > 16384) throw new RangeError('Unsupported source soft-circle program')
  // In this closed spikes2/ratio<=1 domain original width is the diameter and
  // dominates original height. Physical/request scale never changes this size.
  const resolution = Math.floor(tip.diameter * 4 + .5)
  if (!Number.isSafeInteger(resolution) || resolution + (tip.shape==='rect'?1:2) > maxTableValues) throw new RangeError('Soft-circle table exceeds reserved budget')
  const transfer=prepareSourceCurveTransfer(nativeCurve,{layout:tip.shape==='rect'?'soft-rectangle-mask':'soft-mask',resolution,arithmetic:'installed-arm64-fused-v1'})
  const ownedTip=Object.freeze({...tip}),values:number[]=[],staging=new Float64Array(64)
  let cancelled=false,program:SourceSoftCircleProgram|undefined
  return Object.freeze({
    resolution,tableValues:transfer.size,
    get completedValues(){return transfer.completedValues},
    get done(){return transfer.done},
    advance(maxValues:number) {
      if(cancelled)throw new Error('Soft-circle preparation cancelled')
      if(!Number.isSafeInteger(maxValues)||maxValues<=0)throw new RangeError('Invalid soft-circle preparation budget')
      let written=0
      while(written<maxValues&&!transfer.done) {
        const step=transfer.advance(staging,0,Math.min(64,maxValues-written))
        for(let i=0;i<step.written;i++) {
          if(!Number.isFinite(staging[i]))throw new RangeError('Soft-circle table outside finite domain')
          values.push(staging[i])
        }
        written+=step.written
      }
      return {written,done:transfer.done}
    },
    finish():SourceSoftCircleProgram {
      if(cancelled)throw new Error('Soft-circle preparation cancelled')
      if(!transfer.done)throw new Error('Soft-circle preparation incomplete')
      if(!program) {
        program=Object.freeze({tip:ownedTip,curve:transfer.curve,resolution,table:Object.freeze(values)})
        ownedPrograms.add(program)
      }
      return program
    },
    cancel(){cancelled=true;transfer.cancel();if(!program)values.length=0},
  })
}
/** Synchronous compatibility API drains the SAME bounded preparation body. */
export function compileSourceSoftCircleProgram(tip:SourceSoftCircleTip,nativeCurve:SourceCurvePolynomial,maxTableValues:number):SourceSoftCircleProgram {
  const prepared=prepareSourceSoftCircleProgram(tip,nativeCurve,maxTableValues)
  prepared.advance(prepared.tableValues)
  return prepared.finish()
}

export interface SourceSoftCircleDabRequest {
  readonly coverageScaleFactor?:number
  readonly softness?:number
  readonly sourceCurvePoints?:readonly {x:number;y:number;corner?:boolean}[]
  readonly dialect: 'krita-soft-circle-qt5-arm64-v1'
  readonly program: SourceSoftCircleProgram
  readonly storedScale: number; readonly storedAngle: number; readonly shape: SourceAutoGeometryShape
  readonly subpixelX: number; readonly subpixelY: number
  readonly coverageProfile: 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1' | 'browser-number-coverage-v1'
  readonly maxPixels: number; readonly maxWorkSamples: number
}
const f = Math.fround
/** One bounded CPU coverage body for scalar/NEON, reused by the whole-dab API.
 * OFF from author/importer/renderer/wire. AA and nonunit softness are not admitted. */
export function prepareSourceSoftCircleDab(request: SourceSoftCircleDabRequest) {
  const { program, shape } = request
  if (request.dialect !== 'krita-soft-circle-qt5-arm64-v1' || !ownedPrograms.has(program)
    || !['scalar-f64-fma-v1', 'neon64-f32-fma-v1', 'browser-number-coverage-v1'].includes(request.coverageProfile)
    || ![request.storedScale, request.storedAngle, shape.scale, shape.ratio, shape.rotation, request.subpixelX, request.subpixelY].every(Number.isFinite)
    || request.storedScale < 0 || shape.scale <= 0 || shape.ratio <= 0
    || request.subpixelX < 0 || request.subpixelX >= 1 || request.subpixelY < 0 || request.subpixelY >= 1
    || !Number.isSafeInteger(request.maxPixels) || request.maxPixels <= 0 || request.maxPixels > 1024 * 1024
    || !Number.isSafeInteger(request.maxWorkSamples) || request.maxWorkSamples <= 0 || request.maxWorkSamples > 16 * 1024 * 1024) throw new RangeError('Unsupported source soft-circle dab')
  const tip = program.tip
  if((tip.shape==='rect'||tip.antialias)&&request.coverageProfile!=='browser-number-coverage-v1')throw new RangeError('New Soft shape/AA requires its browser law')
  const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
    diameter: tip.diameter, ratio: tip.ratio, spikes: tip.spikes, scale: request.storedScale, angle: request.storedAngle },
  shape, request.subpixelX, request.subpixelY)
  const [width, height] = geometry.maskSize, pixels = width * height
  if (width > 4096 || height > 4096 || pixels > request.maxPixels || pixels > request.maxWorkSamples) throw new RangeError('Soft-circle dab exceeds reserved window/work')
  const center = [geometry.hotSpot[0] - .5 + request.subpixelX, geometry.hotSpot[1] - .5 + request.subpixelY] as const
  const coverageScaleFactor=sourceAutoCoverageScale(request.coverageScaleFactor,request.coverageProfile)
  const generatorScale = [shape.scale*coverageScaleFactor, shape.scale * shape.ratio*coverageScaleFactor] as const
  const xcoef = 2 / (tip.diameter * generatorScale[0]), ycoef = 2 / ((tip.diameter * tip.ratio) * generatorScale[1])
  const coverageAngle = shape.rotation + request.storedAngle, cos = Math.cos(coverageAngle), sin = Math.sin(coverageAngle)
  const browser=request.coverageProfile==='browser-number-coverage-v1'
  const mulAdd=browser?(a:number,b:number,c:number)=>a*b+c:fma64
  const vector = request.coverageProfile === 'neon64-f32-fma-v1' && tip.spikes===2 && !tip.antialias && tip.shape==='circle'
  const bound = (Math.abs(center[0]) + width + Math.abs(center[1]) + height + 1) * Math.max(xcoef, ycoef)
  if (![xcoef, ycoef, cos, sin, bound].every(Number.isFinite) || xcoef <= 0 || ycoef <= 0
    || bound > 2 ** (vector ? 60 : 400) || (vector && ![xcoef, ycoef].every(v => Number.isFinite(f(v))))) throw new RangeError('Soft-circle intermediates outside finite domain')
  const softness=request.softness??1
  if(!Number.isFinite(softness)||softness<0||softness>1)throw new RangeError('Invalid Softness')
  const resolution=program.resolution,table=softness===1?program.table:sourceCurveTransfer(sourceSoftnessCurve(request.sourceCurvePoints??program.curve.points,softness),{layout:tip.shape==='rect'?'soft-rectangle-mask':'soft-mask',resolution,arithmetic:'installed-arm64-fused-v1'})
  const n=sourceAutoSampleGrid(tip.antialias,tip.diameter*generatorScale[0],tip.diameter*tip.ratio*generatorScale[1]),samplesPerPixel=n*n as 1|9|36
  if(pixels*samplesPerPixel>request.maxWorkSamples)throw new RangeError('Soft shape AA exceeds reserved work')
  if(browser&&(tip.shape==='rect'||tip.antialias)){
    const rawCircle=(distance:number)=>{const scaled=distance*resolution,index=Math.trunc(scaled),fraction=scaled-index,full=(1-fraction)*table[index]+fraction*table[index+1];return Math.trunc((1-full)*255)&255}
    const circle=sourceAutoCircleFade(xcoef,ycoef,rawCircle)
    const rawRect=(x:number,y:number)=>{const ix=Math.floor(Math.abs(x)*xcoef*resolution+.5),iy=Math.floor(Math.abs(y)*ycoef*resolution+.5);if(ix<0||iy<0||ix>resolution||iy>resolution)throw new RangeError('Soft rectangle table index outside original window');const blend=table[ix]*(1-table[resolution-ix])*table[iy]*(1-table[resolution-iy]);return Math.trunc((1-blend)*255)&255}
    function* shapeCoverage():Generator<number|null,void>{for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0;for(let sy=0;sy<n;sy++)for(let sx=0;sx<n;sx++){const px=x+sx/n-center[0],py=y+sy/n-center[1],q=sourceAutoSector(cos*px-sin*py,sin*px+cos*py,tip.spikes);sum+=tip.shape==='rect'?sourceAutoRectTransparency(q[0],q[1],1/xcoef,1/ycoef,tip.antialias,rawRect):circle((q[0]*xcoef)**2+(q[1]*ycoef)**2,tip.antialias);yield sx===n-1&&sy===n-1?255-Math.trunc(sum/samplesPerPixel):null}}}
    return {dialect:request.dialect,geometry,center,generatorScale,coverageAngle,evaluator:sourceCoverageEvaluator({pixels,route:'browser-number',samplesPerPixel,stream:shapeCoverage()})}
  }
  // Numeric copies keep returned metadata mutation from changing a continuation.
  const centerX = center[0], centerY = center[1]
  function* evaluate(): Generator<number | null, void> {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let alpha: number
      if (!vector) {
        const px = x - centerX, py = y - centerY
        const folded=sourceAutoSector(mulAdd(cos, px, -(sin * py)),mulAdd(sin, px, cos * py),tip.spikes)
        const rx=folded[0]*xcoef,ry=folded[1]*ycoef
        const distance = mulAdd(rx, rx, ry * ry)
        if (distance > 1) alpha = 0
        else {
          const scaled = distance * resolution, index = Math.trunc(scaled), fraction = scaled - index
          const full = mulAdd(fraction, table[index + 1], (1 - fraction) * table[index])
          alpha = (255 - Math.trunc((1 - full) * 255)) & 255
        }
      } else {
        const px = f(f(x) - f(centerX)), py = f(f(y) - f(centerY))
        const rx = f(fma32(px, f(cos), -f(f(sin) * py)) * f(xcoef))
        const ry = f(fma32(px, f(sin), f(f(cos) * py)) * f(ycoef))
        const distance = fma32(rx, rx, f(ry * ry))
        if (distance > 1) alpha = 0
        else {
          const scaled = f(distance * f(resolution)), index = Math.trunc(scaled), fraction = f(scaled - f(index))
          const full = Math.max(0, fma32(fraction, f(table[index + 1]), f(f(1 - fraction) * f(table[index]))))
          const fade = full >= 1 ? 0 : f(1 - full), value = f(f(1 - fade) * 255)
          alpha = (x < Math.floor(width / 4) * 4 ? sourceImageRoundEven(value) : Math.trunc(value)) & 255
        }
      }
      yield alpha
    }
  }
  const evaluator = sourceCoverageEvaluator({ pixels, route: browser ? 'browser-number' : vector ? 'neon64-vector' : 'scalar', samplesPerPixel: 1, stream: evaluate() })
  return { dialect: request.dialect, geometry, center, generatorScale, coverageAngle, evaluator }
}

/** Whole-dab convenience path over the same bounded arithmetic stream. */
export function sourceSoftCircleDab(request: SourceSoftCircleDabRequest) {
  const { evaluator, ...metadata } = prepareSourceSoftCircleDab(request)
  const mask = new Uint8Array(evaluator.pixels)
  while (!evaluator.done) evaluator.advance(mask, evaluator.completedPixels, 65536)
  return { ...metadata, route: evaluator.route, samplesPerPixel:evaluator.samplesPerPixel, mask }
}
