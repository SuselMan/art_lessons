import { describe, expect, it } from 'vitest'

import {
  clampSoundVolume, floatingPanelChoices, floatingPanelSelection, floatingPanelVisible,
  isFloatingPanelMode, minimalUiActive, minimalUiAvailable,
} from './uiPreferences'

describe('minimal UI availability', () => {
  it('exists on tablets only', () => {
    expect(minimalUiAvailable('tablet')).toBe(true)
    expect(minimalUiAvailable('desktop')).toBe(false)
  })

  it('stays inactive on a desktop even when the stored setting is on', () => {
    // The setting is stored per browser, not per device family, so a value
    // set on a tablet can be read on a PC — where the mode has no way in and
    // no way out (#384).
    expect(minimalUiActive(true, 'tablet')).toBe(true)
    expect(minimalUiActive(true, 'desktop')).toBe(false)
    expect(minimalUiActive(false, 'tablet')).toBe(false)
  })
})

describe('floating panel visibility', () => {
  it('never shows in never mode, whatever the chrome is doing', () => {
    expect(floatingPanelVisible('never', 'tablet', true)).toBe(false)
    expect(floatingPanelVisible('never', 'tablet', false)).toBe(false)
    expect(floatingPanelVisible('never', 'desktop', false)).toBe(false)
  })

  it('always shows in always mode, alongside the full chrome', () => {
    expect(floatingPanelVisible('always', 'tablet', false)).toBe(true)
    expect(floatingPanelVisible('always', 'desktop', false)).toBe(true)
  })

  it('follows the hidden chrome in minimal mode', () => {
    expect(floatingPanelVisible('minimal', 'tablet', true)).toBe(true)
    expect(floatingPanelVisible('minimal', 'tablet', false)).toBe(false)
  })

  it('stays hidden in minimal mode on a desktop', () => {
    // Not reachable through the UI there (the option isn't offered), but a
    // value stored on a tablet can arrive here — and on a desktop "minimal"
    // has no state where it would ever show.
    expect(floatingPanelVisible('minimal', 'desktop', true)).toBe(false)
    expect(floatingPanelVisible('minimal', 'desktop', false)).toBe(false)
  })
})

describe('floating panel control', () => {
  it('offers all three modes on a tablet and drops minimal on a desktop', () => {
    expect(floatingPanelChoices('tablet')).toEqual(['always', 'minimal', 'never'])
    expect(floatingPanelChoices('desktop')).toEqual(['always', 'never'])
  })

  it('shows a stored minimal as never where minimal UI does not exist', () => {
    expect(floatingPanelSelection('minimal', 'desktop')).toBe('never')
    expect(floatingPanelSelection('minimal', 'tablet')).toBe('minimal')
    expect(floatingPanelSelection('always', 'desktop')).toBe('always')
  })
})

describe('stored value guards', () => {
  it('accepts only the three known modes', () => {
    expect(isFloatingPanelMode('always')).toBe(true)
    expect(isFloatingPanelMode('minimal')).toBe(true)
    expect(isFloatingPanelMode('never')).toBe(true)
    expect(isFloatingPanelMode('sometimes')).toBe(false)
    expect(isFloatingPanelMode(null)).toBe(false)
  })

  it('clamps volume into the gain multiplier range', () => {
    expect(clampSoundVolume(0.5)).toBe(0.5)
    expect(clampSoundVolume(-1)).toBe(0)
    expect(clampSoundVolume(4)).toBe(1)
  })
})
