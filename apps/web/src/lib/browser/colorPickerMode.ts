/** The shapes the color picker can take (#337). Different editors have trained
 *  different habits over decades — a hue strip, a hue ring around a square, a
 *  triangle — and none of them is more correct than the others, so the choice
 *  belongs to the person, not to us.
 *
 *  Array order is the order they appear in the switch. `bar` is the shape this
 *  picker has always had and stays the default; `ring` (#340) and `triangle`
 *  (#341) join it here.
 *
 *  Lives here, below the store, rather than beside the picker: `stores/
 *  settingsStore` reads the default and the guard, and a store may not import
 *  a component (#650). The icon and label per mode stay with the picker, in
 *  components/ColorPicker/pickerModes.ts. */
export const COLOR_PICKER_MODES = ['bar', 'ring', 'triangle'] as const

export type ColorPickerMode = (typeof COLOR_PICKER_MODES)[number]

export const DEFAULT_COLOR_PICKER_MODE: ColorPickerMode = 'bar'

export function isColorPickerMode(value: unknown): value is ColorPickerMode {
  return typeof value === 'string' && (COLOR_PICKER_MODES as readonly string[]).includes(value)
}
