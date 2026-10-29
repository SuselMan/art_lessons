import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceSensors.native.json'
import { sourceSensorValue, type SourceSensorLaw } from './sourceSensors'
describe('native deterministic sensor value laws', () => {
  it('matches compiled pinned methods for32 native packets, including hover and tilt', () => {
    for (const row of fixture.cases) {
      const actual = fixture.ids.map(id => sourceSensorValue({ ...fixture.law, id: id as SourceSensorLaw['id'] }, row.input))
      expect(actual, JSON.stringify(row.input)).toEqual(row.values)
    }
  })
  it('retains source single-wrap drawing angle rather than silently fully normalizing', () => {
    const input = fixture.cases[0].input
    expect(sourceSensorValue({ id: 'drawingAngle', angleOffset: 1080 }, { ...input, drawingAngle: 0 })).toBe(2.5)
  })
  it('handles nonperiodic/fractional time separately from integer fade and rejects unknown law', () => {
    const input = { ...fixture.cases[1].input, hover: false, time: .15000000000000002, dabSequence: 13 }
    expect(sourceSensorValue({ id: 'time', length: 720, periodic: false }, input)).toBe(input.time / 720)
    expect(sourceSensorValue({ id: 'fade', length: 10, periodic: false }, input)).toBe(1)
    expect(sourceSensorValue({ id: 'fade', length: 10, periodic: true }, input)).toBe(.3)
    expect(() => sourceSensorValue({ id: 'unknown' as SourceSensorLaw['id'] }, input)).toThrow('Unknown')
    expect(() => sourceSensorValue({ id: 'time', length: 0, periodic: false }, input)).toThrow('length')
    expect(() => sourceSensorValue({ id: 'fade', length: 10, periodic: true }, { ...input, dabSequence: .5 })).toThrow('sequence')
  })
})
