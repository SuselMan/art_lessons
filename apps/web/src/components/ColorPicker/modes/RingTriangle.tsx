import { HueRing } from './HueRing'
import { SvTriangle } from './SvTriangle'
import type { ColorPickerModeProps } from './types'

/** Hue ring with the classic saturation/value triangle inside it (#341) —
 *  what Painter and the editors of that generation trained. Shares the ring
 *  with the square mode; only the surface in the hole differs. */
export function RingTriangle({ hsv, onChange }: ColorPickerModeProps) {
  return (
    <HueRing hsv={hsv} onChange={onChange}>
      {radius => <SvTriangle hsv={hsv} onChange={onChange} radius={radius} />}
    </HueRing>
  )
}
