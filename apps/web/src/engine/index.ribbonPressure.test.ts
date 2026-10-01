import { expect, it, vi } from 'vitest'
import { createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'
import { RIBBON_FLOATS_PER_VERTEX } from './src/dabs/markerRibbon'

it('uploads ribbon endpoint pressure to a non-origin tile, alongside all other attributes', () => {
  const { engine, canvas } = createTestEngine({ infinite: true }, { width: 64, height: 64 })
  const gl = canvas.getContext('webgl')
  if (!gl) throw new Error('test GL unavailable')
  const upload = vi.spyOn(gl, 'bufferData')
  engine.appendOperation(makeLayerAdd('u', 'L'))
  engine.appendOperation(makeStroke('u', 'L', [dab(1040, 20, { size: 20, pressure: 0.8 }), dab(1080, 20, { size: 20, pressure: 0.2 })], { tool: 'watercolor', preset: 'normal:100:100:PB29:round' }))
  const uploaded: unknown[] = upload.mock.calls.map(call => call[1])
  const bands = uploaded.filter((a): a is Float32Array => a instanceof Float32Array && a.length >= RIBBON_FLOATS_PER_VERTEX * 12 && a.length % RIBBON_FLOATS_PER_VERTEX === 0)
  expect(bands.length).toBeGreaterThan(0)
  const pressures = bands.flatMap(a => Array.from({ length: a.length / RIBBON_FLOATS_PER_VERTEX }, (_, i) => a[i * RIBBON_FLOATS_PER_VERTEX + 9]))
  expect(pressures.some(p => Math.abs(p - 0.8) < 1e-5)).toBe(true)
  expect(pressures.some(p => Math.abs(p - 0.2) < 1e-5)).toBe(true)
  engine.destroy()
})
