import { createLocalGoal } from './local-goal-v04'
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import type { PaintTarget } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type { WatercolorSettlePlan } from '../../../../apps/web/src/engine/src/raster/WatercolorSettlePlan'
import { createProgram } from '../../../../apps/web/src/engine/src/raster/utils'
import { pigmentAbsorption } from '../../../../apps/web/src/engine/src/watercolor/pigmentOptics'
import { ribbonWaterDelivery } from '../../../../apps/web/src/engine/src/dabs/ribbonStrokeMath'
import { watercolorBloomStrength, watercolorBloomPush } from '../../../../apps/web/src/engine/src/presets/watercolorPresets'

type NativeJob = NonNullable<ReturnType<WatercolorSettlePlan['prepare']>>
export type NativePuddleTargetOptions = {
  /** Capture BEFORE controller replaces prepare. Unbound or bound are accepted. */
  prepare?: WatercolorSettlePlan['prepare']
  fullResolution?: boolean
}

/** One isolated invocation of the existing v4 solver over the whole raw wash.
 * The layer tile is only an identity key; no operation writes live scratch/RGB.
 * One native operation may contain several draws. No fixed-iteration claim. */
// Standalone diagnostic adapter deliberately accepts the engine's private hooks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNativePuddleTarget(engine: any, size: number, options: NativePuddleTargetOptions = {}) {
  const gl: WebGLRenderingContext = engine.gl
  const owner: WatercolorSettlePlan = engine._settlePlan
  const prepare = options.prepare ?? owner.prepare
  const pool = engine._ribbonScratchPool
  const out = {
    p: new AccumulationBuffer(gl, size, size, 'nearest'),
    c: new AccumulationBuffer(gl, size, size, 'nearest'),
    coverage: new AccumulationBuffer(gl, size, size, 'nearest'),
  }
  const local=createLocalGoal(gl,size)
  const previous={p:new AccumulationBuffer(gl,size,size),c:new AccumulationBuffer(gl,size,size),coverage:new AccumulationBuffer(gl,size,size)}
  let hasGoal=false
  const state = { epoch: 0, iterations: 0, done: true, total: 0, revision: 0 }
  let scratch: RibbonStrokeScratch | null = null
  let job: NativeJob | null = null
  let key: AccumulationBuffer | null = null
  let destroyed = false, completed = false
  let dryProgram: WebGLProgram | null = null, dryQuad: WebGLBuffer | null = null
  let dryCoverage: AccumulationBuffer | null = null
  const cancel = () => {
    job?.dispose(); job = null
    scratch?.destroy(); scratch = null; key = null
    state.done = true; completed = false
  }
  const publish = (p: AccumulationBuffer, c: AccumulationBuffer | null, coverage: AccumulationBuffer) => {
    local.merge(previous.p,p,out.p)
    if(c)local.merge(previous.c,c,out.c)
    local.merge(previous.coverage,coverage,out.coverage)
    state.revision++
  }
  return {
    state,
    resetFromScratch(source: RibbonStrokeScratch, tile: PaintTarget, epoch: number) {
      if (destroyed) throw new Error('Native puddle target destroyed')
      if(hasGoal){out.p.copyTo(previous.p);out.c.copyTo(previous.c);out.coverage.copyTo(previous.coverage)}
      cancel()
      const sourceEntry = source.peek(tile.buffer), ctx = source.finishContext
      if (!sourceEntry?.inkLoad || !ctx) throw new Error('Native puddle target needs raw wash and finish context')
      if (tile.buffer.width !== size || tile.buffer.height !== size) throw new Error('Native puddle target supports one full-page tile')
      if (engine._settle) throw new Error('Native puddle target requires exclusive settle-field ownership')
      state.epoch = epoch; state.iterations = 0; state.total = 0; state.done = false
      scratch = new RibbonStrokeScratch(pool, true, true)
      key = tile.buffer
      const clone = scratch, entry = clone.getOrCreate(tile.buffer)
      sourceEntry.original.copyTo(entry.original)
      sourceEntry.coverage.copyTo(entry.coverage)
      sourceEntry.inkLoad.copyTo(entry.inkLoad!)
      if (sourceEntry.inkColor) sourceEntry.inkColor.copyTo(entry.inkColor!)
      else {
        const paint = [...source.paints][0]
        if (!paint) { cancel(); throw new Error('Native target lacks optical color and paint metadata') }
        engine._watercolorPasses.pigmentColor(entry.inkColor!, entry.inkLoad!, pigmentAbsorption(paint.split(',').map(Number) as [number, number, number]))
      }
      if(!hasGoal){entry.inkLoad!.copyTo(previous.p);entry.inkColor!.copyTo(previous.c);entry.coverage.copyTo(previous.coverage)}
      local.reset(source.wetContacts.length?source.wetContacts:source.brushTravel.length?source.brushTravel:[{x:(ctx.bounds.minX+ctx.bounds.maxX)/2,y:(ctx.bounds.minY+ctx.bounds.maxY)/2,radius:Math.max(.5,(ctx.bounds.maxY-ctx.bounds.minY)/2),aspect:Math.max(1,(ctx.bounds.maxX-ctx.bounds.minX)/Math.max(1,ctx.bounds.maxY-ctx.bounds.minY)),angle:0}])
      hasGoal=true
      // Treat the entire current raw wash as the one operation's mobile input.
      // Explicit zero settled records are essential: null means inkLoad fallback.
      entry.inkSettled = pool.acquire(size, size); entry.inkSettled!.clear()
      entry.colorSettled = pool.acquire(size, size); entry.colorSettled!.clear()
      for (const name of ['solventLoad', 'foreignSolventLoad'] as const) {
        const src = sourceEntry[name]
        if (src) { const copy: AccumulationBuffer = pool.acquire(size, size); src.copyTo(copy); entry[name] = copy }
      }
      const bounds = { minX: tile.originX, minY: tile.originY, maxX: tile.originX + size, maxY: tile.originY + size }
      clone.gesture = source.gesture
      for (const paint of source.paints) clone.paints.add(paint)
      const metadata = source.captureFinishMetadata()
      clone.brushTravel = metadata.brushTravel.map(d => ({ ...d }))
      clone.wetContacts = metadata.wetContacts.map(d => ({ ...d }))
      clone.foreignSources = structuredClone(metadata.foreignSources ?? null)
      clone.noteFinish({ ...ctx, bounds })
      const sc = source.compositeScalars(() => ({ spreadPx: 0, inkSmoothPx: 0, water: 0, migratePx: 0, fieldSeed: [0, 0], bristleRadiusPx: 0 }))
      clone.compositeScalars(() => ({ ...sc, fieldSeed: [...sc.fieldSeed] }))
      const direction = source.noteDirection(0, 0)
      clone.noteDirection(direction[0], direction[1])
      const radius = ctx.radiusPx
      const delivery = ribbonWaterDelivery(ctx.profile)
      const standing = delivery.water * (delivery.retain + (1 - delivery.retain) * Math.min(1, ctx.landedWet))
      clone.dryCtx = { ...ctx, bounds, radiusPx: radius, standing }
      publish(entry.inkLoad!, entry.inkColor, entry.coverage)
      const bloom = watercolorBloomStrength(ctx.landedWet, ctx.profile.pigmentLevel) * watercolorBloomPush(ctx.profile.pigmentLevel)
      // The controller's old jump experiment must not silently select a new kernel.
      const jump = owner.diagnosticMultilevelContact, fine = owner.diagnosticFullResolution
      owner.diagnosticFullResolution = options.fullResolution ?? false
      owner.diagnosticMultilevelContact = 0
      try {
        job = prepare.call(owner, clone, [tile], bounds, bloom, radius, ctx.profile.waterLevel, ctx.landedWet, standing, ctx.wetPeak, ctx.dwellMs,
          (_tile, p, c, coverage) => { if (scratch === clone && !destroyed) publish(p, c, coverage) })
        state.total = job?.ops.length ?? 0
        if (!job) { state.done = true; clone.destroy(); scratch = null; key = null }
      } catch (error) { cancel(); throw error }
      finally { owner.diagnosticMultilevelContact = jump; owner.diagnosticFullResolution = fine }
    },
    step(maxOps = 1) {
      if (!job || destroyed || state.done) return state
      const activeJob = job
      try {
        for (let i = 0; i < Math.max(0, Math.floor(maxOps)) && state.iterations < activeJob.ops.length; i++) {
          activeJob.ops[state.iterations++]()
          state.total = activeJob.ops.length
        }
        if (state.iterations >= activeJob.ops.length) {
          // finish() writes only our clone entries, including native group tide.
          activeJob.finish()
          job = null
          const entry = key && scratch?.peek(key)
          if (entry?.inkLoad) publish(entry.inkDry ?? entry.inkLoad, entry.colorDry ?? entry.inkColor, entry.coverage)
          scratch?.destroy(); scratch = null; key = null
          state.done = true; completed = true
        }
      } catch (error) { cancel(); throw error }
      return state
    },
    buffers: () => out,
    cancel,
    forget(){hasGoal=false},
    /** Native pigment/tide is already complete. Clear solvent B only;
     * controller commits this pair and owns subsequent remobilization. */
    dry() {
      if (destroyed || !completed || !state.done) return false
      if (!dryProgram) {
        dryProgram = createProgram(gl,
          'attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}',
          'precision highp float;varying vec2 v_uv;uniform sampler2D u_source;void main(){vec4 c=texture2D(u_source,v_uv);gl_FragColor=vec4(c.rg,0.,c.a);}')
        dryQuad = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, dryQuad)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
        dryCoverage = new AccumulationBuffer(gl, size, size, 'nearest')
      }
      dryCoverage!.beginReplaceDraw(); gl.disable(gl.SCISSOR_TEST); gl.useProgram(dryProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, dryQuad)
      const position = gl.getAttribLocation(dryProgram, 'a_position')
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, out.coverage.texture)
      gl.uniform1i(gl.getUniformLocation(dryProgram, 'u_source'), 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6); dryCoverage!.endDraw()
      dryCoverage!.copyTo(out.coverage)
      state.revision++
      return true
    },
    destroy() {
      if (destroyed) return
      cancel(); destroyed = true
      for (const buffer of Object.values(out)) buffer.destroy()
      local.destroy();for(const b of Object.values(previous))b.destroy()
      dryCoverage?.destroy()
      if (dryProgram) { gl.useProgram(null); gl.deleteProgram(dryProgram) }
      if (dryQuad) gl.deleteBuffer(dryQuad)
    },
  }
}
