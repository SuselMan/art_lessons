import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { ribbonProfileFor } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import { createPuddleTarget, type PuddleMaterial } from './target'
import { createPuddlePresentation } from './presentation'

/** Disposable mini-stand wiring only. All engine interception is restored. */
// The prototype intentionally probes private engine seams, outside product API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installMiniPuddle(engine: any, size: number, mode: 'morph' | 'material', onStatus: (message: string) => void = () => {}) {
  const gl: WebGLRenderingContext = engine.gl
  const bounds = { minX: 0, minY: 0, maxX: size, maxY: size }
  const target = createPuddleTarget(gl, size)
  const presentation = mode === 'morph' ? createPuddlePresentation(gl, size) : null
  const make = () => new AccumulationBuffer(gl, size, size)
  const rawBefore = make(), rawAfter = make(), targetRGBA = make(), blank = make()
  const before: PuddleMaterial = { p: make(), c: make(), coverage: make() }
  const owned = [rawBefore, rawAfter, targetRGBA, blank, ...Object.values(before)]
  gl.disable(gl.SCISSOR_TEST)
  for (const buffer of owned) buffer.clear()
  let epoch = 0, raf = 0, lastAt = 0, active = false, down = false, drying = false, destroyed = false
  let published = -1, cancellations = 0, inputs = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any = null
  const hooks = ['_onStart', '_onEnd', '_paintStrokeDabs', '_display', '_finishRibbonStroke', '_scheduleDryingRepaint', '_revealWash'] as const
  const original = new Map(hooks.map(name => [name, engine[name]]))
  const originalPrepare = engine._settlePlan.prepare
  const scratch = () => engine._ribbonStrokeScratch ?? engine._wash?.scratch
  const locate = () => {
    const s = scratch(), ctx = s?.finishContext
    const tile = ctx ? engine._resolveWithinSheet(ctx.target, bounds)[0] : s ? [...s.tileEntries()][0]?.[0] : null
    const t = tile?.buffer ? tile : tile ? { buffer: tile, originX: 0, originY: 0, contentRect: bounds } : null
    return s && t ? { scratch: s, tile: t, entry: s.peek(t.buffer) } : null
  }
  function captureContext() {
    const s = scratch(), lc = engine._liveComposite
    if (lc?.scratch === s) context = { ...lc }
    if (!context && s?.finishContext) {
      const c = s.finishContext
      context = { ...c, fringeWater: 0, spreadPx: 0, migratePx: 0, inkSmoothPx: 0, strokeDir: [1, 0], bristleRadiusPx: 0 }
    }
    if (!context && s) context = {
      preset: engine._resolvePreset('watercolor', engine._strokePreset),
      profile: ribbonProfileFor('watercolor', engine._strokePreset),
      color: engine._strokeColor, opacity: engine._opts.opacity,
      ...s.compositeScalars(() => ({ spreadPx: 0, inkSmoothPx: 0, water: 0, migratePx: 0, fieldSeed: [0, 0], bristleRadiusPx: 0 })),
      fringeWater: 0, strokeDir: [1, 0],
    }
  }
  function render(material: PuddleMaterial, out: AccumulationBuffer) {
    if (!context) return
    out.clear()
    const c = context
    engine._drawRibbonCompositeRect({ buffer: out, originX: 0, originY: 0, contentRect: bounds }, bounds,
      c.preset, c.profile, blank, material.coverage, material.p, material.c,
      c.color, c.opacity, c.fieldSeed ?? [0, 0], c.spreadPx ?? 0, c.fringeWater ?? c.water ?? 0,
      c.migratePx ?? 0, 0, c.strokeDir ?? [1, 0], c.bristleRadiusPx ?? 0)
  }
  function physical() {
    const found = locate()
    return found?.entry?.inkLoad && found.entry.inkColor
      ? { p: found.entry.inkLoad, c: found.entry.inkColor, coverage: found.entry.coverage } : null
  }
  function show() {
    const found = locate()
    if (!found || !context) return
    const view = presentation ? presentation.tick(0, { dry: drying }) : targetRGBA
    view.copyTo(found.tile.buffer)
    const ctx = found.scratch.finishContext
    ctx?.target.markContentPainted(bounds)
    engine._paperPartialOK = false
    engine._paperCacheKey = ''
    engine._invalidateSplitCache()
  }
  function commit() {
    const found = locate()
    if (!active || !found?.entry) return
    const m = target.buffers(), e = found.entry
    for (const b of [e.inkLoad, e.inkSettled, e.inkBase]) if (b) m.p.copyTo(b)
    for (const b of [e.inkColor, e.colorSettled, e.colorBase]) if (b) m.c.copyTo(b)
    m.coverage.copyTo(e.coverage)
    if (e.inkDry) m.p.copyTo(e.inkDry)
    if (e.colorDry) m.c.copyTo(e.colorDry)
  }
  function request() { if (!raf && !destroyed) raf = requestAnimationFrame(frame) }
  function frame(at: number) {
    raf = 0
    if (destroyed) return
    const dt = lastAt ? Math.min(100, at - lastAt) : 16; lastAt = at
    if (active && !down) {
      target.step(drying ? 12 : 3)
      if (target.state.iterations !== published) {
        published = target.state.iterations
        render(target.buffers(), targetRGBA)
        presentation?.setTarget(targetRGBA, target.buffers().coverage, epoch)
      }
      presentation?.tick(dt, { dry: drying })
      engine._display()
      onStatus(`${mode === 'morph' ? 'Морфинг' : 'Материал'} · цель ${target.state.iterations}/32 · эпоха ${epoch}`)
      if (!target.state.done || presentation && presentation.state.progress < 0.9995) request()
    }
  }
  engine._settlePlan.prepare = () => null
  engine._finishRibbonStroke = (s: { diffusePending: boolean }) => {
    captureContext()
    if (engine._liveComposite?.scratch === s) engine._flushLiveComposite()
    s.diffusePending = false
  }
  engine._scheduleDryingRepaint = () => {}
  engine._revealWash = () => {}
  if (engine._dryingTimer) { clearTimeout(engine._dryingTimer); engine._dryingTimer = 0 }
  engine._display = function(...args: unknown[]) {
    engine._flushLiveComposite()
    if (active || down) show()
    return original.get('_display')!.apply(engine, args)
  }
  engine._onStart = function(...args: unknown[]) {
    if (active && !target.state.done) cancellations++
    commit(); target.cancel(); active = false; down = true; drying = false; epoch++
    if (engine._wash) engine._wash.endedAt = Infinity
    const result = original.get('_onStart')!.apply(engine, args)
    down = !!engine._strokeLayerId
    return result
  }
  engine._paintStrokeDabs = function(...args: unknown[]) {
    const old = physical()
    if (old) { old.p.copyTo(before.p); old.c.copyTo(before.c); old.coverage.copyTo(before.coverage) }
    else for (const b of Object.values(before)) b.clear()
    const result = original.get('_paintStrokeDabs')!.apply(engine, args)
    captureContext()
    const after = physical()
    if (after) {
      inputs++
      render(before, rawBefore); render(after, rawAfter)
      if (presentation) presentation.acceptInput(rawBefore, rawAfter, epoch)
      rawAfter.copyTo(targetRGBA)
    }
    return result
  }
  engine._onEnd = function(...args: unknown[]) {
    const result = original.get('_onEnd')!.apply(engine, args)
    down = false; captureContext()
    const material = physical()
    if (material) { target.reset(material, epoch); active = true; published = -1; lastAt = 0; request() }
    return result
  }
  presentation?.reset(blank, epoch)
  return {
    get state() { return { mode, epoch, iterations: target.state.iterations, done: !down && target.state.done && (!presentation || !active || presentation.state.progress >= 0.9995), drawing: down, dry: drying, active, cancellations, inputs, target: { ...target.state }, presentation: presentation?.state ?? null } },
    dry() { drying = true; request() },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      for (const name of hooks) engine[name] = original.get(name)
      engine._settlePlan.prepare = originalPrepare
      target.destroy(); presentation?.destroy()
      for (const buffer of owned) buffer.destroy()
    },
  }
}
