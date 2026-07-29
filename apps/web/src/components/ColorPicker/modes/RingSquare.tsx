import { HueRing } from './HueRing'
import { SvSquare } from './SvSquare'
import { inscribedSquareSide } from './ringGeometry'
import type { ColorPickerModeProps } from './types'

/** Hue ring with the saturation/value square inside it (#340) — the shape
 *  Krita, Clip Studio, Blender and Procreate all use, and the most common
 *  thing to miss coming from any of them. */
export function RingSquare({ hsv, onChange }: ColorPickerModeProps) {
  return (
    <HueRing hsv={hsv} onChange={onChange}>
      {radius => {
        const side = inscribedSquareSide(radius)
        return <SvSquare hsv={hsv} onChange={onChange} style={{ width: side, height: side }} />
      }}
    </HueRing>
  )
}
