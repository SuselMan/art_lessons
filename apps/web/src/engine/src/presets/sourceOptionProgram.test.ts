import { describe, expect, it } from 'vitest'
import stock from './fixtures/sourceOptionPrograms.stock.json'
import curves from './fixtures/sourceCurves.native.json'
import packets from './fixtures/sourceSensors.native.json'
import oracle from './fixtures/sourceOptionPrograms.native.json'
import { KritaPerStrokeRandomSource, KritaRandomSource } from './nativeRandom'
import { sourceOptionComponents, sourceRotationLike, sourceSizeLike, type SourceSensorId } from './sourceOption'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
const programs = stock.presets.map(preset => preset.options.map(option => compileSourceOptionProgram({
  ...option,
  sensors: option.sensors.map(sensor => {
    const curve = curves.curves[sensor.curveIndex]
    return { ...sensor, id: sensor.id as SourceSensorId, curve: {
      points: curve.points.map(p => ({ x: p[0] as number, y: p[1] as number })),
      coefficients: curve.coefficients as [number, number, number, number][],
    } }
  }),
})))
describe('compiled native option programs from actual stock input data', () => {
  it('matches composed actual native method oracle for567 stock-option/packet cases exactly', () => {
    for (const row of oracle.cases) {
      const input = packets.cases[row.packet].input
      const option = programs[row.preset][row.option].bind(input)
      const context = { random: new KritaRandomSource(0), perStroke: new KritaPerStrokeRandomSource(0), hover: input.hover }
      const c = sourceOptionComponents(option, context)
      expect([sourceSizeLike(c), sourceRotationLike(c, -.17, false, -1, input.hover), context.random.snapshot().draws], JSON.stringify(row)).toEqual(row.output)
    }
  })
  it('does not cache packet-dependent sensor values or replace keyed option identity', () => {
    const timePreset = stock.presets.findIndex(p => p.index === 108)
    const optionIndex = stock.presets[timePreset].options.findIndex(o => o.id === 'Size')
    const program = programs[timePreset][optionIndex]
    const input = { ...packets.cases[1].input, hover: false }
    const first = program.bind({ ...input, time: 0 })
    const next = program.bind({ ...input, time: 360 })
    expect(first.sensors.find(s => s.id === 'time')?.parameter).toBe(0)
    expect(next.sensors.find(s => s.id === 'time')?.parameter).toBe(.5)
    expect(first.id).toBe('Size')
  })
  it('preserves native additive tilt direction and always-checked Opacity/Flow inputs', () => {
    const preset = stock.presets.findIndex(p => p.index === 110)
    const rotation = stock.presets[preset].options.findIndex(o => o.id === 'Rotation')
    expect(programs[preset][rotation].bind(packets.cases[1].input).sensors.find(s => s.id === 'tiltDirection')?.kind).toBe('additive')
    expect(stock.presets.every(p => p.options.filter(o => ['Opacity', 'Flow'].includes(o.id)).every(o => o.checked))).toBe(true)
  })
  it('rejects missing solver output, unknown sensors and duplicate source slots before author RNG exists', () => {
    const base: SourceOptionProgramInput = { id: 'Size', checked: true, useCurve: true, curveMode: 0, strength: 1, min: 0, max: 1,
      sensors: [{ id: 'pressure', curve: { points: [{ x: 0, y: 0 }, { x: 1, y: .5 }] } }] }
    expect(() => compileSourceOptionProgram(base)).toThrow('spline')
    const identity = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
    expect(() => compileSourceOptionProgram({ ...base, sensors: [{ id: 'unknown' as SourceSensorId, curve: identity }] })).toThrow('Unknown')
    const sensor = { id: 'pressure' as const, curve: identity }
    expect(() => compileSourceOptionProgram({ ...base, sensors: [sensor, sensor] })).toThrow('duplicate')
  })
})
