import {puddleDimensions, type PuddleSize} from './PuddleDimensions'
import {createBackgroundMix} from './BackgroundMix'
import {createContrastPhase} from './ContrastPhase'
import { AccumulationBuffer } from '../../buffers/AccumulationBuffer'
import { RibbonStrokeScratch } from '../../buffers/RibbonStrokeScratch'
import type { PaintTarget } from '../../buffers/ILayerBuffer'
import type { WatercolorSettlePlan } from '../../raster/WatercolorSettlePlan'
import { createProgram } from '../../raster/utils'
import { pigmentAbsorption } from '../pigmentOptics'

import type {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import type {WatercolorPasses} from '../../raster/WatercolorPasses'
import {APPROVED_M70_PARAMETERS, type ReadPuddleParameters} from './PuddleParameters'

/** Explicit GPU ownership: the caller cancels the previous revision before a new one.
 * Currently a single rectangular material tile; room-wide tiling is not implemented here. */
export interface PuddleTargetHost {
  gl: WebGLRenderingContext
  settlePlan: WatercolorSettlePlan
  pool: RibbonScratchPool
  passes: WatercolorPasses
  invalidateFrontPaths(): void
  hasActiveSettle(): boolean
}

type NativeJob = NonNullable<ReturnType<WatercolorSettlePlan['prepare']>>
export type NativePuddleTargetOptions = {
  /** Capture BEFORE controller replaces prepare. Unbound or bound are accepted. */
  prepare?: WatercolorSettlePlan['prepare']
  portableNoise?: boolean
  readParameters?: ReadPuddleParameters
  fullResolution?: boolean
  /** Paged callers consume only completed material; omit intermediate presentation copies. */
  finalOnly?: boolean
  /** Transfer a disposable window created with host.pool. Requires deferred global mixing. */
  consumePreparedSource?: boolean
  /** A paged caller supplies whole-sheet phases, shared by every solver window. */
  deferFinalMix?: boolean
  contrast?: ReturnType<typeof createContrastPhase>
  background?: ReturnType<typeof createBackgroundMix>
  bufferFactory?: (width:number,height:number,filter?:'nearest'|'linear') => AccumulationBuffer
}

/** One isolated invocation of the existing v4 solver over the whole raw wash.
 * The layer tile is only an identity key; no operation writes live scratch/RGB.
 * One native operation may contain several draws. No fixed-iteration claim. */
export function createNativePuddleTarget(host: PuddleTargetHost, size: PuddleSize, options: NativePuddleTargetOptions = {}) {
  if(options.consumePreparedSource && !options.deferFinalMix)throw Error('Consuming a prepared source requires deferred final mixing')
  const {width, height} = puddleDimensions(size)
  const gl: WebGLRenderingContext = host.gl
  const owner: WatercolorSettlePlan = host.settlePlan
  const prepare = options.prepare ?? owner.prepare
  const pool = host.pool
  const readParameters = options.readParameters ?? (() => APPROVED_M70_PARAMETERS)
  const make=options.bufferFactory ?? ((w:number,h:number,filter:'nearest'|'linear'='linear')=>new AccumulationBuffer(gl,w,h,filter))
  const contrast=options.contrast ?? createContrastPhase(gl, readParameters, size)
  let initialWater:AccumulationBuffer|null=null,capturedWater:AccumulationBuffer|null=null
  const guardProgram=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}','precision highp float;varying vec2 uv;uniform sampler2D raw,result,water;void main(){float wet=smoothstep(0.,.03,texture2D(water,uv).a*4.);gl_FragColor=mix(texture2D(raw,uv),texture2D(result,uv),wet);}')
  function guardDryPixels(dst:AccumulationBuffer,raw:AccumulationBuffer){if(!initialWater)throw Error('M55 requires raw fluid');const temp=pool.acquire(width,height);try{temp.beginReplaceDraw();try{gl.disable(gl.SCISSOR_TEST);gl.useProgram(guardProgram);gl.bindBuffer(gl.ARRAY_BUFFER,alignQuad);const pos=gl.getAttribLocation(guardProgram,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);for(const [unit,name,b]of [[0,'raw',raw],[1,'result',dst],[2,'water',initialWater]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(guardProgram,name),unit)}gl.drawArrays(gl.TRIANGLES,0,6)}finally{try{temp.endDraw()}finally{gl.activeTexture(gl.TEXTURE0)}}temp.copyTo(dst)}finally{pool.release(temp)}}
  const alignProgram=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}','precision highp float;varying vec2 uv;uniform sampler2D p,c;void main(){vec4 v=texture2D(p,uv);v.b=min(texture2D(c,uv).a,v.a);gl_FragColor=v;}')
  const alignQuad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,alignQuad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const background=options.background ?? createBackgroundMix(gl,size,readParameters,options.portableNoise??false)
  let post:Array<()=>void>=[],postAt=0
  let initialP:AccumulationBuffer|null=null,initialC:AccumulationBuffer|null=null
  const allocated:AccumulationBuffer[]=[]
  const allocate=()=>{const buffer=make(width,height,'nearest');allocated.push(buffer);return buffer}
  let out:{p:AccumulationBuffer;c:AccumulationBuffer;coverage:AccumulationBuffer},contour:AccumulationBuffer
  try{
    out={p:allocate(),c:allocate(),coverage:allocate()}
    contour=allocate()
  }catch(error){
    for(const buffer of allocated)buffer.destroy()
    gl.deleteProgram(alignProgram);gl.deleteProgram(guardProgram);gl.deleteBuffer(alignQuad)
    if(!options.contrast)contrast.destroy()
    if(!options.background)background.destroy()
    throw error
  }
  const state = { epoch: 0, iterations: 0, done: true, total: 0, revision: 0 }
  let scratch: RibbonStrokeScratch | null = null
  let job: NativeJob | null = null
  let key: AccumulationBuffer | null = null
  let destroyed = false, completed = false
  let dryProgram: WebGLProgram | null = null, dryQuad: WebGLBuffer | null = null
  let dryCoverage: AccumulationBuffer | null = null
  const cancel = () => {
    post=[];postAt=0
    const water=capturedWater,activeJob=job,activeScratch=scratch
    capturedWater=null;initialWater=null;job=null;scratch=null;key=null
    state.done=true;completed=false
    try{activeJob?.dispose()}finally{
      try{activeScratch?.destroy()}finally{if(water)pool.release(water)}
    }
  }
  const publish = (p: AccumulationBuffer, c: AccumulationBuffer | null, _coverage: AccumulationBuffer) => {
    p.copyTo(out.p)
    if (c) c.copyTo(out.c)
    contour.copyTo(out.coverage)
    state.revision++
  }
  return {
    state,
    resetFromScratch(source: RibbonStrokeScratch, tile: PaintTarget, epoch: number) {
      if (destroyed) throw new Error('Native puddle target destroyed')
      cancel()
      // Cached front paths depend on coverage contents, not just field identity.
      // A cancelled prefix can otherwise be reused by the next wash revision.
      host.invalidateFrontPaths()
      const sourceEntry = source.peek(tile.buffer), ctx = source.finishContext
      if (!sourceEntry?.inkLoad || !ctx) throw new Error('Native puddle target needs raw wash and finish context')
      if (tile.buffer.width !== width || tile.buffer.height !== height) throw new Error('Native puddle target supports one full-page tile')
      if (host.hasActiveSettle()) throw new Error('Native puddle target requires exclusive settle-field ownership')
      state.epoch = epoch; state.iterations = 0; state.total = 0; state.done = false
      scratch = options.consumePreparedSource ? source : new RibbonStrokeScratch(pool, true, true)
      key = tile.buffer
      const clone = scratch, entry = clone.getOrCreate(tile.buffer)
      if(!options.consumePreparedSource){
        sourceEntry.original.copyTo(entry.original)
        sourceEntry.coverage.copyTo(entry.coverage)
        sourceEntry.inkLoad.copyTo(entry.inkLoad!)
      }
      sourceEntry.coverage.copyTo(contour)
      if (sourceEntry.inkColor) {if(!options.consumePreparedSource)sourceEntry.inkColor.copyTo(entry.inkColor!)}
      else {
        const paint = [...source.paints][0]
        if (!paint) { cancel(); throw new Error('Native target lacks optical color and paint metadata') }
        host.passes.pigmentColor(entry.inkColor!, entry.inkLoad!, pigmentAbsorption(paint.split(',').map(Number) as [number, number, number]))
      }
      // Raw optical mass is authoritative; live P.b and C.a can differ after channel fitting.
      const aligned=pool.acquire(width,height)
      try{aligned.beginReplaceDraw();try{gl.disable(gl.SCISSOR_TEST);gl.useProgram(alignProgram);gl.bindBuffer(gl.ARRAY_BUFFER,alignQuad);const pos=gl.getAttribLocation(alignProgram,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);for(const [unit,name,buffer]of [[0,'p',entry.inkLoad!],[1,'c',entry.inkColor!]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,buffer.texture);gl.uniform1i(gl.getUniformLocation(alignProgram,name),unit)}gl.drawArrays(gl.TRIANGLES,0,6)}finally{try{aligned.endDraw()}finally{gl.activeTexture(gl.TEXTURE0)}}aligned.copyTo(entry.inkLoad!)}finally{pool.release(aligned)}
      // Local background and positive concentration/composition excess,
      // extracted from the complete initial wash, never the previous goal.
      initialWater=sourceEntry.solventLoad??sourceEntry.foreignSolventLoad??null
      if(sourceEntry.solventLoad&&sourceEntry.foreignSolventLoad){capturedWater=pool.acquire(width,height);host.passes.fieldOp(capturedWater,sourceEntry.solventLoad,sourceEntry.foreignSolventLoad,1,1);initialWater=capturedWater}
      if(!initialWater)throw Error('M55 requires captured local fluid')
      entry.inkSettled=pool.acquire(width,height)
      entry.colorSettled=pool.acquire(width,height)
      contrast.prepare(entry.inkLoad!,entry.inkColor!,initialWater,true,entry.inkSettled!,entry.colorSettled!)
      initialP=sourceEntry.inkLoad;initialC=sourceEntry.inkColor
      background.capture(entry.inkLoad!,entry.inkSettled!,entry.coverage)
      if(!options.consumePreparedSource)for (const name of ['solventLoad', 'foreignSolventLoad'] as const) {
        const src = sourceEntry[name]
        if (src) { const copy: AccumulationBuffer = pool.acquire(width, height); src.copyTo(copy); entry[name] = copy }
      }
      const bounds = { minX: tile.originX, minY: tile.originY, maxX: tile.originX + width, maxY: tile.originY + height }
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
      const radius = 40
      // Constant material parameters; deposited fluid remains local.
      const standing = 1
      clone.dryCtx = { ...ctx, bounds, radiusPx: radius, standing }
      publish(entry.inkLoad!, entry.inkColor, entry.coverage)
      const bloom = 0
      // The controller's old jump experiment must not silently select a new kernel.
      const jump = owner.diagnosticMultilevelContact, fine = owner.diagnosticFullResolution, split = owner.splitQuanta
      owner.diagnosticFullResolution = options.fullResolution ?? false
      owner.diagnosticMultilevelContact = 0
      owner.splitQuanta = true
      try {
        job = prepare.call(owner, clone, [tile], bounds, bloom, radius, 1, 0, standing, 1, 0,
          options.finalOnly ? undefined : (_tile, p, c, coverage) => { if (scratch === clone && !destroyed) publish(p, c, coverage) }, false, undefined, true)
        state.total = job?.ops.length ?? 0
        if (!job) { state.done = true; clone.destroy(); scratch = null; key = null }
      } catch (error) { cancel(); throw error }
      finally { owner.diagnosticMultilevelContact = jump; owner.diagnosticFullResolution = fine; owner.splitQuanta = split }
    },
    step(maxOps = 1) {
      if(destroyed||state.done)return state
      try{
        for(let i=0;i<Math.max(0,Math.floor(maxOps));i++){
          if(job){
            const activeJob=job
            if(state.iterations<activeJob.ops.length)activeJob.ops[state.iterations++]()
            state.total=activeJob.ops.length
            if(state.iterations>=activeJob.ops.length){
              activeJob.finish();job=null
              const entry=key&&scratch?.peek(key)
              if(entry?.inkLoad)publish(entry.inkDry??entry.inkLoad,entry.colorDry??entry.inkColor,entry.coverage)
              if(!initialP||!initialC)throw Error('Missing initial M24 material')
              const rawP=initialP,rawC=initialC;post=options.deferFinalMix?[()=>{}]:[...background.ops(out.p,out.c,out.coverage,initialP,initialC),()=>guardDryPixels(out.p,rawP),()=>guardDryPixels(out.c,rawC)];postAt=0
              scratch?.destroy();scratch=null;key=null
              state.total=state.iterations+post.length
            }
          }else if(postAt<post.length){
            post[postAt++]();state.iterations++
            if(postAt===post.length){if(capturedWater){pool.release(capturedWater);capturedWater=null}initialWater=null;state.done=true;completed=true;state.revision++;post=[]}
          }else break
          if(state.done)break
        }
      }catch(error){cancel();throw error}
      return state
    },
    backgroundReadback:()=>background.readback(),
    buffers: () => out,
    cancel,
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
        dryCoverage = make(width, height, 'nearest')
      }
      dryCoverage!.beginReplaceDraw(); try {gl.disable(gl.SCISSOR_TEST); gl.useProgram(dryProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, dryQuad)
      const position = gl.getAttribLocation(dryProgram, 'a_position')
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, out.coverage.texture)
      gl.uniform1i(gl.getUniformLocation(dryProgram, 'u_source'), 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      } finally {try {dryCoverage!.endDraw()} finally {gl.activeTexture(gl.TEXTURE0)}}
      dryCoverage!.copyTo(out.coverage)
      state.revision++
      return true
    },
    destroy() {
      if (destroyed) return
      cancel(); destroyed = true
      for (const buffer of Object.values(out)) buffer.destroy()
      gl.useProgram(null);gl.deleteProgram(alignProgram);gl.deleteProgram(guardProgram);gl.deleteBuffer(alignQuad);contour.destroy();if(!options.contrast)contrast.destroy();if(!options.background)background.destroy()
      dryCoverage?.destroy()
      if (dryProgram) { gl.useProgram(null); gl.deleteProgram(dryProgram) }
      if (dryQuad) gl.deleteBuffer(dryQuad)
    },
  }
}
