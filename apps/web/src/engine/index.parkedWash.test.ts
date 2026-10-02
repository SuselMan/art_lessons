import { Buffer } from 'node:buffer'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import type { ILayerBuffer } from './src/buffers/ILayerBuffer'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'

const keys = ['original', 'coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled', 'inkDry', 'colorDry'] as const
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type Entry = Record<typeof keys[number], AccumulationBuffer | null>
type Scratch = { _tiles: Map<AccumulationBuffer, Entry>; _storageBounds: Bounds; releaseFilm(): void }
type Internal = {
  gl: WebGLRenderingContext; _completeSettle(): void; _evictChunk(key: string, keep: boolean): void;
  _startSpill(key: string): void; _cancelSpillJob(): void; _spillJob: unknown;
  _replayRibbonChunks: Map<string, { scratch: Scratch; target: ILayerBuffer }>;
  _spilledWashes: Map<string, { spill: { bytes: number } }>;
  _ribbonScratchPool: { acquire(w: number, h: number): AccumulationBuffer; bytes: { live: number; free: number } };
  _replayChunkScratch(target: ILayerBuffer, stroke: string, wash: string, dabs: unknown[], profile: unknown): { scratch: Scratch } | null;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function setup(edge = 1024) {
  const { engine } = createTestEngine({ userId: 'host', pageWidth: edge, pageHeight: edge }, { width: 512, height: 512 })
  const I = engine as unknown as Internal
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('host', 'L'), 'remote')
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  engine.appendOperation(makeStroke('peer', 'L', [dab(200, 200, { size: 8 }), dab(220, 204, { size: 8 })], {
    tool: 'watercolor', preset: 'normal:55:60:PB29:round', strokeId: 's1', washId: 'w1',
  }), 'remote')
  I._completeSettle()
  const chunk = I._replayRibbonChunks.get('w1')!
  chunk.scratch.releaseFilm()
  return { engine, I, chunk }
}

it.each([{ edge: 1024, compact: true }, { edge: 512, compact: false }])('parks and restores all eight buffers without CPU readback ($edge)', async ({ edge, compact }) => {
  const { engine, I, chunk } = await setup(edge)
  try {
    const snapshots = new Map<string, Uint8Array>()
    const bounds = chunk.scratch._storageBounds
    for (const [tile, entry] of chunk.scratch._tiles) {
      for (const [ki, k] of keys.entries()) {
        const b = entry[k] ??= I._ribbonScratchPool.acquire(tile.width, tile.height)
        const pixels = new Uint8Array(b.width * b.height * 4)
        // Original includes data far outside the wash. Other buffers have
        // tagged data right at the stored boundary. MockGL models alpha
        // only; real-GPU QA also checks RGB under zero alpha.
        for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
          // MockGL texture arrays use logical top-down rows. Native
          // WebGL regressions separately cover bottom-up placement.
          const wy = y
          if (k !== 'original' && (x < Math.floor(bounds.minX) || x >= Math.ceil(bounds.maxX)
            || wy < Math.floor(bounds.minY) || wy >= Math.ceil(bounds.maxY))) continue
          const i = (y * b.width + x) * 4
          pixels[i] = (x + ki * 17) % 256; pixels[i + 1] = (wy + ki * 29) % 256
          pixels[i + 2] = (x * 3 + wy * 7) % 256; pixels[i + 3] = x % 3 ? 121 : 0
        }
        b.writePixels(pixels)
        snapshots.set(k, b.readPixels())
      }
    }
    const read = vi.spyOn(I.gl, 'readPixels')
    I._evictChunk('w1', true)
    expect(read).not.toHaveBeenCalled()
    const parked = I._spilledWashes.get('w1')!
    if (compact) expect(parked.spill.bytes).toBeLessThan(edge * edge * 4 * 8)
    else expect(parked.spill.bytes).toBe(edge * edge * 4 * 8)
    const restored = I._replayChunkScratch(chunk.target, 's2', 'w1', [dab(400, 400)], {})!
    expect(read).not.toHaveBeenCalled()
    expect(I._spilledWashes.has('w1')).toBe(false)
    for (const entry of restored.scratch._tiles.values()) for (const k of keys) {
      const actual = entry[k]!.readPixels(), expected = snapshots.get(k)!
      const first = actual.findIndex((v, i) => v !== expected[i])
      expect(first, k + ' first differing byte').toBe(-1)
      expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    }
  } finally { engine.destroy() }
})

it('cancelling a partially parked wash releases its copies without losing the live state', async () => {
  const { engine, I, chunk } = await setup()
  try {
    vi.useFakeTimers()
    let clock = performance.now()
    vi.spyOn(performance, 'now').mockImplementation(() => clock += 10)
    const live = I._ribbonScratchPool.bytes.live
    I._startSpill('w1')
    vi.advanceTimersByTime(1)
    expect(I._spillJob).toBeTruthy()
    expect(I._ribbonScratchPool.bytes.live).toBeGreaterThan(live)
    I._cancelSpillJob()
    expect(I._ribbonScratchPool.bytes.live).toBe(live)
    expect(I._replayRibbonChunks.get('w1')).toBe(chunk)
    expect(I._spilledWashes.size).toBe(0)
  } finally { engine.destroy() }
})
