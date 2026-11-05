import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'

// Check the actual pickup-program inputs, not MockGL's approximate wet pixels.
it.each([0, 0.2, 1, undefined])('honours mixer foreground load %s in a recorded stroke', async initialLoad => {
  const load = initialLoad ?? 0.2
  const descriptor: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'),
    id: `imported-${(initialLoad === undefined ? 999 : 900 + Math.round(load * 10)).toString(16).padStart(24, '0')}`,
    version: 7, model: 'mixer', mixer: { load, pickup: 1, strength: 1, ...(initialLoad === undefined ? {} : { initialLoad, smearAlpha: true }) },
    behavior: { version: 2 },
  }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Mixer load witness', source: 'qa', warnings: [], descriptor }], assets: [], skipped: [] })
  const { engine } = createTestEngine({}, { width: 96, height: 64 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const uniform = vi.spyOn(engine['gl'], 'uniform1f')
    const operation = makeStroke('peer', 'ink', [16, 32, 48, 64].map(x => dab(x, 32, { size: 20, pressure: 1 })), {
      tool: 'digitalBrush', preset: `brush:${descriptor.id}@7`, color: [1, 0, 0], strokeEnd: true,
    })
    engine.appendOperation(operation, 'remote')
    const values = (name: string) => uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === name).map(([, value]) => value)
    const loads = values('u_paintLoad')
    expect(loads.length).toBeGreaterThan(1)
    expect(loads[0]).toBe(initialLoad ?? 0.85)
    if (load === 0) expect(loads.every(value => value === 0)).toBe(true)
    // First contact samples the canvas even if later pickup is distance based.
    expect(values('u_rate')[0]).toBe(1)
    expect(values('u_alphaPickup').every(value => value === (initialLoad === undefined ? 1 : 0))).toBe(true)
  } finally { engine.destroy() }
})
