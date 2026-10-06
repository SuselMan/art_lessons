import { RIBBON_FLOATS_PER_VERTEX as N } from './markerRibbon'
/** Diagnostic only; never imported by the production painter. Swaps only
 * center-to-side ribbon quads, preserving all emitted vertex attributes.
 * Nib fans and antialias outline rings retain their original triangulation. */
export function swapRibbonBandDiagonal(input: Float32Array): { bands: Float32Array; swapped: number } {
  const bands = input.slice()
  let swapped = 0
  for (let o = 0; o + 6 * N <= input.length; o += 6 * N) {
    const at = (v: number, c: number) => input[o + v * N + c]
    const equal = (a: number, b: number) => Array.from({ length: N }, (_, c) => at(a, c) === at(b, c)).every(Boolean)
    if (!equal(0,3) || !equal(2,4) || at(0,5)!==0 || at(5,5)!==0 || Math.abs(at(1,5))!==1 || at(1,5)!==at(2,5)) continue
    for (const [dest,source] of [0,1,5,1,2,5].entries()) bands.set(input.subarray(o+source*N,o+(source+1)*N),o+dest*N)
    swapped++
  }
  return { bands, swapped }
}
