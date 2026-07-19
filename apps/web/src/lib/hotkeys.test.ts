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

function fakeKeydown(init: Partial<KeyboardEventInit> & { code: string }): KeyboardEvent {
  return { code: init.code, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, shiftKey: !!init.shiftKey } as KeyboardEvent
}

describe('getHotkeyBindings', () => {
  it('returns every action default when nothing is stored', () => {
    const bindings = getHotkeyBindings(memoryStorage())
    for (const action of HOTKEY_ACTIONS) expect(bindings[action.id]).toEqual(action.default)
  })

  it('round-trips an override written by setHotkeyBindings', () => {
    const storage = memoryStorage()
    const overrides = getHotkeyBindings(storage)
    overrides.undo = { code: 'KeyU', mod: false, shift: false }
    setHotkeyBindings(storage, overrides)
    expect(getHotkeyBindings(storage).undo).toEqual({ code: 'KeyU', mod: false, shift: false })
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
      data: { hotkeys: { undo: { code: 'KeyU' } /* missing mod/shift */ } },
    }))
    const bindings = getHotkeyBindings(storage)
    expect(bindings.undo).toEqual(HOTKEY_ACTIONS.find(a => a.id === 'undo')!.default)
  })
})

describe('matchesHotkey', () => {
  it('matches a plain letter key by physical code', () => {
    expect(matchesHotkey(fakeKeydown({ code: 'KeyE' }), { code: 'KeyE', mod: false, shift: false })).toBe(true)
  })

  it('requires the modifier to match exactly', () => {
    const binding: HotkeyBinding = { code: 'KeyZ', mod: true, shift: false }
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ' }), binding)).toBe(false)
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ', ctrlKey: true }), binding)).toBe(true)
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ', metaKey: true }), binding)).toBe(true)
  })

  it('distinguishes undo from redo by the shift flag on the same key', () => {
    const undo: HotkeyBinding = { code: 'KeyZ', mod: true, shift: false }
    const redo: HotkeyBinding = { code: 'KeyZ', mod: true, shift: true }
    const redoEvent = fakeKeydown({ code: 'KeyZ', ctrlKey: true, shiftKey: true })
    expect(matchesHotkey(redoEvent, undo)).toBe(false)
    expect(matchesHotkey(redoEvent, redo)).toBe(true)
  })

  it('is unaffected by which character the active layout would produce', () => {
    // A Cyrillic layout reports e.key as 'я' for the physical key at 'KeyZ'
    // — matching must not care, since it only ever looks at e.code.
    const undo: HotkeyBinding = { code: 'KeyZ', mod: true, shift: false }
    const event = { code: 'KeyZ', key: 'я', ctrlKey: true, metaKey: false, shiftKey: false } as KeyboardEvent
    expect(matchesHotkey(event, undo)).toBe(true)
  })
})

describe('captureHotkeyBinding', () => {
  it('returns null for a bare modifier keypress', () => {
    expect(captureHotkeyBinding(fakeKeydown({ code: 'ControlLeft', ctrlKey: true }))).toBeNull()
    expect(captureHotkeyBinding(fakeKeydown({ code: 'ShiftLeft', shiftKey: true }))).toBeNull()
  })

  it('captures a real key with its modifiers, by physical code', () => {
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyU' }))).toEqual({ code: 'KeyU', mod: false, shift: false })
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyZ', ctrlKey: true, shiftKey: true })))
      .toEqual({ code: 'KeyZ', mod: true, shift: true })
  })

  it('captures the same binding regardless of the active layout', () => {
    const usEvent = { code: 'KeyZ', key: 'z', ctrlKey: true, metaKey: false, shiftKey: false } as KeyboardEvent
    const cyrillicEvent = { code: 'KeyZ', key: 'я', ctrlKey: true, metaKey: false, shiftKey: false } as KeyboardEvent
    expect(captureHotkeyBinding(usEvent)).toEqual(captureHotkeyBinding(cyrillicEvent))
  })
})

describe('formatHotkeyLabel', () => {
  it('formats plain and modified bindings', () => {
    expect(formatHotkeyLabel({ code: 'KeyE', mod: false, shift: false })).toBe('E')
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: false })).toBe('Ctrl+Z')
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: true })).toBe('Ctrl+Shift+Z')
    expect(formatHotkeyLabel({ code: 'BracketLeft', mod: false, shift: true })).toBe('Shift+[')
    expect(formatHotkeyLabel({ code: 'Digit1', mod: false, shift: false })).toBe('1')
  })
})

describe('findHotkeyConflict', () => {
  it('finds another action already bound to the same combo', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    const conflict = findHotkeyConflict('resetRotation', { code: 'KeyE', mod: false, shift: false }, bindings)
    expect(conflict?.id).toBe('toggleEraser')
  })

  it('returns null when the combo is free', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    expect(findHotkeyConflict('toggleEraser', { code: 'KeyQ', mod: false, shift: false }, bindings)).toBeNull()
  })

  it('does not flag an action against its own current binding', () => {
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    expect(findHotkeyConflict('toggleEraser', bindings.toggleEraser, bindings)).toBeNull()
  })
})

describe('bindingsEqual', () => {
  it('compares the physical code exactly', () => {
    expect(bindingsEqual({ code: 'KeyE', mod: false, shift: false }, { code: 'KeyE', mod: false, shift: false })).toBe(true)
    expect(bindingsEqual({ code: 'KeyE', mod: false, shift: false }, { code: 'KeyQ', mod: false, shift: false })).toBe(false)
  })

  it('is sensitive to modifiers', () => {
    expect(bindingsEqual({ code: 'KeyZ', mod: true, shift: false }, { code: 'KeyZ', mod: false, shift: false })).toBe(false)
  })
})
