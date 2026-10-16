/** A single material tile, with independent world axes. Number preserves square callers. */
export type PuddleSize = number | {width: number; height: number}
export function puddleDimensions(size: PuddleSize): {width: number; height: number} {
  const width = typeof size === 'number' ? size : size.width
  const height = typeof size === 'number' ? size : size.height
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid puddle dimensions')
  return {width, height}
}
/** Same world sampling density on both axes; square callers retain the exact 256² grid. */
export function puddleLowDimensions(size: PuddleSize): {width: number; height: number} {
  const {width, height} = puddleDimensions(size), longest = Math.max(width, height)
  return {width: Math.max(1, Math.round(256 * width / longest)), height: Math.max(1, Math.round(256 * height / longest))}
}
