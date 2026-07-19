import { describe, expect, it } from 'vitest'

import {
  HOTKEY_ACTIONS, bindingsEqual, captureHotkeyBinding, findHotkeyConflict,
  formatHotkeyLabel, getHotkeyBindings, matchesHotkey, setHotkeyBindings,
  type HotkeyBinding,
} from './hotkeys'
import type { KeyValueStorage } from './roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

function fakeKeydown(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return { key: init.key, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, shiftKey: !!init.shiftKey } as KeyboardEvent
}

describe('getHotkeyBindings', () => {
  it('returns every action default when nothing is stored', () => {
    const bindings = getHotkeyBindings(memoryStorage())
    for (const action of HOTKEY_ACTIONS) expect(bindings[action.id]).toEqual(action.default)
  })

  it('round-trips an override written by setHotkeyBindings', () => {
    const storage = memoryStorage()
    const overrides = getHotkeyBindings(storage)
    overrides.undo = { key: 'u', mod: false, shift: false }
    setHotkeyBindings(storage, overrides)
    expect(getHotkeyBindings(storage).undo).toEqual({ key: 'u', mod: false, shift: false })
    // Untouched actions keep their default.
    expect(getHotkeyBindings(storage).redo).toEqual(HOTKEY_ACTIONS.find(a => a.id === 'redo')!.default)
  })

  it('falls back to defaults on corrupt stored data instead of throwing', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:global', '{not json')
    const bindings = getHotkeyBindings(storage)
    expect(bindings.undo).toEqual(HOTKEY_ACTIONS.find(a => a.id === 'undo')!.default)
  })

  it('ignores a malformed individual binding but keeps the rest', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:global', JSON.stringify({
      v: 1,
      data: { hotkeys: { undo: { key: 'u' } /* missing mod/shift */ } },
    }))
    const bindings = getHotkeyBindings(storage)
    expect(bindings.undo).toEqual(HOTKEY_ACTIONS.find(a => a.id === 'undo')!.default)
  })
})

describe('matchesHotkey', () => {
  it('matches a plain letter key', () => {
    expect(matchesHotkey(fakeKeydown({ key: 'e' }), { key: 'e', mod: false, shift: false })).toBe(true)
  })

  it('requires the modifier to match exactly', () => {
    const binding: HotkeyBinding = { key: 'z', mod: true, shift: false }
    expect(matchesHotkey(fakeKeydown({ key: 'z' }), binding)).toBe(false)
    expect(matchesHotkey(fakeKeydown({ key: 'z', ctrlKey: true }), binding)).toBe(true)
    expect(matchesHotkey(fakeKeydown({ key: 'z', metaKey: true }), binding)).toBe(true)
  })

  it('distinguishes undo from redo by the shift flag on the same key', () => {
    const undo: HotkeyBinding = { key: 'z', mod: true, shift: false }
    const redo: HotkeyBinding = { key: 'z', mod: true, shift: true }
    const redoEvent = fakeKeydown({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(matchesHotkey(redoEvent, undo)).toBe(false)
    expect(matchesHotkey(redoEvent, redo)).toBe(true)
  })

  it('matches a shifted symbol against its base-key binding', () => {
    // Shift+[ is reported as e.key === '{' by the browser.
    const rotateCCW: HotkeyBinding = { key: '[', mod: false, shift: true }
    expect(matchesHotkey(fakeKeydown({ key: '{', shiftKey: true }), rotateCCW)).toBe(true)
  })

  it('does not confuse the unshifted and shifted variants of the same physical key', () => {
    const decreaseSize: HotkeyBinding = { key: '[', mod: false, shift: false }
    expect(matchesHotkey(fakeKeydown({ key: '{', shiftKey: true }), decreaseSize)).toBe(false)
  })
})

describe('captureHotkeyBinding', () => {
  it('returns null for a bare modifier keypress', () => {
    expect(captureHotkeyBinding(fakeKeydown({ key: 'Control', ctrlKey: true }))).toBeNull()
    expect(captureHotkeyBinding(fakeKeydown({ key: 'Shift', shiftKey: true }))).toBeNull()
  })

  it('captures a real key with its modifiers', () => {
    expect(captureHotkeyBinding(fakeKeydown({ key: 'u' }))).toEqual({ key: 'u', mod: false, shift: false })
    expect(captureHotkeyBinding(fakeKeydown({ key: 'z', ctrlKey: true, shiftKey: true })))
      .toEqual({ key: 'z', mod: true, shift: true })
  })

  it('normalizes a captured shifted symbol back to its base key', () => {
    expect(captureHotkeyBinding(fakeKeydown({ key: '{', shiftKey: true })))
      .toEqual({ key: '[', mod: false, shift: true })
  })
})

describe('formatHotkeyLabel', () => {
  it('formats plain and modified bindings', () => {
    expect(formatHotkeyLabel({ key: 'e', mod: false, shift: false })).toBe('E')
    expect(formatHotkeyLabel({ key: 'z', mod: true, shift: false })).toBe('Ctrl+Z')
    expect(formatHotkeyLabel({ key: 'z', mod: true, shift: true })).toBe('Ctrl+Shift+Z')
    expect(formatHotkeyLabel({ key: '[', mod: false, shift: true })).toBe('Shift+[')
  })
})

describe('findHotkeyConflict', () => {
  it('finds another action already bound to the same combo', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    const conflict = findHotkeyConflict('resetRotation', { key: 'e', mod: false, shift: false }, bindings)
    expect(conflict?.id).toBe('toggleEraser')
  })

  it('returns null when the combo is free', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    expect(findHotkeyConflict('toggleEraser', { key: 'q', mod: false, shift: false }, bindings)).toBeNull()
  })

  it('does not flag an action against its own current binding', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    expect(findHotkeyConflict('toggleEraser', bindings.toggleEraser, bindings)).toBeNull()
  })
})

describe('bindingsEqual', () => {
  it('compares key case-insensitively', () => {
    expect(bindingsEqual({ key: 'e', mod: false, shift: false }, { key: 'E', mod: false, shift: false })).toBe(true)
  })

  it('is sensitive to modifiers', () => {
    expect(bindingsEqual({ key: 'z', mod: true, shift: false }, { key: 'z', mod: false, shift: false })).toBe(false)
  })
})
