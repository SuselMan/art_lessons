// Engine-level tests for the digital brush's stamp model and mixer (#573,
// ADR 013 §11).
//
// Same honest limit index.digitalBrush.test.ts states: MockGL never runs the
// GLSL, so the ceiling's MAX channel, the bitmap masks and the screentone are
// not visible here as pixels. What is: which programs a stroke goes through,
// what each stamp is handed, that the scatter is a pure function of the
// operation, and that the recorded switches — not the live ones — decide the
// mark. The visual half is browser QA.
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import { digitalBrushFromPreset, digitalBrushPreset } from './src/digitalBrushPresets'
import {
  createTestEngine, dab, makeLayerAdd, makeStroke, readLayerPixels, expectPixelsEqual,
  markerPassDraw, paperReady, simulateStroke, brushDraws,
} from './testing/engineTestUtils'

function setupLayer(width = 96, height = 64) {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width, height })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

function current(id: string, pressure?: { size?: boolean; opacity?: boolean }): string {
  const brush = digitalBrushFromPreset(id)
  return digitalBrushPreset(brush.id, brush.version, pressure)
}

function line(pressure = 0.5, size = 20) {
  return [16, 28, 40, 52, 64, 76].map(x => dab(x, 32, { size, pressure }))
}

function stamps(engine: PencilEngine) {
  return brushDraws(engine).filter(d => d.kind === 'stamp').map(d => d.uniforms)
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

describe('digital brush, stamp model (#573)', () => {
  it('paints through its own programs and never through DAB_FRAG', () => {
    // The v1 modes (10 stamp, 8 composite) must stay reserved for @1 strokes:
    // a live brush falling back to them would draw with no ceiling, no tip and
    // no scatter, and nothing would error.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', line(), { tool: 'digitalBrush', preset: current('medium-round') }))
    expect(stamps(engine).length).toBeGreaterThan(0)
    expect(brushDraws(engine).some(d => d.kind === 'composite')).toBe(true)
    expect(markerPassDraw(engine, 10)).toBeUndefined()
    expect(markerPassDraw(engine, 8)).toBeUndefined()
  })

  it('still sends an @1 stroke through the renderer it was drawn with', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', line(), { tool: 'digitalBrush', preset: 'brush:medium-round@1' }))
    expect(markerPassDraw(engine, 10)).toBeDefined()
    expect(stamps(engine)).toHaveLength(0)
  })

  it('hands each stamp a pressure ceiling when the opacity switch is on, and 1 when it is off', () => {
    const ceilingAt = (preset: string, pressure: number): number => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', line(pressure), { tool: 'digitalBrush', preset }))
      return stamps(engine)[0].get('u_ceiling') as number
    }
    const on = current('soft-round')
    const off = current('soft-round', { opacity: false })
    expect(ceilingAt(on, 0.15)).toBeLessThan(ceilingAt(on, 0.95))
    expect(ceilingAt(on, 0.15)).toBeLessThan(0.5)
    expect(ceilingAt(off, 0.15)).toBe(1)
    expect(ceilingAt(off, 0.95)).toBe(1)
  })

  it('keeps flow and the ceiling apart: flow does not follow pressure', () => {
    // The ceiling is where pressure acts. If flow followed it too, a light
    // stroke would be doubly light and the switch would not mean what it says.
    const flowAt = (pressure: number): number => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', line(pressure), { tool: 'digitalBrush', preset: current('soft-round') }))
      return stamps(engine)[2].get('u_opacity') as number
    }
    expect(flowAt(0.15)).toBeCloseTo(flowAt(0.95), 6)
  })

  it('lets pressure drive the size only while the size switch is on', async () => {
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('digitalBrush')
    engine.setSize(30)
    const sizesFor = (preset: string, pressure: number): number => {
      engine.setPencil(preset)
      simulateStroke(engine, [{ x: 8, y: 32 }, { x: 48, y: 32 }, { x: 88, y: 32 }], { pressure })
      const dabs = strokeDabs(lastStroke(engine))
      return dabs[dabs.length - 1].size
    }
    const on = current('hard-round')
    const off = current('hard-round', { size: false })
    expect(sizesFor(on, 0.15)).toBeLessThan(sizesFor(on, 1) * 0.6)
    expect(sizesFor(off, 0.15)).toBeCloseTo(sizesFor(off, 1), 3)
    expect(lastStroke(engine).preset).toMatch(/:fixed$/)
  })

  it('throws the same splatter for the same operation, on every client', () => {
    // ADR 013 §6: the scatter is seeded by the dab, so two engines replaying
    // one operation must hand the GPU identical stamps — or the teacher and the
    // student are looking at different drops.
    const op = makeStroke('user-a', 'L', line(0.8, 30), { tool: 'digitalBrush', preset: current('splatter') })
    const a = setupLayer()
    a.appendOperation(op)
    const b = setupLayer()
    b.appendOperation(op)
    const key = (u: Map<string, unknown>) => JSON.stringify([u.get('u_dabCenter'), u.get('u_dabRadius'), u.get('u_opacity')])
    const sa = stamps(a).map(key)
    expect(sa.length).toBeGreaterThan(line().length) // several drops per dab
    expect(stamps(b).map(key)).toEqual(sa)
    // …and they really are scattered, not stacked on the path.
    const ys = stamps(a).map(u => (u.get('u_dabCenter') as number[])[1])
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4)
  })

  it('throws the same splatter whether the dabs arrive as doubles or as the float32 the log stores', () => {
    // The live client paints the unrounded doubles; everyone else paints what
    // dabCodec unpacked. The seed hashes the float32 bits, so both agree.
    const raw = line(0.8, 30).map((d, i) => ({ ...d, x: d.x + 0.1234567891 * (i + 1), y: d.y + 0.000000123 }))
    const rounded = raw.map(d => ({ ...d, x: Math.fround(d.x), y: Math.fround(d.y), pressure: Math.fround(d.pressure) }))
    const offsets = (dabs: typeof raw) => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'digitalBrush', preset: current('splatter') }))
      return stamps(engine).map(u => (u.get('u_dabRadius') as number).toFixed(9))
    }
    expect(offsets(rounded)).toEqual(offsets(raw))
  })

  it('binds a bitmap tip for a textured brush and the procedural ramp for a round one', () => {
    const tipKind = (id: string): number => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', line(), { tool: 'digitalBrush', preset: current(id) }))
      return stamps(engine)[0].get('u_tipKind') as number
    }
    expect(tipKind('chalk')).toBe(1)
    expect(tipKind('bristle')).toBe(1)
    expect(tipKind('hard-round')).toBe(0)
  })

  it('hands the paper term only to the brushes that ride the tooth', () => {
    const paper = (id: string): number => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', line(), { tool: 'digitalBrush', preset: current(id) }))
      return stamps(engine)[0].get('u_paper') as number
    }
    expect(paper('chalk')).toBeGreaterThan(0.5)
    expect(paper('hard-round')).toBe(0)
  })

  it('reduces the screentone origin to one period, so the GPU never sees a large number', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', line(), { tool: 'digitalBrush', preset: current('screentone') }))
    const composite = brushDraws(engine).find(d => d.kind === 'composite')!.uniforms
    const pitch = composite.get('u_screentone') as number
    expect(pitch).toBeGreaterThan(0)
    for (const v of composite.get('u_screenOrigin') as number[]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(pitch * 2)
    }
  })

  it('is a pure function of its operation', async () => {
    const op = makeStroke('user-a', 'L', line(0.7, 24), { tool: 'digitalBrush', preset: current('foliage') })
    const a = setupLayer()
    await paperReady(a)
    a.appendOperation(op)
    const first = readLayerPixels(a, 'L')!
    expect(first.some(v => v > 0)).toBe(true)
    const b = setupLayer()
    await paperReady(b)
    b.appendOperation(op)
    expectPixelsEqual(readLayerPixels(b, 'L'), first)
  })
})

describe('digital brush, mixer (#573)', () => {
  it('paints through the smudge imprint with its own colour loaded into it', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', line(0.9, 20), {
      tool: 'digitalBrush', preset: current('mixer'), color: [0.8, 0.1, 0.1],
    }))
    // No stamp-model draws at all — it is the smudge route or nothing.
    expect(stamps(engine)).toHaveLength(0)
    // And it put paint down on a blank layer, which a plain smudge never can:
    // there is nothing under the stump to smear.
    expect(readLayerPixels(engine, 'L')!.some(v => v > 0)).toBe(true)
  })

  it('lays nothing with the smudge tool on the same blank layer — the paint is the mixer’s own', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', line(0.9, 20), { tool: 'smudge', preset: 'smudge' }))
    expect(readLayerPixels(engine, 'L')!.every(v => v === 0)).toBe(true)
  })
})
