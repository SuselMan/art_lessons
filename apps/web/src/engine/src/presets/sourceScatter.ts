import { type KritaRandomSource } from './nativeRandom'
export interface SourceScatterInput {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly width: number
  readonly height: number
  readonly checked: boolean
  readonly axisX: boolean
  readonly axisY: boolean
}
/** KisScatterOption::apply boundary; sizeLike is lazy because disabled axes
 * must skip its sensors as well as the subsequent placement draws. */
export function sourceScatter(input: SourceScatterInput, random: Pick<KritaRandomSource, 'generateNormalized'>, sizeLike: () => number): readonly [number, number] {
  if (!input.checked || (!input.axisX && !input.axisY)) return [input.x, input.y]
  const diameter = Math.max(input.width, input.height)
  const amplitude = sizeLike()
  const jitter = (2 * random.generateNormalized() - 1) * diameter * amplitude
  if (input.axisX && input.axisY) return [input.x + jitter, input.y + (2 * random.generateNormalized() - 1) * diameter * amplitude]
  const dx = Math.fround(Math.cos(input.angle)), dy = Math.fround(Math.sin(input.angle)), scalar = Math.fround(jitter)
  return [input.x + Math.fround((input.axisX ? dx : -dy) * scalar), input.y + Math.fround((input.axisX ? dy : dx) * scalar)]
}
