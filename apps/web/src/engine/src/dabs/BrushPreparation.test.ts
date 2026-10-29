import { installBrushPixels } from '../presets/importedBrushes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { BrushPreparation, brushTextureLeaseResources, brushTextureLeasePlan, brushPreparationBytes, brushPreparationResources, brushTextureResourceKey, brushTipResource } from './BrushPreparation'

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
    const old = worker.run([stale], {}, () => true,'preset-a'), fresh = worker.run([current], {}, () => true,'preset-b')
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

it('rejects procedural masks on wet samplers before scheduling any upload',()=>{
  const brush=structuredClone(digitalBrushFromPreset('hard-round'))
  brush.tip.profile={kind:'gaussian',fade:1e-6,antialias:true}
  brush.behavior={version:2}
  const prepared=brushPreparationResources(brush)
  expect(prepared.every(resource=>resource.painter==='stamp')).toBe(true)
  expect(prepared.some(resource=>!resource.grain)).toBe(false)
  const wet=structuredClone(brush);wet.model='mixer';wet.mixer={load:1,pickup:1,strength:1}
  expect(()=>brushPreparationResources(wet)).toThrow('Procedural tip profile requires the stamp renderer')
  delete wet.tip.profile
  wet.behavior={version:2,dual:{brush,blendMode:'multiply'}}
  expect(()=>brushPreparationResources(wet)).toThrow('Procedural dual profile requires the stamp renderer')
})

it('reuses a paint-local plan for both roles while observing nested changes on the next paint', () => {
  const brush = structuredClone(digitalBrushFromPreset('hard-round'))
  brush.model = 'mixer'
  brush.tip.mask = 'chalk'
  const child = structuredClone(digitalBrushFromPreset('hard-round'))
  child.tip.mask = 'rough'
  brush.behavior = {version:2,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
  const first = brushPreparationResources(brush)
  expect(brushTextureLeasePlan(first,'wet')).toEqual(brushTextureLeaseResources(brush,'wet'))
  expect(brushTextureLeasePlan(first,'stamp').some(r=>r.key==='t:rough')).toBe(true)
  child.tip.mask = 'chalk'
  brush.tip.mask = 'rough'
  const second = brushPreparationResources(brush)
  expect(brushTextureLeasePlan(first,'wet').some(r=>r.key==='t:chalk')).toBe(true)
  expect(brushTextureLeasePlan(second,'wet').some(r=>r.key==='t:rough')).toBe(true)
  expect(brushTextureLeasePlan(second,'stamp').some(r=>r.key==='t:chalk')).toBe(true)
  const stampBrush = {...brush,model:'stamp' as const}
  expect(brushTextureLeasePlan(brushPreparationResources(stampBrush),'stamp')).toEqual(brushTextureLeaseResources(brush,'stamp'))
})

describe('shared same-preset preparation subscribers',()=>{
  it('joins after one upload, sharing remaining work and independent progress snapshots',async()=>{
    const worker=new BrushPreparation(),job=vi.fn(),firstProgress=vi.fn(),secondProgress=vi.fn()
    const first=worker.run([job,job,job],{onProgress:firstProgress},()=>true,'preset-a')
    nextFrame()
    const second=worker.run([()=>{throw Error('Joined work must not replace the active bank')}],{onProgress:secondProgress},()=>true,'preset-a')
    nextFrame();nextFrame()
    await expect(first).resolves.toEqual({status:'ready'});await expect(second).resolves.toEqual({status:'ready'})
    expect(job).toHaveBeenCalledTimes(3)
    expect(firstProgress.mock.calls).toEqual([[1,3],[2,3],[3,3]])
    expect(secondProgress.mock.calls).toEqual([[1,3],[2,3],[3,3]])
  })
  it.each([0,1])('aborts subscriber%s without cancelling the other or continuing its notifications',async aborted=>{
    const worker=new BrushPreparation(),signals=[new AbortController(),new AbortController()],progress=[vi.fn(),vi.fn()],job=vi.fn()
    const pending=signals.map((signal,i)=>worker.run([job,job],{signal:signal.signal,onProgress:progress[i]},()=>true,'preset-a'))
    nextFrame();signals[aborted].abort();nextFrame()
    expect(await Promise.all(pending)).toEqual(aborted===0?[{status:'cancelled'},{status:'ready'}]:[{status:'ready'},{status:'cancelled'}])
    expect(progress[aborted]).toHaveBeenCalledTimes(1);expect(progress[1-aborted]).toHaveBeenCalledTimes(2)
    expect(job).toHaveBeenCalledTimes(2)
  })
  it('removes the last scheduled frame when all subscribers abort and allows a fresh run',async()=>{
    const worker=new BrushPreparation(),a=new AbortController(),b=new AbortController(),job=vi.fn()
    const first=worker.run([job,job],{signal:a.signal},()=>true,'preset-a'),second=worker.run([job],{signal:b.signal},()=>true,'preset-a')
    a.abort();expect(frames.size).toBe(1);b.abort();expect(frames.size).toBe(0)
    expect(await Promise.all([first,second])).toEqual([{status:'cancelled'},{status:'cancelled'}])
    nextFrame();expect(job).not.toHaveBeenCalled()
    const retry=worker.run([job],{},()=>true,'preset-a');nextFrame();await expect(retry).resolves.toEqual({status:'ready'})
    expect(job).toHaveBeenCalledOnce()
  })
  it('keeps other subscribers alive if a progress observer throws',async()=>{
    const worker=new BrushPreparation(),job=vi.fn()
    const bad=worker.run([job,job],{onProgress:()=>{throw Error('observer failed')}},()=>true,'preset-a')
    const rejected=expect(bad).rejects.toThrow('observer failed')
    const healthy=worker.run([job],{},()=>true,'preset-a')
    nextFrame();nextFrame();await rejected;await expect(healthy).resolves.toEqual({status:'ready'})
    expect(job).toHaveBeenCalledTimes(2)
  })
})

it('cancels all shared subscribers when the preparation context becomes unavailable',async()=>{
  const worker=new BrushPreparation(),job=vi.fn();let available=true
  const first=worker.run([job,job],{},()=>available,'preset-a'),second=worker.run([job],{},()=>available,'preset-a')
  available=false;nextFrame()
  expect(await Promise.all([first,second])).toEqual([{status:'cancelled'},{status:'cancelled'}])
  expect(frames.size).toBe(0);expect(job).not.toHaveBeenCalled()
})
