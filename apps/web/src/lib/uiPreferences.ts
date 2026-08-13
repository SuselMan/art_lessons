import type { DeviceType } from './deviceType'

/** Where the floating tool cluster (#157) is allowed to appear:
 *  - `always` — visible whether or not the rest of the chrome is showing,
 *  - `minimal` — only while minimal UI has hidden the chrome (its original
 *    behaviour, when it was the replacement toolkit for that mode and nothing
 *    else),
 *  - `never`.
 *
 *  One stored value across devices, deliberately: `minimal` on a desktop
 *  already *means* "never" there (minimal UI is touch-only, see
 *  `minimalUiAvailable`), so the desktop control offers two options and reads
 *  a stored `minimal` as `never` rather than storing a second preference that
 *  says the same thing. */
export type FloatingPanelMode = 'always' | 'minimal' | 'never'

export const FLOATING_PANEL_MODES: readonly FloatingPanelMode[] = ['always', 'minimal', 'never']

/** Today's behaviour, kept as the default on purpose (#321): before this
 *  setting existed the panel appeared only in minimal UI, and minimal UI was
 *  an off-by-default experiment — so a browser that has never touched these
 *  settings behaves exactly as it did. */
export const DEFAULT_FLOATING_PANEL_MODE: FloatingPanelMode = 'minimal'

export const DEFAULT_SOUND_VOLUME = 0.7

export function isFloatingPanelMode(value: unknown): value is FloatingPanelMode {
  return FLOATING_PANEL_MODES.includes(value as FloatingPanelMode)
}

export function clampSoundVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume))
}

/** Minimal UI (#99) hides the chrome on a short single-finger tap on the
 *  canvas, and there is no equivalent on a PC: a mouse has no tap, and the
 *  button that toggles the mode lives in the header, which the mode itself
 *  hides — so the way back would have to be something we haven't designed yet
 *  (#384). Rather than ship a half of it, the whole setting is touch-only, and
 *  `deviceType` (#318) is what "touch" means here: the app already asks that
 *  question once, with a manual override for the machines detection gets
 *  wrong. */
export function minimalUiAvailable(deviceType: DeviceType): boolean {
  return deviceType === 'tablet'
}

/** Whether minimal UI can currently hide anything: the setting is on *and*
 *  this device is one where it exists at all. */
export function minimalUiActive(minimalUi: boolean, deviceType: DeviceType): boolean {
  return minimalUi && minimalUiAvailable(deviceType)
}

/** How many taps on the canvas it takes to toggle minimal UI (#189).
 *
 *  `double` is the default and `single` is the old behaviour, kept as a
 *  choice rather than removed: a single tap is the cheaper gesture and some
 *  people never trip it, but it is also what the drawing hand produces by
 *  accident — a resting knuckle that happens to lift without sliding is a
 *  tap by every measure this app can take, and it made the whole chrome
 *  disappear mid-stroke. */
export type MinimalUiTapMode = 'single' | 'double'

export const MINIMAL_UI_TAP_MODES: readonly MinimalUiTapMode[] = ['single', 'double']

export const DEFAULT_MINIMAL_UI_TAP_MODE: MinimalUiTapMode = 'double'

export function isMinimalUiTapMode(value: unknown): value is MinimalUiTapMode {
  return value === 'single' || value === 'double'
}

/** The tap count the recognizer has to see before it toggles anything. */
export function minimalUiTapsRequired(mode: MinimalUiTapMode): number {
  return mode === 'double' ? 2 : 1
}

/** The options the floating-panel control offers on this device — `minimal`
 *  is dropped where minimal UI doesn't exist, since picking it there would
 *  mean "never" under a name that doesn't say so. */
export function floatingPanelChoices(deviceType: DeviceType): readonly FloatingPanelMode[] {
  return minimalUiAvailable(deviceType) ? FLOATING_PANEL_MODES : ['always', 'never']
}

/** Which option the control shows as selected, given a value that may have
 *  been stored on a different device (see FloatingPanelMode's own comment). */
export function floatingPanelSelection(mode: FloatingPanelMode, deviceType: DeviceType): FloatingPanelMode {
  if (mode === 'minimal' && !minimalUiAvailable(deviceType)) return 'never'
  return mode
}

/** The one place that decides whether the floating panel is on screen.
 *  `uiHidden` is the live minimal-UI state (chrome currently hidden), not the
 *  setting. */
export function floatingPanelVisible(
  mode: FloatingPanelMode,
  deviceType: DeviceType,
  uiHidden: boolean,
): boolean {
  if (mode === 'never') return false
  if (mode === 'always') return true
  return uiHidden && minimalUiAvailable(deviceType)
}
