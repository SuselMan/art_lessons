import { MaterialFieldPages, type MaterialBoundary, type MaterialRect } from './MaterialFieldPages';

export interface MaterialPhaseWindow {
  /** Global window origin may be negative. All arrays belong to this callback. */
  readonly rect: MaterialRect;
  readonly interior: MaterialRect;
  readonly inputs: readonly Uint8Array[];
}
export interface MaterialPhaseOptions {
  inputs: readonly MaterialFieldPages[];
  output: MaterialFieldPages;
  /** Concrete stencil radius for this phase, never inferred from page size. */
  halo: number;
  boundary?: MaterialBoundary;
  order?: 'forward' | 'reverse';
  /** Return a full RGBA window; only interior pixels are published. */
  run: (window: MaterialPhaseWindow) => Uint8Array;
}
export interface MaterialPhaseProgress { completed: number; total: number }
/** Inputs and output revision freeze at invocation, even before the first next().
 * Scratch arrays are O((pageSize + 2*halo)^2 * inputCount); staged CPU pages are backing storage.
 * Exhaust the generator to commit. return(), throw(), callback failure leave output untouched.
 */
export function executeMaterialFieldPhase(options: MaterialPhaseOptions): Generator<MaterialPhaseProgress, number, void> {
  const { output, halo, run, boundary = 'clamp', order = 'forward' } = options;
  if (!Number.isSafeInteger(halo) || halo < 0) throw new RangeError('Invalid phase halo');
  const sources = options.inputs.map(input => {
    if (input.width !== output.width || input.height !== output.height) throw new RangeError('Phase field dimensions differ');
    return input.snapshot();
  });
  const write = output.beginWrite();
  return (function* () {
    try {
      const columns = Math.ceil(output.width / output.pageSize), rows = Math.ceil(output.height / output.pageSize);
      const total = columns * rows;
      for (let i = 0; i < total; i++) {
        const index = order === 'reverse' ? total - 1 - i : i;
        const x = index % columns * output.pageSize, y = Math.floor(index / columns) * output.pageSize;
        const width = Math.min(output.pageSize, output.width - x), height = Math.min(output.pageSize, output.height - y);
        const rect = { x: x - halo, y: y - halo, width: width + 2 * halo, height: height + 2 * halo };
        const result = run({ rect, interior: { x: halo, y: halo, width, height }, inputs: sources.map(s => s.readRect(rect, boundary)) });
        if (result.length !== rect.width * rect.height * 4) throw new RangeError('Phase result must cover the RGBA window');
        const interior = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row++) interior.set(result.subarray(((row + halo) * rect.width + halo) * 4,
          ((row + halo) * rect.width + halo + width) * 4), row * width * 4);
        write.writeRect({ x, y, width, height }, interior);
        yield { completed: i + 1, total };
      }
      return write.commit();
    } finally { write.abort(); }
  })();
}
