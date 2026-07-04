// Shared scaffolding for engine-level integration tests (#101): a fake
// <canvas>-like object backed by MockGL (see ./mockGL.ts), a real
// PencilEngine constructed against it, and small builders for the
// structural/pixel Operations these tests append directly via
// `appendOperation` — bypassing PointerInput entirely, the same way a
// `room_state` replay or a `peer_operation` would (see the docstring on
// `appendOperation` in engine/index.ts: it is deliberately origin-agnostic).

import { nanoid } from 'nanoid'
import type { Dab, LayerAddOperation, LayerDeleteOperation, LayerMergeOperation, StrokeOperation } from '@art-lessons/shared'

import { PencilEngine, type PencilEngineOptions } from '../index'
import type { AccumulationBuffer } from '../src/AccumulationBuffer'
import { MockGL } from './mockGL'

// jsdom is not used (vitest env is 'node' — see root vitest.config.ts), so
// rAF/cancelAnimationFrame don't exist; PencilEngine's constructor/destroy
// call them unconditionally. Stub once, process-wide.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number): void => clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame
}

interface FakeCanvas {
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  style: Record<string, string>
  getContext: (type: string) => MockGL | null
  addEventListener: () => void
  removeEventListener: () => void
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
  setPointerCapture: () => void
  toBlob: (cb: (b: Blob | null) => void) => void
}

/** A canvas-shaped object good enough for PencilEngine's constructor and
 *  PointerInput — real pointer events are never dispatched in these tests
 *  (structural/pixel ops are appended directly), so the handlers here just
 *  need to exist, not do anything. */
function createMockCanvas(width: number, height: number): FakeCanvas {
  const gl = new MockGL()
  return {
    width, height, clientWidth: width, clientHeight: height,
    style: {},
    getContext: () => gl,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setPointerCapture: () => {},
    toBlob: cb => cb(null),
  }
}

export interface TestEngine {
  engine: PencilEngine
  canvas: FakeCanvas
}

export function createTestEngine(
  options: PencilEngineOptions = {},
  size: { width?: number; height?: number } = {},
): TestEngine {
  const { width = 8, height = 8 } = size
  const canvas = createMockCanvas(width, height)
  const engine = new PencilEngine(canvas as unknown as HTMLCanvasElement, options)
  return { engine, canvas }
}

// ─── White-box access ──────────────────────────────────────────────────────
//
// PencilEngineAPI intentionally exposes no buffer/checkpoint read access —
// there is no product reason a caller would need it. These tests are
// specifically about the private replay/checkpoint machinery (#101), so they
// reach past the public API on purpose. One centralized, documented cast
// beats scattering `as any` through every test.

interface EngineInternals {
  _layers: Map<string, AccumulationBuffer>
  _checkpoints: Array<{ layerId: string; opIds: string[]; pixels: Uint8Array }>
}

function internals(engine: PencilEngine): EngineInternals {
  return engine as unknown as EngineInternals
}

export function hasLayerBuffer(engine: PencilEngine, layerId: string): boolean {
  return internals(engine)._layers.has(layerId)
}

export function readLayerPixels(engine: PencilEngine, layerId: string): Uint8Array | null {
  const buf = internals(engine)._layers.get(layerId)
  return buf ? buf.readPixels() : null
}

export function checkpointCountFor(engine: PencilEngine, layerId: string): number {
  return internals(engine)._checkpoints.filter(cp => cp.layerId === layerId).length
}

// ─── Operation builders ─────────────────────────────────────────────────────

let seqCounter = 0
function nextTimestamp(): number { return ++seqCounter }

export function dab(x: number, y: number, overrides: Partial<Dab> = {}): Dab {
  return {
    x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 4, aspectRatio: 1, angle: 0, opacity: 1,
    ...overrides,
  }
}

export function makeStroke(
  userId: string, layerId: string, dabs: Dab[], overrides: Partial<StrokeOperation> = {},
): StrokeOperation {
  return {
    id: nanoid(10), type: 'stroke', userId, timestamp: nextTimestamp(),
    layerId, tool: 'pencil', preset: 'HB', dabs,
    ...overrides,
  }
}

export function makeLayerAdd(userId: string, layerId: string, name = 'Layer', overrides: Partial<LayerAddOperation> = {}): LayerAddOperation {
  return { id: nanoid(10), type: 'layer_add', userId, timestamp: nextTimestamp(), layerId, name, ...overrides }
}

export function makeLayerDelete(userId: string, layerIds: string[], overrides: Partial<LayerDeleteOperation> = {}): LayerDeleteOperation {
  return { id: nanoid(10), type: 'layer_delete', userId, timestamp: nextTimestamp(), layerIds, ...overrides }
}

export function makeLayerMerge(
  userId: string, layerId: string, sources: Array<{ id: string; opacity: number }>,
  overrides: Partial<LayerMergeOperation> = {},
): LayerMergeOperation {
  return {
    id: nanoid(10), type: 'layer_merge', userId, timestamp: nextTimestamp(),
    layerId, name: 'Merged', sources, parentId: null, index: 0,
    ...overrides,
  }
}

/** A single dab, centered, that paints a fully-opaque disc covering the
 *  whole test canvas (given the small canvas sizes used in these tests). */
export function fillStroke(userId: string, layerId: string, cx: number, cy: number, radius: number): StrokeOperation {
  return makeStroke(userId, layerId, [dab(cx, cy, { size: radius * 2, pressure: 1, opacity: 1 })])
}
