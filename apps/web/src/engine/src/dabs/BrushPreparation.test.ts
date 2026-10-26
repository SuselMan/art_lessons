import { installBrushPixels } from '../presets/importedBrushes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { BrushPreparation, brushPreparationBytes, brushPreparationResources, brushTextureResourceKey, brushTipResource } from './BrushPreparation'

let frames: Map<number, FrameRequestCallback>, ordinal: number
const nextFrame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(0)) }
beforeEach(() => {
  frames = new Map(); ordinal = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++ordinal, cb); return ordinal })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => vi.unstubAllGlobals())

describe('selected brush preparation scheduler', () => {
  it('runs at most one upload per frame and reports readiness only after the last', async () => {
    const worker = new BrushPreparation(), first = vi.fn(), second = vi.fn(), progress = vi.fn()
    const pending = worker.run([first, second], { onProgress: progress }, () => true)
    expect(first).not.toHaveBeenCalled()
    nextFrame(); expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled()
    nextFrame(); await expect(pending).resolves.toEqual({ status: 'ready' })
    expect(second).toHaveBeenCalledOnce(); expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
    expect(frames.size).toBe(0)
  })
  it('cancels an old generation before a new selection can upload', async () => {
    const worker = new BrushPreparation(), stale = vi.fn(), current = vi.fn()
    const old = worker.run([stale], {}, () => true), fresh = worker.run([current], {}, () => true)
    await expect(old).resolves.toEqual({ status: 'cancelled' })
    nextFrame(); await fresh
    expect(stale).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledOnce()
  })
  it('aborts between frames without running remaining work', async () => {
    const worker = new BrushPreparation(), controller = new AbortController(), job = vi.fn()
    const pending = worker.run([job, job], { signal: controller.signal }, () => true)
    nextFrame(); controller.abort(); nextFrame()
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
    expect(job).toHaveBeenCalledOnce(); expect(frames.size).toBe(0)
  })
  it('cancels pending work when its context is no longer available', async () => {
    const worker = new BrushPreparation(), job = vi.fn(); let available = true
    const pending = worker.run([job], {}, () => available)
    available = false; nextFrame()
    await expect(pending).resolves.toEqual({ status: 'cancelled' }); expect(job).not.toHaveBeenCalled()
  })
  it('cleans a failed upload and propagates the error', async () => {
    const worker = new BrushPreparation(), bad = () => { throw new Error('upload failed') }
    const pending = worker.run([bad, vi.fn()], {}, () => true)
    nextFrame(); await expect(pending).rejects.toThrow('upload failed'); expect(frames.size).toBe(0)
  })
})

describe('selected brush resource plan', () => {
  it('uses all animation frames and includes the stamp compositor resources only once', () => {
    const brush = structuredClone(digitalBrushFromPreset('hard-round'))
    brush.tip = { ...brush.tip, mask: `asset:${'a'.repeat(64)}`, animation: { mode: 'incremental', frames: [`asset:${'a'.repeat(64)}`, `asset:${'b'.repeat(64)}`] } }
    const resources = brushPreparationResources(brush)
    expect(resources).toEqual([
      { painter: 'stamp', id: `asset:${'a'.repeat(64)}`, grain: false }, { painter: 'stamp', id: `asset:${'b'.repeat(64)}`, grain: false },
      { painter: 'stamp', id: 'cloud', grain: true }, { painter: 'stamp', id: 'grit', grain: true },
    ])
    expect(brushPreparationBytes(resources, () => 256)).toBe(4 * 349524)
  })
  it('routes independent mixer children through stamp resources, but local dual tips through wet', () => {
    const child = structuredClone(digitalBrushFromPreset('hard-round')); child.tip = { ...child.tip, mask: 'rough' }; child.texture = { id: 'dry', strength: 1, periodPx: 32 }
    const parent = structuredClone(digitalBrushFromPreset('hard-round')); parent.model = 'mixer'; parent.tip = { ...parent.tip, mask: 'chalk' }
    parent.behavior = { version: 2, dual: { brush: child, sampling: 'independent', blendMode: 'multiply' } }
    expect(brushPreparationResources(parent)).toContainEqual({ painter: 'stamp', id: 'dry', grain: true })
    expect(brushPreparationResources(parent)).toContainEqual({ painter: 'wet', id: 'chalk', grain: false })
    delete parent.behavior.dual!.sampling
    const local = brushPreparationResources(parent)
    expect(local).toContainEqual({ painter: 'wet', id: 'rough', grain: false })
    expect(local.some(r => r.id === 'dry')).toBe(false)
    expect(local.some(r => r.painter === 'stamp')).toBe(false)
  })
})

it('plans one packed variant for each alpha/gray pair, not duplicate old-format alpha textures',()=>{
  const brush=structuredClone(digitalBrushFromPreset('hard-round'))
  const alpha=`asset:${'a'.repeat(64)}` as const,g1=`asset:${'b'.repeat(64)}` as const,g2=`asset:${'c'.repeat(64)}` as const
  brush.tip={...brush.tip,mask:alpha,animation:{mode:'incremental',frames:[alpha,alpha]},material:{kind:'lightness',gray:g1,grayFrames:[g1,g2],strength:1}}
  installBrushPixels(alpha,new Uint8Array(4));installBrushPixels(g1,new Uint8Array(4));installBrushPixels(g2,new Uint8Array(4))
  const resources=brushPreparationResources(brush).filter(r=>!r.grain)
  expect(resources).toHaveLength(1)
  expect(resources[0].materialGroup?.format).toBe('rgba')
  const first=brushTipResource(alpha,g1,brush.tip),second=brushTipResource(alpha,g2,brush.tip)
  expect(brushTextureResourceKey(first)).toBe(brushTextureResourceKey(second))
  expect(first.materialChannels).toBe('rg');expect(second.materialChannels).toBe('ba')
  expect(brushPreparationBytes(resources,()=>2)).toBe(20)
  brush.model='mixer'
  expect(()=>brushPreparationResources(brush)).toThrow('stamp renderer')
})
