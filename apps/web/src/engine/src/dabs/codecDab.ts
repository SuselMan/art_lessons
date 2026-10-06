import type { Dab } from '@grafetto/shared'

// The operation codec stores these ten fields as float32. Match that input
// precision before CPU ribbon geometry, not just when vertices reach WebGL.
export function codecDab(dab: Dab): Dab {
  const copy: Dab = {
    x: Math.fround(dab.x), y: Math.fround(dab.y), pressure: Math.fround(dab.pressure),
    tiltX: Math.fround(dab.tiltX), tiltY: Math.fround(dab.tiltY), size: Math.fround(dab.size),
    aspectRatio: Math.fround(dab.aspectRatio), angle: Math.fround(dab.angle),
    opacity: Math.fround(dab.opacity), t: Math.fround(dab.t),
  }
  return Object.keys(copy).every(key => copy[key as keyof Dab] === dab[key as keyof Dab]) ? dab : copy
}
