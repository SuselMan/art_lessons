/** One full-geometry cursor. Target buffers may be bounded stripes, never
 * geometry stripes: global x/y and vector-tail decisions remain unchanged. */
export interface SourceCoverageEvaluator {
  readonly pixels: number
  readonly route: 'scalar' | 'neon64-vector'
  readonly samplesPerPixel: 1 | 9 | 36
  readonly completedPixels: number
  readonly workSamples: number
  readonly done: boolean
  advance(target: Uint8Array, offset: number, maxSamples: number): { written: number; consumed: number; done: boolean }
  cancel(): void
}

/** Owns one lazy arithmetic stream; each yielded item accounts one sample. */
export function sourceCoverageEvaluator(input: {
  readonly pixels: number
  readonly route: SourceCoverageEvaluator['route']
  readonly samplesPerPixel: SourceCoverageEvaluator['samplesPerPixel']
  readonly stream: Generator<number | null, void>
}): SourceCoverageEvaluator {
  const stream = input.stream
  const pixels = input.pixels
  let completedPixels = 0, workSamples = 0, cancelled = false
  return {
    pixels: input.pixels, samplesPerPixel: input.samplesPerPixel, route: input.route,
    get completedPixels() { return completedPixels },
    get workSamples() { return workSamples },
    get done() { return completedPixels === pixels },
    advance(target, offset, maxSamples) {
      if (cancelled) throw new Error('Coverage evaluator cancelled')
      if (!(target instanceof Uint8Array) || !Number.isSafeInteger(offset) || offset < 0 || offset > target.length
        || !Number.isSafeInteger(maxSamples) || maxSamples <= 0) throw new RangeError('Invalid coverage continuation range')
      let written = 0, consumed = 0
      while (consumed < maxSamples && completedPixels < pixels && offset + written < target.length) {
        const next = stream.next()
        if (next.done) throw new Error('Coverage evaluator ended before full geometry')
        consumed++; workSamples++
        if (next.value !== null) { target[offset + written++] = next.value; completedPixels++ }
      }
      return { written, consumed, done: completedPixels === pixels }
    },
    cancel() { cancelled = true; stream.return() },
  }
}
