import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import { linerWickPx } from '../presets/linerPresets'

export function dabWorldHalfExtents(
  d: Dab, erasing: boolean, preset: PencilPreset, wicking = false,
): { hx: number; hy: number } {
  const baseR = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
  // #452: the liner's absorbed band lives *outside* baseR, so it has to be
  // padded in here too — this box picks which tiles a batch resolves and
  // which rect gets marked dirty, and a band left out of it is a halo
  // sheared off at a tile boundary (exactly the failure #330 hit with the
  // chisel nib, described in this function's own doc comment above). Same
  // absolute-with-a-cap rule the vertex shader applies per dab
  // (WICK_EXPAND_GLSL); linerWickPx is the single statement of it, so the
  // two can't drift apart. 0 for every other tool.
  const r = baseR + (wicking ? linerWickPx(baseR) : 0)
  // Rotated-rect AABB, not a `baseR * aspectRatio` circle: a 5:1 chisel dab
  // is long *along the nib only*, and inflating the short axis to match
  // would resolve (and so lazily create — 4MB each) whole tiles the dab
  // never actually reaches.
  const halfLong = r * Math.max(1, d.aspectRatio)
  const c = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle))
  return { hx: halfLong * c + r * s, hy: halfLong * s + r * c }
}

export interface RibbonCommandTile { originX:number;originY:number;buffer:{width:number;height:number} }

export function ribbonDabTouchesTile(tile:RibbonCommandTile,dab:Dab,preset:PencilPreset):boolean {
    const { hx, hy } = dabWorldHalfExtents(dab, false, preset)
    const m = 2
    return dab.x + hx + m > tile.originX && dab.x - hx - m < tile.originX + tile.buffer.width
      && dab.y + hy + m > tile.originY && dab.y - hy - m < tile.originY + tile.buffer.height
}
