// (#595, ADR 015 §5) bakePreview under MockGL.
//
// MockGL never rasterizes the paper-compose or downsample passes (both are
// visual-only, see mockGL.ts's module docstring), so nothing here looks at
// pixel values — the picture itself is checked in a real browser. What these
// tests do pin down is the property the method exists for: the only readback
// is of the small result, sized exactly as previewDownscaleChain says, and it
// is encoded as WebP with a PNG fallback.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, fillStroke, makeLayerAdd } from './testing/engineTestUtils'
import type { MockGL } from './testing/mockGL'
import { previewTargetSize } from './src/previewChain'

type ToBlob = (cb: (blob: Blob | null) => void, type?: string, quality?: number) => void

/** Replaces the harness's stub document with one whose 2D canvas records what
 *  it was asked to encode and answers through `respond`. */
function captureEncoder(respond: (type: string | undefined) => Blob | null) {
  const calls: Array<{ width: number; height: number; type?: string; quality?: number }> = []
  const spy = vi.spyOn(document, 'createElement').mockImplementation((() => {
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ putImageData: () => {} }),
      toBlob: ((cb, type, quality) => {
        calls.push({ width: canvas.width, height: canvas.height, type, quality })
        cb(respond(type))
      }) as ToBlob,
    }
    return canvas
  }) as unknown as typeof document.createElement)
  return { calls, spy }
}

function recordReadbacks(gl: MockGL): Array<{ width: number; height: number }> {
  const reads: Array<{ width: number; height: number }> = []
  const original = gl.readPixels.bind(gl)
  gl.readPixels = (x, y, width, height, format, type, out) => {
    reads.push({ width, height })
    original(x, y, width, height, format, type, out)
  }
  return reads
}

afterEach(() => { vi.restoreAllMocks() })

describe('bakePreview (#595)', () => {
  it('is part of the public API', () => {
    const { engine } = createTestEngine({ userId: 'u' })
    expect(typeof engine.bakePreview).toBe('function')
  })

  it('reads back only the shrunk sheet of a bounded room, and asks for WebP', async () => {
    const { engine, canvas } = createTestEngine({ userId: 'u', pageWidth: 1240, pageHeight: 1754 }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('u', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.appendOperation(fillStroke('u', 'L', 600, 800, 40))

    const reads = recordReadbacks(canvas.getContext('webgl') as MockGL)
    const webp = new Blob([new Uint8Array([1])], { type: 'image/webp' })
    const { calls } = captureEncoder(() => webp)

    await expect(engine.bakePreview()).resolves.toBe(webp)

    const target = previewTargetSize(1240, 1754, 320)
    expect(reads).toEqual([target])
    expect(calls).toEqual([{ ...target, type: 'image/webp', quality: 0.8 }])
  })

  it('honours maxSide and keeps the aspect of an infinite room\'s content bounds', async () => {
    const { engine, canvas } = createTestEngine({ userId: 'u', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('u', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.appendOperation(fillStroke('u', 'L', 100, 512, 8))
    engine.appendOperation(fillStroke('u', 'L', 900, 512, 8))

    const reads = recordReadbacks(canvas.getContext('webgl') as MockGL)
    captureEncoder(() => new Blob([], { type: 'image/webp' }))
    await engine.bakePreview(64)

    expect(reads).toHaveLength(1)
    expect(Math.max(reads[0].width, reads[0].height)).toBe(64)
    expect(reads[0].width).toBeGreaterThan(reads[0].height * 4)
  })

  it('still produces a picture of an empty infinite room (blank paper, viewport-sized)', async () => {
    const { engine, canvas } = createTestEngine({ userId: 'u', infinite: true }, { width: 64, height: 32 })
    const reads = recordReadbacks(canvas.getContext('webgl') as MockGL)
    captureEncoder(() => new Blob([], { type: 'image/webp' }))

    await expect(engine.bakePreview()).resolves.not.toBeNull()
    expect(reads).toEqual([{ width: 64, height: 32 }])
  })

  it('accepts the PNG a browser without a WebP encoder hands back', async () => {
    const { engine } = createTestEngine({ userId: 'u' }, { width: 16, height: 16 })
    const png = new Blob([], { type: 'image/png' })
    const { calls } = captureEncoder(() => png)

    await expect(engine.bakePreview()).resolves.toBe(png)
    expect(calls.map(c => c.type)).toEqual(['image/webp'])
  })

  it('re-encodes as PNG when the WebP request yields nothing usable', async () => {
    const { engine } = createTestEngine({ userId: 'u' }, { width: 16, height: 16 })
    const png = new Blob([], { type: 'image/png' })
    const { calls } = captureEncoder(type => (type === 'image/png' ? png : null))

    await expect(engine.bakePreview()).resolves.toBe(png)
    expect(calls.map(c => c.type)).toEqual(['image/webp', 'image/png'])
  })
})
