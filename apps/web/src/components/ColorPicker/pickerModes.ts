import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'
import type { ColorPickerMode } from '../../lib/browser/colorPickerMode'

// The modes themselves live in lib/browser/colorPickerMode.ts, below the store
// that persists the choice (#650); this file is how each one looks.
export {
  COLOR_PICKER_MODES, DEFAULT_COLOR_PICKER_MODE, isColorPickerMode, type ColorPickerMode,
} from '../../lib/browser/colorPickerMode'

/** Icon and label per mode, as a registry so the switch stays one map over
 *  COLOR_PICKER_MODES as modes are added rather than a growing block of JSX.
 *  Holds a TranslationKey, never a finished label (CLAUDE.md). */
export const COLOR_PICKER_MODE_META: Record<ColorPickerMode, { icon: IconName; label: TranslationKey }> = {
  bar: { icon: 'gradient', label: 'palette.mode.bar' },
  ring: { icon: 'trip_origin', label: 'palette.mode.ring' },
  triangle: { icon: 'change_history', label: 'palette.mode.triangle' },
}
