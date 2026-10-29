/** Immutable inverse-CDF data for a source-defined particle distribution.
 * The native Gaussian builder samples a PDF and simplifies its cumulative
 * curve; a direct Gaussian/Box-Muller draw does not have the same value law.
 * Keep that offline table explicit instead of depending on host exp/atan2.
 */
export interface SourceSprayCDFSample {
  readonly x: number
  readonly cumulative: number
  readonly inverseDelta: number
}
export type SourceSprayDistribution =
  | { readonly kind: 'uniform' }
  | { readonly kind: 'inverseCDF'; readonly samples: readonly SourceSprayCDFSample[] }

/** Admission is separate from sampling, so the emitter's hot loop is bounded. */
export function sourceSprayInverseCDF(samples: readonly SourceSprayCDFSample[]): SourceSprayDistribution {
  if (samples.length < 2 || samples.length > 4096) throw new RangeError('Invalid spray CDF sample count')
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    if (!Number.isFinite(sample.x) || sample.x < 0 || !Number.isFinite(sample.cumulative)
      || sample.cumulative < 0 || sample.cumulative > 1 || !Number.isFinite(sample.inverseDelta)
      || sample.inverseDelta < 0) throw new RangeError('Invalid spray CDF sample')
    if (i > 0 && (sample.x <= samples[i - 1].x || sample.cumulative <= samples[i - 1].cumulative
      || sample.inverseDelta <= 0)) throw new RangeError('Spray CDF must increase strictly')
  }
  if (samples[0].cumulative !== 0 || samples[samples.length - 1].cumulative !== 1) throw new RangeError('Invalid spray CDF endpoints')
  return Object.freeze({ kind: 'inverseCDF', samples: Object.freeze(samples.map(sample => Object.freeze({ ...sample }))) })
}

/** One supplied U produces one sample. Center-biased uniform is U, not sqrt(U).
 * At U=1 the pinned native inverse-CDF dereferences end(); our explicitly safe
 * endpoint is the last support coordinate. This repairs source undefined
 * behaviour, rather than asserting native value identity at that endpoint.
 */
export function sampleSourceSprayDistribution(distribution: SourceSprayDistribution, unit: number): number {
  if (!Number.isFinite(unit) || unit < 0 || unit > 1) throw new RangeError('Spray distribution expects a closed unit value')
  if (distribution.kind === 'uniform') return unit
  const samples = distribution.samples
  if (unit === 1) return samples[samples.length - 1].x
  let lower = 0, upper = samples.length
  while (lower < upper) {
    const middle = (lower + upper) >>> 1
    if (unit < samples[middle].cumulative) upper = middle
    else lower = middle + 1
  }
  const previous = samples[lower - 1], next = samples[lower]
  const fraction = (unit - previous.cumulative) * next.inverseDelta
  return previous.x + fraction * (next.x - previous.x)
}
