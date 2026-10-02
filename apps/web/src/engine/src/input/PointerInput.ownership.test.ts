import { describe, expect, it } from 'vitest'

import { PointerInput, type PointerData } from './PointerInput'

function rig() {
  const listeners = new Map<string, (e: PointerEvent) => void>()
  const canvas = {
    width: 100, height: 100, style: {},
    addEventListener(type: string, fn: (e: PointerEvent) => void) { listeners.set(type, fn) },
    removeEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }
  const input = new PointerInput(canvas as unknown as HTMLCanvasElement)
  const starts: PointerData[] = [], moves: PointerData[] = [], ends: PointerData[] = []
  input.on('start', e => starts.push(e))
  input.on('move', e => moves.push(e))
  input.on('end', e => ends.push(e))
  function send(type: string, overrides: Partial<PointerEvent> = {}) {
    listeners.get(type)!({
      type, button: 0, buttons: 1, pointerId: 7, pointerType: 'pen', pressure: 0.8,
      clientX: 10, clientY: 20, timeStamp: 0, tiltX: 0, tiltY: 0,
      ...overrides,
    } as PointerEvent)
  }
  return { input, starts, moves, ends, send }
}

describe('stroke input ownership', () => {
  it('a second mouse down cannot steal an active pen stroke', () => {
    const { send, starts, moves, ends } = rig()
    send('pointerdown')
    send('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 90 })
    send('pointerup', { pointerId: 1, pointerType: 'mouse', buttons: 0, pressure: 0 })
    send('pointermove', { clientX: 15, timeStamp: 8 })
    send('pointerup', { buttons: 0, pressure: 0 })
    expect(starts).toHaveLength(1)
    expect(moves.map(p => p.x)).toEqual([15])
    expect(ends).toHaveLength(1)
  })

  it('a new down from the same pointer can recover a missed up', () => {
    const { send, starts, ends } = rig()
    send('pointerdown')
    send('pointerdown', { clientX: 15, timeStamp: 16 })
    send('pointerup', { buttons: 0, pressure: 0 })
    expect(starts).toHaveLength(2)
    expect(ends).toHaveLength(1)
  })

  it.each(['mouse', 'touch', 'pen'])('ignores a foreign %s move during a pen stroke', pointerType => {
    const { send, moves } = rig()
    send('pointerdown')
    send('pointermove', { pointerId: 9, pointerType, clientX: 90, timeStamp: 4 })
    send('pointermove', { clientX: 12, timeStamp: 8 })
    expect(moves.map(p => p.x)).toEqual([12])
  })

  it.each(['pointerup', 'pointercancel'])('a palm %s cannot finish the pen stroke', type => {
    const { send, ends, moves } = rig()
    send('pointerdown')
    send(type, { pointerId: 9, pointerType: 'touch', pressure: 0, buttons: 0 })
    expect(ends).toHaveLength(0)
    send('pointermove', { clientX: 15, timeStamp: 8 })
    send('pointerup', { pressure: 0, buttons: 0, timeStamp: 12 })
    expect(moves.map(p => p.x)).toEqual([15])
    expect(ends).toHaveLength(1)
  })

  it.each(['mouse', 'pen'])('ignores %s hover before its up arrives', pointerType => {
    const { send, moves, ends } = rig()
    send('pointerdown', { pointerType })
    send('pointermove', { pointerType, buttons: 0, pressure: 0, clientX: 90, timeStamp: 4 })
    send('pointerup', { pointerType, buttons: 0, pressure: 0, timeStamp: 8 })
    expect(moves).toHaveLength(0)
    expect(ends).toHaveLength(1)
  })

  it('filters foreign and hover samples inside a coalesced batch without advancing speed', () => {
    const { send, moves } = rig()
    send('pointerdown')
    const samples = [
      { pointerId: 9, clientX: 90, buttons: 1, pressure: 0.8, timeStamp: 4 },
      { pointerId: 7, clientX: 12, buttons: 1, pressure: 0.8, timeStamp: 8 },
      { pointerId: 7, clientX: 99, buttons: 0, pressure: 0, timeStamp: 12 },
    ].map(p => ({ pointerType: 'pen', clientY: 20, tiltX: 0, tiltY: 0, ...p } as PointerEvent))
    send('pointermove', { clientX: 12, timeStamp: 8, getCoalescedEvents: () => samples })
    expect(moves.map(p => p.x)).toEqual([12])
    expect(moves[0].speed).toBeCloseTo(0.25)
  })

  it('retains light contact and pen drivers that report contact pressure without buttons', () => {
    const { send, moves } = rig()
    send('pointerdown')
    send('pointermove', { pressure: 0, buttons: 1, clientX: 12, timeStamp: 8 })
    send('pointermove', { pressure: 0.2, buttons: 0, clientX: 14, timeStamp: 16 })
    expect(moves.map(p => p.x)).toEqual([12, 14])
  })

  it('still finishes when the drawing pointer is cancelled by the OS', () => {
    const { send, ends } = rig()
    send('pointerdown')
    send('pointercancel', { pressure: 0, buttons: 0 })
    expect(ends).toHaveLength(1)
  })
})
