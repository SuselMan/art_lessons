// (#595, ADR 015 §5) The sizes `bakePreview` shrinks the export composite
// through on the GPU, one halving at a time.
//
// Why a chain and not one draw straight to the final size: a single bilinear
// tap per destination pixel samples only 4 of the ~30 source texels an A4
// sheet crammed into 320 px would have to average, so thin strokes drop out
// and the paper grain aliases into moiré. Each halving step instead averages
// a 2x2 block (DOWNSAMPLE_FRAG), which is exact for that step, and the chain
// of them is a box filter over the whole footprint.
//
// Pure and GL-free so the step sizes are testable under vitest, where MockGL
// does not rasterize anything worth asserting on.

export interface PreviewSize {
  width: number
  height: number
}

/** The size the preview ends up at: the longer side at most `maxSide`,
 *  aspect kept, never upscaled, never below 1 px. */
export function previewTargetSize(width: number, height: number, maxSide: number): PreviewSize {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Every intermediate and final size, in order, *excluding* the source size
 *  itself. Empty when the source already fits.
 *
 *  Each step shrinks each axis by a factor of at most 2 — `ceil(n / 2)`
 *  rather than `floor`, because DOWNSAMPLE_FRAG's four taps only cover a
 *  footprint of up to 2 source texels per axis; a step of 5 -> 2 would leave
 *  part of the source unsampled. Each axis stops halving on its own once the
 *  next halving would undershoot its target; one final step (factor below 2
 *  on both axes) then lands exactly on it. */
export function previewDownscaleChain(width: number, height: number, maxSide: number): PreviewSize[] {
  const target = previewTargetSize(width, height, maxSide)
  const steps: PreviewSize[] = []
  // Per axis: a very thin strip (8192 x 37) reaches its target height long
  // before its width, and must stop halving that axis rather than drag the
  // other one into an over-2x final step.
  const halve = (n: number, t: number) => (n > t && Math.ceil(n / 2) >= t ? Math.ceil(n / 2) : n)
  let w = width, h = height
  for (;;) {
    const nw = halve(w, target.width), nh = halve(h, target.height)
    if (nw === w && nh === h) break
    w = nw; h = nh
    steps.push({ width: w, height: h })
  }
  if (w !== target.width || h !== target.height) steps.push(target)
  return steps
}
