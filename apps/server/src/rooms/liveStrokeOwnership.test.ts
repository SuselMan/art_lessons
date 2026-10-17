import { describe, expect, it } from 'vitest'
import { packDabs, type StrokeLiveData, type StrokeOperation } from '@grafetto/shared'
import { createLiveStrokeOwnership } from './liveStrokeOwnership.js'

const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
const packet = (patch: Partial<StrokeLiveData> = {}): StrokeLiveData => ({ strokeId: 'gesture', layerId: 'L1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: packDabs([dab]), ...patch })
const operation = (patch: Partial<StrokeOperation> = {}): StrokeOperation => ({ id: 'op', type: 'stroke', userId: 'author', timestamp: 0, strokeId: 'gesture', layerId: 'L1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], dabs: [dab], ...patch })

describe('#792 conservative live-prefix ownership', () => {
  it.each(['', '2:AAAA', '1:AA==', '1:AAAA=', '1:AAA-', packDabs([dab]).slice(0, -3) + 'B=='])('never retires an unknown/truncated packed payload %s', payload => {
    const owned = createLiveStrokeOwnership()
    owned.live('board', packet({ dabsPacked: payload }))
    owned.accepted(operation())
    owned.end('gesture')
    expect(owned.drain()).toEqual([{ strokeId: 'gesture', boardId: 'board' }])
  })

  it.each([0, 2])('a duplicate/gap packet sequence %i cannot establish reliable coverage', packetSeq => {
    const owned = createLiveStrokeOwnership()
    owned.live('board', packet())
    owned.live('board', packet({ packetSeq }))
    owned.accepted(operation({ dabs: [dab, dab, dab] }))
    owned.end('gesture')
    expect(owned.drain()).toHaveLength(1)
  })

  it('requires coverage independently on each layer of a fanout gesture', () => {
    const owned = createLiveStrokeOwnership()
    owned.live('board', packet())
    owned.live('board', packet({ layerId: 'L2' }))
    owned.accepted(operation({ dabs: [dab, dab] }))
    owned.end('gesture')
    expect(owned.drain()).toHaveLength(1)
  })

  it('uses dabs[] before dabsPacked exactly like strokeDabs', () => {
    const owned = createLiveStrokeOwnership()
    owned.live('board', packet())
    owned.accepted(operation({ dabs: [], dabsPacked: packDabs([dab]) }))
    owned.end('gesture')
    expect(owned.drain()).toHaveLength(1)
  })

  it('fully covered packed operations retire only after normal UP', () => {
    const owned = createLiveStrokeOwnership()
    owned.live('board', packet())
    owned.accepted(operation({ dabs: undefined, dabsPacked: packDabs([dab]) }))
    owned.end('gesture')
    expect(owned.drain()).toEqual([])
  })
})

it('#792 capacity evicts only the oldest ended entry, never an active held gesture', () => {
  const owned = createLiveStrokeOwnership()
  for (let i = 0; i < 128; i++) owned.live('board', packet({ strokeId: `held-${i}` }))
  expect(owned.reserve('extra')).toEqual({ allowed: false })
  owned.end('held-1')
  expect(owned.reserve('extra')).toEqual({ allowed: true, evicted: { strokeId: 'held-1', boardId: 'board' } })
  expect(owned.drain().map(entry => entry.strokeId)).not.toContain('held-1')
})

it('#792 gapped completed gestures never permanently exhaust 128 slots', () => {
  const owned = createLiveStrokeOwnership()
  let evictions = 0
  for (let i = 0; i < 140; i++) {
    const strokeId = `gapped-${i}`
    const slot = owned.reserve(strokeId)
    expect(slot.allowed).toBe(true)
    if (slot.evicted) evictions++
    owned.live('board', packet({ strokeId, packetSeq: 1 }))
    owned.accepted(operation({ strokeId }))
    owned.end(strokeId)
  }
  expect(evictions).toBe(12)
  expect(owned.drain()).toHaveLength(128)
})

it('#792 layer overflow keeps one unknown ownership without growing a layer map or dropping future gestures', () => {
  const owned = createLiveStrokeOwnership()
  for (let i = 0; i < 1000; i++) owned.live('board', packet({ layerId: `L-${i}` }))
  owned.end('gesture')
  expect(owned.drain()).toEqual([{ strokeId: 'gesture', boardId: 'board' }])
})

it('#792 operation-before-first-live conservatively survives until ended capacity pressure', () => {
  const owned = createLiveStrokeOwnership()
  owned.accepted(operation())
  owned.live('board', packet())
  owned.end('gesture')
  for (let i = 0; i < 127; i++) owned.live('board', packet({ strokeId: `held-${i}` }))
  expect(owned.reserve('next')).toEqual({ allowed: true, evicted: { strokeId: 'gesture', boardId: 'board' } })
})

it.each([undefined, null, 42])('#792 a non-string untrusted dabsPacked %s never throws and retains unknown ownership', value => {
  const owned = createLiveStrokeOwnership()
  expect(() => owned.live('board', packet({ dabsPacked: value as unknown as string }))).not.toThrow()
  owned.accepted(operation())
  owned.end('gesture')
  expect(owned.drain()).toEqual([{ strokeId: 'gesture', boardId: 'board' }])
})
