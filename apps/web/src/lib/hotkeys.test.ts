import { describe, expect, it } from 'vitest'

import {
  HOTKEY_ACTIONS, bindingsEqual, browserZoomIntent, captureHotkeyBinding, findHotkeyConflict,
  formatHotkeyLabel, getHotkeyBindings, isReservedCombo, matchesHotkey, setHotkeyBindings,
  type HotkeyBinding,
} from './hotkeys'
import type { KeyValueStorage } from './roomStorage'

// Every platform-sensitive function takes the platform as its last argument
// rather than reading navigator, so both branches are testable here; these two
// name them at the call sites below instead of a bare true/false.
const MAC = true
const PC = false

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

function fakeKeydown(init: Partial<KeyboardEventInit> & { code: string }): KeyboardEvent {
  return {
    code: init.code, key: init.key ?? '',
    ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey,
    shiftKey: !!init.shiftKey, altKey: !!init.altKey,
  } as KeyboardEvent
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
  const undo: HotkeyBinding = { code: 'KeyZ', mod: true, shift: false }

  it('matches a plain letter key by physical code', () => {
    expect(matchesHotkey(fakeKeydown({ code: 'KeyE' }), { code: 'KeyE', mod: false, shift: false })).toBe(true)
  })

  it('requires the modifier to match exactly', () => {
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ' }), undo, PC)).toBe(false)
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ', ctrlKey: true }), undo, PC)).toBe(true)
  })

  it('takes Cmd as the modifier on a Mac and Ctrl everywhere else', () => {
    const ctrlZ = fakeKeydown({ code: 'KeyZ', ctrlKey: true })
    const cmdZ  = fakeKeydown({ code: 'KeyZ', metaKey: true })
    expect(matchesHotkey(cmdZ, undo, MAC)).toBe(true)
    expect(matchesHotkey(ctrlZ, undo, MAC)).toBe(false)
    expect(matchesHotkey(ctrlZ, undo, PC)).toBe(true)
    // The Windows key is `metaKey` too — Win+Z is the OS's snap layouts, and
    // used to fire undo here because either modifier was accepted everywhere.
    expect(matchesHotkey(cmdZ, undo, PC)).toBe(false)
  })

  it('never matches while Alt is held', () => {
    // AltGr reports as Ctrl+Alt on Windows/Linux, so without this an AltGr+Z
    // — an ordinary character on several European layouts — undid a stroke.
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ', ctrlKey: true, altKey: true }), undo, PC)).toBe(false)
    expect(matchesHotkey(
      fakeKeydown({ code: 'KeyE', altKey: true }), { code: 'KeyE', mod: false, shift: false }, PC,
    )).toBe(false)
  })

  it('distinguishes undo from redo by the shift flag on the same key', () => {
    const redo: HotkeyBinding = { code: 'KeyZ', mod: true, shift: true }
    const redoEvent = fakeKeydown({ code: 'KeyZ', ctrlKey: true, shiftKey: true })
    expect(matchesHotkey(redoEvent, undo, PC)).toBe(false)
    expect(matchesHotkey(redoEvent, redo, PC)).toBe(true)
  })

  it('is unaffected by which character the active layout would produce', () => {
    // A Cyrillic layout reports e.key as 'я' for the physical key at 'KeyZ'
    // — matching must not care, since it only ever looks at e.code.
    expect(matchesHotkey(fakeKeydown({ code: 'KeyZ', key: 'я', ctrlKey: true }), undo, PC)).toBe(true)
  })
})

describe('browserZoomIntent', () => {
  it('claims every spelling of the browser\'s own zoom keys', () => {
    expect(browserZoomIntent(fakeKeydown({ code: 'Equal', key: '=', ctrlKey: true }), PC)).toBe('in')
    expect(browserZoomIntent(fakeKeydown({ code: 'Equal', key: '+', ctrlKey: true, shiftKey: true }), PC)).toBe('in')
    expect(browserZoomIntent(fakeKeydown({ code: 'NumpadAdd', key: '+', ctrlKey: true }), PC)).toBe('in')
    expect(browserZoomIntent(fakeKeydown({ code: 'Minus', key: '-', ctrlKey: true }), PC)).toBe('out')
    expect(browserZoomIntent(fakeKeydown({ code: 'NumpadSubtract', key: '-', ctrlKey: true }), PC)).toBe('out')
    expect(browserZoomIntent(fakeKeydown({ code: 'Minus', key: '-', metaKey: true }), MAC)).toBe('out')
  })

  it('claims the +/- of a layout that puts them at another physical key', () => {
    // German QWERTZ: '+' sits where a US keyboard has ']'. Matching only the
    // physical Equal/Minus would leave the page zooming there.
    expect(browserZoomIntent(fakeKeydown({ code: 'BracketRight', key: '+', ctrlKey: true }), PC)).toBe('in')
    expect(browserZoomIntent(fakeKeydown({ code: 'Slash', key: '-', ctrlKey: true }), PC)).toBe('out')
  })

  it('leaves the same keys alone without the modifier', () => {
    expect(browserZoomIntent(fakeKeydown({ code: 'Equal', key: '=' }), PC)).toBeNull()
    expect(browserZoomIntent(fakeKeydown({ code: 'Minus', key: '-' }), PC)).toBeNull()
  })

  it('leaves Ctrl+0 to the browser — it is the only way back from a drifted zoom', () => {
    expect(browserZoomIntent(fakeKeydown({ code: 'Digit0', key: '0', ctrlKey: true }), PC)).toBeNull()
  })
})

describe('isReservedCombo', () => {
  it('refuses combos the browser or OS never gives up', () => {
    expect(isReservedCombo({ code: 'KeyW', mod: true, shift: false })).toBe(true)
    expect(isReservedCombo({ code: 'KeyT', mod: true, shift: false })).toBe(true)
  })

  it('leaves the same keys bindable without the modifier', () => {
    expect(isReservedCombo({ code: 'KeyW', mod: false, shift: false })).toBe(false)
  })

  it('does not over-refuse combos that are genuinely preventable', () => {
    expect(isReservedCombo({ code: 'KeyS', mod: true, shift: false })).toBe(false)
    expect(isReservedCombo({ code: 'KeyZ', mod: true, shift: false })).toBe(false)
  })
})

describe('captureHotkeyBinding', () => {
  it('returns null for a bare modifier keypress', () => {
    expect(captureHotkeyBinding(fakeKeydown({ code: 'ControlLeft', ctrlKey: true }))).toBeNull()
    expect(captureHotkeyBinding(fakeKeydown({ code: 'ShiftLeft', shiftKey: true }))).toBeNull()
  })

  it('captures a real key with its modifiers, by physical code', () => {
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyU' }))).toEqual({ code: 'KeyU', mod: false, shift: false })
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyZ', ctrlKey: true, shiftKey: true }), PC))
      .toEqual({ code: 'KeyZ', mod: true, shift: true })
  })

  it('records Cmd on a Mac as the same `mod` Ctrl records elsewhere', () => {
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyZ', metaKey: true }), MAC))
      .toEqual({ code: 'KeyZ', mod: true, shift: false })
  })

  it('keeps listening rather than recording a combo that could never fire', () => {
    // Alt is outside the binding vocabulary, and the other platform's
    // modifier is not `mod` — recording either would save a shortcut
    // matchesHotkey rejects on every press.
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyE', altKey: true }), PC)).toBeNull()
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyZ', metaKey: true }), PC)).toBeNull()
    expect(captureHotkeyBinding(fakeKeydown({ code: 'KeyZ', ctrlKey: true }), MAC)).toBeNull()
  })

  it('captures the same binding regardless of the active layout', () => {
    const usEvent = fakeKeydown({ code: 'KeyZ', key: 'z', ctrlKey: true })
    const cyrillicEvent = fakeKeydown({ code: 'KeyZ', key: 'я', ctrlKey: true })
    expect(captureHotkeyBinding(usEvent, PC)).toEqual(captureHotkeyBinding(cyrillicEvent, PC))
  })
})

describe('formatHotkeyLabel', () => {
  it('formats plain and modified bindings', () => {
    expect(formatHotkeyLabel({ code: 'KeyE', mod: false, shift: false }, PC)).toBe('E')
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: false }, PC)).toBe('Ctrl+Z')
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: true }, PC)).toBe('Ctrl+Shift+Z')
    expect(formatHotkeyLabel({ code: 'BracketLeft', mod: false, shift: true }, PC)).toBe('Shift+[')
    expect(formatHotkeyLabel({ code: 'Digit1', mod: false, shift: false }, PC)).toBe('1')
  })

  it('spells the modifiers the way a Mac does', () => {
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: false }, MAC)).toBe('⌘Z')
    expect(formatHotkeyLabel({ code: 'KeyZ', mod: true, shift: true }, MAC)).toBe('⌘⇧Z')
    expect(formatHotkeyLabel({ code: 'KeyE', mod: false, shift: false }, MAC)).toBe('E')
  })

  it('has a label for every code the defaults actually bind', () => {
    // codeLabel falls back to the raw code, which would surface as a tooltip
    // reading "BracketLeft" — caught here rather than on screen.
    for (const action of HOTKEY_ACTIONS) {
      expect(formatHotkeyLabel(action.default, PC)).not.toContain(action.default.code)
    }
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

  it('finds no conflict among the shipped defaults', () => {
    // The registry is the one place two actions could quietly land on the same
    // key — the rebind UI rejects a collision, but nothing checks the file.
    const bindings = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))
    for (const action of HOTKEY_ACTIONS) {
      expect(findHotkeyConflict(action.id, action.default, bindings)).toBeNull()
    }
  })

  it('ships no default the browser would swallow', () => {
    for (const action of HOTKEY_ACTIONS) expect(isReservedCombo(action.default)).toBe(false)
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
