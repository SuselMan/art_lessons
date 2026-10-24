import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { advanceBrushAnimation, beginBrushBehavior, behaviorStampsForDab, secondaryBrushDabs } from './brushBehavior'
import { digitalBrushFromPreset } from './digitalBrushPresets'
import { importedBrushAssets, installBrushLibrary } from './importedBrushes'

const frames: NonNullable<BrushDescriptor['tip']['animation']>['frames'] = ['1', '2', '3'].map(value => `asset:${value.repeat(64)}` as const)
const brush = (mode: 'incremental' | 'random' = 'incremental'): BrushDescriptor => ({
  ...digitalBrushFromPreset('hard-round'), id: 'imported-abcdefabcdeffedcbafedcba', version: 101,
  tip: { kind: 'bitmap', mask: frames[0], animation: { mode, frames }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
  scatter: { count: 3, radius: .2, scale: 1, sizeJitter: .1, angleJitter: .2, flowJitter: 0 },
  behavior: { version: 2 },
})
const dabs: Dab[] = Array.from({ length: 20 }, (_, index) => ({ x: 10 + index * 3, y: 20, pressure: .8, size: 30, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: index * 8 }))
const color: [number, number, number] = [.2, .4, .6]

describe('bitmap pipe frame selection', () => {
  it('advances incremental frames once per logical dab, before scatter count', () => {
    const source = brush(), state = beginBrushBehavior(dabs[0])
    for (const [index, dab] of dabs.entries()) {
      const stamps = behaviorStampsForDab(source, dab, state, color)
      expect(stamps).toHaveLength(3)
      expect(stamps.map(stamp => stamp.mask)).toEqual(Array(3).fill(frames[index % 3]))
    }
    expect(state.dabOrdinal).toBe(dabs.length)
  })

  it.each(['incremental', 'random'] as const)('keeps %s frame order through chunk boundaries and restored gesture state', mode => {
    const source = brush(mode), full = beginBrushBehavior(dabs[0])
    const expected = dabs.flatMap(dab => behaviorStampsForDab(source, dab, full, color))
    let chunk = beginBrushBehavior(dabs[0])
    const actual = []
    for (let index = 0; index < dabs.length; index += 7) {
      actual.push(...dabs.slice(index, index + 7).flatMap(dab => behaviorStampsForDab(source, dab, chunk, color)))
      chunk = structuredClone(chunk)
    }
    expect(actual).toEqual(expected)
    expect(chunk).toEqual(full)
    expect(new Set(actual.map(stamp => stamp.mask)).size).toBe(3)
  })

  it('does not move existing jitter streams or create state on an unanimated brush', () => {
    const animated = brush('random'), staticSource: BrushDescriptor = { ...animated, tip: { ...animated.tip, animation: undefined } }
    const before = beginBrushBehavior(dabs[0]), after = beginBrushBehavior(dabs[0])
    for (const dab of dabs) {
      const stamps = behaviorStampsForDab(animated, dab, before, color).map(({ mask: _mask, ...stamp }) => stamp)
      expect(stamps).toEqual(behaviorStampsForDab(staticSource, dab, after, color))
    }
    expect(after.dabOrdinal).toBeUndefined()
  })

  it('gives a local dual component one stable frame per primary logical dab', () => {
    const child = brush('random'), primary: BrushDescriptor = { ...brush(), tip: { ...brush().tip, animation: undefined }, behavior: { version: 2, dual: { brush: child, blendMode: 'multiply' } } }
    const state = beginBrushBehavior(dabs[0])
    const masks = dabs.map(dab => {
      const stamps = behaviorStampsForDab(primary, dab, state, color)
      expect(new Set(stamps.map(stamp => stamp.dualMask)).size).toBe(1)
      return stamps[0].dualMask
    })
    expect(new Set(masks).size).toBe(3)
  })

  it('keeps independent child frame phase through resampling batches', () => {
    const primary = brush(), child = { ...brush(), spacing: .1 }
    const render = (chunkSize: number) => {
      const sampling = { remaining: 0 }, state = beginBrushBehavior(dabs[0])
      const output = []
      for (let index = 0; index < dabs.length; index += chunkSize) {
        const sampled = secondaryBrushDabs(primary, child, dabs.slice(index, index + chunkSize), sampling)
        output.push(...sampled.flatMap(dab => behaviorStampsForDab(child, dab, state, color)))
      }
      return output
    }
    expect(render(7)).toEqual(render(20))
  })

  it('preserves preview forks and counts zero-travel logical mixer dabs', () => {
    const source = brush(), real = beginBrushBehavior(dabs[0])
    behaviorStampsForDab(source, dabs[0], real, color)
    const fork = structuredClone(real)
    behaviorStampsForDab(source, dabs[1], fork, color)
    expect(real.dabOrdinal).toBe(1)
    advanceBrushAnimation(source, real)
    expect(behaviorStampsForDab(source, dabs[2], real, color)[0].mask).toBe(frames[2])
  })

  it('enumerates all animation assets recursively for cold-peer preload', () => {
    const descriptor = brush()
    const childFrame = `asset:${'4'.repeat(64)}` as const
    descriptor.behavior = { version: 2, dual: { brush: { ...brush(), tip: { ...brush().tip, animation: { mode: 'incremental', frames: [frames[0], childFrame] } } }, blendMode: 'multiply', sampling: 'independent' } }
    installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own pipe fixture', source: 'qa', warnings: [], descriptor }], assets: [...frames, childFrame].map(id => ({ id, size: 2, file: `${id.slice(6)}.bin` })), skipped: [] })
    expect(importedBrushAssets(`brush:${descriptor.id}@101`)).toEqual([...frames, childFrame])
  })
})
