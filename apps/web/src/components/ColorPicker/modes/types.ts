import type { Hsv } from '../../../lib/color'

/** What every picker mode is handed, and all it is allowed to do.
 *
 *  A mode is pure geometry: it draws a surface and turns a pointer position
 *  into H/S/V. It never converts to RGB, never touches the hex field, never
 *  emits outward — the shell owns all of that, so a new mode (#340, #341)
 *  cannot accidentally reintroduce the hue-through-gray bug the shell's own
 *  state exists to prevent. */
export interface ColorPickerModeProps {
  hsv: Hsv
  onChange: (hsv: Hsv) => void
}
