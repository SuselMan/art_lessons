import { clamp } from 'lodash-es'

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** h in [0, 360), s/v in [0, 1] — standard HSV, used by ColorPicker's
 *  hue-strip + saturation/value square (RGB isn't a usable UI parameterization
 *  for a 2D+1D picker widget). */
export interface Hsv { h: number; s: number; v: number }

export function rgbToHsv([r, g, b]: [number, number, number]): Hsv {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else                h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rgb: [number, number, number]
  if (h < 60)       rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else              rgb = [c, 0, x]
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m]
}
