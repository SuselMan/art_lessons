import { KritaRandomSource, type KritaRandomSnapshot } from './nativeRandom'
import { sampleSourceSprayDistribution, type SourceSprayDistribution } from './sourceSprayDistribution'

/** Isolated emitter geometry/consumer plan; NOT a pixel or compositing engine.
 * Based on the mathematical contract of Krita bd6e8d0 spray_brush.cpp. Native
 * Qt path coverage, byte HSV/opacity, group transfer and the separate noisy
 * mask applicator source remain outside this helper and must not be skipped.
 */
export interface SourceSprayEmitter {
  readonly diameter: number
  readonly aspect: number
  readonly cloudScale: number
  readonly cloudAngle: number
  readonly count: number
  readonly radial: SourceSprayDistribution
  readonly particle: {
    readonly kind: 'ellipse' | 'brush'
    readonly width: number
    readonly height: number
    readonly randomSize: boolean
    readonly proportional?: boolean
    readonly frameCount?: number
  }
  readonly rotation: {
    readonly fixed?: number
    readonly randomWeight?: number
    readonly polarWeight?: number
    readonly directionWeight?: number
  }
  readonly color: {
    readonly perParticle: boolean
    readonly hsv?: readonly [number, number, number]
    readonly randomOpacity: boolean
  }
}
export interface SourceSprayRequest {
  readonly x: number
  readonly y: number
  readonly sizeScale: number
  readonly lodScale: number
  readonly angle: number
  readonly drawingAngle: number
  readonly foregroundOpacity: number
}
export interface SourceSprayParticle {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly tipScale: number
  readonly width: number
  readonly height: number
  readonly hsv: readonly [number, number, number] | undefined
  readonly inkOpacity: number
  readonly painterOpacity: number
  readonly frame: number | undefined
}
export interface SourceSprayDraw {
  readonly particle: number
  readonly kind: 'angle' | 'radial' | 'rotation' | 'size' | 'hue' | 'saturation' | 'value' | 'opacity' | 'frame'
  readonly value: number
}
function finite(...values: number[]): boolean { return values.every(Number.isFinite) }

/** The caller supplies an explicit admission/work budget. Exceeding it rejects
 * before any draw; never truncate a source particle list to meet a frame cap.
 * Restores an owned sequential source, leaving the incoming DTO unchanged.
 * frameCount means a random GIH pipe; ordinary tips have no frame consumer.
 */
export function planSourceSprayEmitter(
  emitter: SourceSprayEmitter,
  request: SourceSprayRequest,
  snapshot: KritaRandomSnapshot,
  options: { maximumParticles: number; captureDraws?: boolean },
): { particles: SourceSprayParticle[]; random: KritaRandomSnapshot; draws?: SourceSprayDraw[] } {
  const { particle, rotation, color } = emitter
  if (!Number.isInteger(options.maximumParticles) || options.maximumParticles < 0 || options.maximumParticles > 65536
    || !Number.isInteger(emitter.count) || emitter.count < 0 || emitter.count > options.maximumParticles) throw new RangeError('Spray particle budget exceeded')
  if (!finite(emitter.diameter, emitter.aspect, emitter.cloudScale, emitter.cloudAngle, particle.width, particle.height)
    || emitter.diameter < 0 || emitter.aspect < 0 || emitter.cloudScale < 0
    || !Number.isInteger(particle.width) || !Number.isInteger(particle.height) || particle.width <= 0 || particle.height <= 0) throw new RangeError('Invalid spray geometry')
  if (!finite(request.x, request.y, request.sizeScale, request.lodScale, request.angle, request.drawingAngle, request.foregroundOpacity)
    || request.sizeScale < 0 || request.lodScale <= 0 || request.foregroundOpacity < 0 || request.foregroundOpacity > 1) throw new RangeError('Invalid spray request')
  for (const weight of [rotation.randomWeight, rotation.polarWeight, rotation.directionWeight]) {
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || weight > 1)) throw new RangeError('Invalid spray rotation weight')
  }
  if (rotation.fixed !== undefined && !Number.isFinite(rotation.fixed)) throw new RangeError('Invalid spray fixed angle')
  if (color.hsv && (!finite(...color.hsv) || color.hsv.length !== 3)) throw new RangeError('Invalid spray HSV amplitudes')
  if (particle.frameCount !== undefined && (!Number.isInteger(particle.frameCount) || particle.frameCount < 1 || particle.frameCount > 256)) throw new RangeError('Invalid spray frame count')
  const source = KritaRandomSource.restore(snapshot)
  const draws: SourceSprayDraw[] | undefined = options.captureDraws ? [] : undefined
  const draw = (index: number, kind: SourceSprayDraw['kind']): number => {
    const value = kind === 'frame' ? source.generate(0, particle.frameCount! - 1) : source.generateNormalized()
    draws?.push({ particle: index, kind, value })
    return value
  }
  const radius = emitter.diameter / 2 * request.sizeScale * request.lodScale
  const cloudAngle = -request.angle + emitter.cloudAngle
  const cosine = Math.cos(cloudAngle), sine = Math.sin(cloudAngle)
  const dimension = (value: number): number => particle.proportional
    ? Math.floor(value * emitter.diameter * emitter.cloudScale / 100 + .5) : value
  const baseWidth = dimension(particle.width), baseHeight = dimension(particle.height)
  const particles: SourceSprayParticle[] = []
  let hsv: [number, number, number] | undefined
  let inkOpacity = request.foregroundOpacity, painterOpacity = 1
  for (let i = 0; i < emitter.count; i++) {
    const polar = draw(i, 'angle') * Math.PI * 2
    const distance = sampleSourceSprayDistribution(emitter.radial, draw(i, 'radial'))
    let angle = rotation.fixed ?? 0
    if (rotation.randomWeight !== undefined) angle += (Math.PI * 2 * draw(i, 'rotation') - angle) * rotation.randomWeight
    if (rotation.polarWeight !== undefined) angle += (polar - angle) * rotation.polarWeight
    if (rotation.directionWeight !== undefined) angle += (request.drawingAngle - angle) * rotation.directionWeight
    const size = particle.randomSize ? draw(i, 'size') : 1
    const localX = radius * Math.cos(polar) * distance
    const localY = radius * Math.sin(polar) * distance * emitter.aspect
    if (i === 0 || color.perParticle) {
      if (color.hsv) hsv = [color.hsv[0] * draw(i, 'hue'), color.hsv[1] * draw(i, 'saturation'), color.hsv[2] * draw(i, 'value')]
      if (color.randomOpacity) inkOpacity = painterOpacity = draw(i, 'opacity')
    }
    const tipScale = size * request.lodScale
    particles.push({
      x: request.x + (localX * cosine - localY * sine) * emitter.cloudScale,
      y: request.y + (localX * sine + localY * cosine) * emitter.cloudScale,
      angle: particle.kind === 'ellipse' && baseWidth === baseHeight ? 0 : angle, tipScale,
      width: particle.kind === 'brush' ? particle.width * tipScale : Math.max(request.lodScale, baseWidth * tipScale),
      height: particle.kind === 'brush' ? particle.height * tipScale : Math.max(request.lodScale, baseHeight * tipScale),
      hsv: hsv ? [...hsv] : undefined, inkOpacity, painterOpacity,
      frame: particle.frameCount === undefined ? undefined : draw(i, 'frame'),
    })
  }
  return { particles, random: source.snapshot(), ...(draws ? { draws } : {}) }
}
