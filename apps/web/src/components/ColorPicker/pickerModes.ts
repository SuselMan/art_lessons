import type { TranslationKey } from '../../i18n'

/** The shapes the color picker can take (#337). Different editors have trained
 *  different habits over decades — a hue strip, a hue ring around a square, a
 *  triangle — and none of them is more correct than the others, so the choice
 *  belongs to the person, not to us.
 *
 *  Array order is the order they appear in the switch. `bar` is the shape this
 *  picker has always had and stays the default; `ring` (#340) and `triangle`
 *  (#341) join it here.
 *
 *  Deliberately free of component imports: `stores/settingsStore` reads the
 *  type guard below, and the store is pulled into node-run unit tests that
 *  have no DOM and no CSS-module loader. The mode → component mapping lives in
 *  the picker itself. */
export const COLOR_PICKER_MODES = ['bar'] as const

export type ColorPickerMode = (typeof COLOR_PICKER_MODES)[number]

export const DEFAULT_COLOR_PICKER_MODE: ColorPickerMode = 'bar'

export function isColorPickerMode(value: unknown): value is ColorPickerMode {
  return typeof value === 'string' && (COLOR_PICKER_MODES as readonly string[]).includes(value)
}

/** Icon and label per mode, as a registry so the switch stays one map over
 *  COLOR_PICKER_MODES as modes are added rather than a growing block of JSX.
 *  Holds a TranslationKey, never a finished label (CLAUDE.md). */
export const COLOR_PICKER_MODE_META: Record<ColorPickerMode, { icon: string; label: TranslationKey }> = {
  bar: { icon: 'gradient', label: 'palette.mode.bar' },
}
