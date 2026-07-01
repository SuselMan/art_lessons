export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1)
}
