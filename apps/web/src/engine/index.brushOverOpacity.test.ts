import { expect, it } from 'vitest'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'

it('places operation opacity on every OVER dab, including later chunks, without a final stroke ceiling', () => {
  const descriptor = {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${'c'.repeat(24)}`, version: 122,
    flow: .33, opacity: .15, paperInteraction: 0,
    opacityByPressure: [[0, 1], [1, 1]] as Array<[number, number]>,
    behavior: { version: 2 as const, rendering: {
      accumulation: 'directOver' as const, mode: 'buildUp' as const, blendMode: 'normal' as const,
      wetEdges: 0, burntEdges: 0, burntEdgesMode: 'multiply' as const,
    } },
  }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Authored OVER', source: 'qa', warnings: [], descriptor }], assets: [], skipped: [] })
  const { engine } = createTestEngine({ userId: 'over-owner' }, { width: 64, height: 64 })
  try {
    Object.assign(engine['gl'], { blendColor: () => {} })
    engine.appendOperation(makeLayerAdd('over-owner', 'ink'))
    for (let i = 0; i < 2; i++) engine.appendOperation(makeStroke('over-owner', 'ink', [dab(24 + i * 4, 32, { pressure: 1, opacity: .15 })], {
      tool: 'digitalBrush', preset: `brush:${descriptor.id}@122`, strokeId: 'one-gesture', ...(i === 1 ? {strokeEnd: true as const} : {}),
    }), 'remote')
    const draws = brushDraws(engine)
    const stamps = draws.filter(d => d.kind === 'stamp')
    expect(stamps.length).toBeGreaterThanOrEqual(2)
    for (const stamp of stamps) expect(stamp.uniforms.get('u_ceiling')).toBeCloseTo(.15)
    const composites = draws.filter(d => d.kind === 'composite')
    expect(composites.length).toBeGreaterThan(0)
    for (const composite of composites) expect(composite.uniforms.get('u_opacity')).toBe(1)
  } finally { engine.destroy() }
})
