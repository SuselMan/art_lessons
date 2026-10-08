/// <reference types="@webgpu/types" />
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { SettleField } from '../../../../apps/web/src/engine/src/buffers/SettleField'
import { RibbonScratchPool } from '../../../../apps/web/src/engine/src/buffers/RibbonScratchPool'
import type { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import type { StampPainter } from '../../../../apps/web/src/engine/src/dabs/StampPainter'
import { WatercolorPasses } from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import { WatercolorSettlePlan } from '../../../../apps/web/src/engine/src/raster/WatercolorSettlePlan'
import { CanonicalWatercolorSettlePlan } from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan'
import { diagnosticSettleOpTag } from '../../../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'
import type { SettlePlanBuffer, SettlePlanScratch, SettlePlanTile } from '../../../../apps/web/src/engine/src/watercolor/SettlePlanContracts'
import { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import { CanonicalPlanAdapter } from '../../../../apps/web/src/engine/src/webgpuCanonical/settlePlanAdapter'
import { CanonicalFieldBuffer, CanonicalScratchPool, createCanonicalSettleField, destroyCanonicalSettleField } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import { getPaperBytes, uploadPaperTexture } from '../../../../apps/web/src/engine/src/paper/paperLoader'
import noiseAsset from '../../../../apps/web/src/engine/src/raster/watercolorNoise.txt?raw'

const W = 128, H = 128, originX = -32, originY = 48
const flip = (bytes: Uint8Array, w = W, h = H) => { const out = new Uint8Array(bytes.length); for (let y = 0; y < h; y++) out.set(bytes.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4); return out }
function sourceBytes(role: 'coverage' | 'pigment' | 'color' | 'zero') {
 const out = new Uint8Array(W * H * 4)
 for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, wet = Math.hypot(x - 32, y - 32) < 24, ink = Math.hypot(x - 30, y - 31) < 8
  if (role === 'coverage' && wet) out.set([112, 16, 255, 224], i)
  if (role === 'pigment' && ink) out.set([180 + ((x + y) % 5), 135, 105, 224], i)
  if (role === 'color' && ink) out.set([160, 150 + (x % 3), 120, 224], i)
 }
 return out
}
function makeScratch<B extends SettlePlanBuffer<B>>(acquire: () => B, upload: (buffer: B, bytes: Uint8Array) => void, tile: B, mixed: boolean, contacts: boolean, foreign: boolean) {
 const role = (kind: Parameters<typeof sourceBytes>[0]) => { const buffer = acquire(); upload(buffer, sourceBytes(kind)); return buffer }
 const entry: SettlePlanTile<B> = {
  original: role('zero'), coverage: role('coverage'), inkLoad: role('pigment'), inkSettled: null, inkColor: role('color'), colorSettled: null,
  strokeInk: role('pigment'), inkBase: role('zero'), strokeColor: role('color'), colorBase: role('zero'), filmGesture: 0, inkDry: null, colorDry: null,
 }
 const footprint = { x: originX + 32, y: originY + 32, radius: 24, aspect: 1, angle: 0 }
 const scratch: SettlePlanScratch<B> = {
  gesture: 0, materialGesture: 0, paints: new Set(mixed ? ['1,0,0', '0,0,1'] : ['1,0,0']),
  brushTravel: contacts ? [{ ...footprint, radius: 7, dx: 64, dy: 2, water: 1 }, { ...footprint, x: footprint.x + 5, radius: 7, dx: -64, dy: 0, water: 1 }] : [],
  wetContacts: foreign ? [footprint] : [], foreignSources: foreign ? [{ gesture: 'water-before-colour', footprints: [{ ...footprint, x: footprint.x, radius: 50 }] }] : null,
  dryCtx: null, pigmentInputsKnownZero: false, trackRunningSource: false, runningSourceCommands: [], peek: b => b === tile ? entry : null,
  *tileEntries() { yield [tile, entry] as [B, SettlePlanTile<B>] }, releaseRunningCoverage: () => {}, noteStorageBounds: () => {},
 }
 return { scratch, entry }
}
function compare(expected: Uint8Array, actual: Uint8Array) {
 let different = 0, max = 0, total = 0
 if (expected.length !== actual.length) throw new Error('Different field sizes')
 for (let k = 0; k < expected.length; k++) { const d = Math.abs(expected[k] - actual[k]); if (d) different++; max = Math.max(max, d); total += d }
 return { different, max, total, nonzero: actual.reduce((n, v) => n + +(v > 0), 0), expectedNonzero: expected.reduce((n, v) => n + +(v > 0), 0) }
}
function mismatchSamples(expected: Uint8Array, actual: Uint8Array) {
 const channels = [0, 0, 0, 0], samples: { x: number; y: number; channel: number; gl: number; native: number }[] = []
 for (let i = 0; i < expected.length; i++) if (expected[i] !== actual[i]) { channels[i % 4]++; if (samples.length < 8) samples.push({ x: Math.floor(i / 4) % W, y: Math.floor(i / 4 / W), channel: i % 4, gl: expected[i], native: actual[i] }) }
 return { channels, samples }
}
async function frontPrimitive(gl: WebGLRenderingContext, glPasses: WatercolorPasses, glField: SettleField, owner: CanonicalWatercolorWebGpu, adapter: CanonicalPlanAdapter, nativeField: ReturnType<typeof createCanonicalSettleField>) {
 const seed = new Uint8Array(W * H * 4)
 for (let i = 0; i < W * H; i++) seed.set([255, 0, 0, 255], i * 4)
 seed[(32 * W + 32) * 4] = 0
 const foreign = new Uint8Array(W * H)
 for (let y = 20; y < 60; y++) for (let x = 20; x < 60; x++) foreign[y * W + x] = 255
 const texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, texture)
 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
 const bottom = new Uint8Array(foreign.length); for (let y = 0; y < H; y++) bottom.set(foreign.subarray(y * W, (y + 1) * W), (H - 1 - y) * W)
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bottom)
 const slot = adapter.uploads.create(); adapter.runQuantum(() => adapter.uploads.uploadForeign(slot, W, H, bottom)); await owner.whenIdle()
 const results: Uint8Array[] = []; const rows = []; const divergences = []
 for (const wet of [false, true]) {
  glField.coverage.clear(); nativeField.coverage.clear()
  glField.a.restorePixels(flip(seed)); nativeField.a.upload(seed)
  let gs = glField.a, gd = glField.b, ns = nativeField.a, nd = nativeField.b
  for (let step = 0; step < 12; step++) {
   glPasses.waterFrontStep(glField, originX, originY, 16, gs, gd, 64, 0, 1, 1, 1, wet ? texture : null)
   adapter.runQuantum(() => adapter.waterFrontStep(nativeField, originX, originY, 16, ns, nd, 64, 0, 1, 1, 1, wet ? slot : null)); await owner.whenIdle()
   const expected = flip(gd.readPixels()), actual = await nd.readBytes(), diff = compare(expected, actual)
   if (diff.different) divergences.push({ foreign: wet, step, difference: diff, samples: mismatchSamples(expected, actual) })
   ;[gs, gd] = [gd, gs]; [ns, nd] = [nd, ns]
  }
  const bytes = await ns.readBytes(); results.push(bytes)
  let reached = 0, min = 255, radius = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const cost = bytes[(y * W + x) * 4]; if (cost < 255) { reached++; min = Math.min(min, cost); radius = Math.max(radius, Math.hypot(x - 32, y - 32)) } }
  rows.push({ foreign: wet, reached, min, radius })
 }
 gl.deleteTexture(texture); adapter.uploads.destroy(slot)
 const effect = compare(results[0], results[1]); if (!effect.different || rows[1].reached <= rows[0].reached) throw new Error('Inactive foreign primitive')
 return { rows, effect, divergences, exact: !divergences.length }
}
export async function runWholePlan() {
 const paperLA = await getPaperBytes('medium'), paperResolution = Math.sqrt(paperLA.length / 2), paper = new Uint8Array(paperResolution ** 2 * 4)
 for (let k = 0; k < paperLA.length / 2; k++) paper.set([paperLA[k * 2], paperLA[k * 2], paperLA[k * 2], paperLA[k * 2 + 1]], k * 4)
 const noise = Uint8Array.from(atob(noiseAsset), c => c.charCodeAt(0))
 const rows = []
 const landed: Uint8Array[] = []
 const checkpoints: number[][] = []
 let primitive: Awaited<ReturnType<typeof frontPrimitive>> | null = null
 for (const spec of [{ name: 'single', mixed: false, contacts: false, foreign: false }, { name: 'mixed-static', mixed: true, contacts: false, foreign: false }, { name: 'mixed-contact', mixed: true, contacts: true, foreign: false }, { name: 'mixed-contact-foreign', mixed: true, contacts: true, foreign: true }]) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })!
  gl.disable(gl.DITHER); gl.disable(gl.BLEND)
  const gpuErrors: string[] = []
  const nativeCanvas = document.createElement('canvas')
  const owner = await CanonicalWatercolorWebGpu.create({ canvas: nativeCanvas, width: W, height: H, paper: { bytes: paper, width: paperResolution, height: paperResolution, origin: [0, -H], texSize: [paperResolution, paperResolution], scale: 1 } })
  owner.device.addEventListener('uncapturederror', event => gpuErrors.push(event.error.message))
  const nativeAdapter = new CanonicalPlanAdapter(owner), nativePool = new CanonicalScratchPool(owner), glPool = new RibbonScratchPool(gl)
  const paperTexture = uploadPaperTexture(gl, paperLA)
  const noiseTexture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, noiseTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 251, 251, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, noise)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
  const glPasses = new WatercolorPasses({ gl: () => gl, screenBuf: () => quad, paperTex: () => paperTexture, paperScale: () => 1, paperWorldSize: () => ({ w: paperResolution, h: paperResolution }), stamps: () => ({ bindNoise: (location: WebGLUniformLocation | null) => { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, noiseTexture); gl.uniform1i(location, 7) } }) as unknown as StampPainter })
  glPasses.initFieldPrograms(); glPasses.initSettlePrograms(); glPasses.initFieldUniforms(); glPasses.initFieldAttributes(); glPasses.initDiffusionAttributes()
  let brushMovedBytes = 0
  const originalBrush = glPasses.brushPass.bind(glPasses)
  glPasses.brushPass = (...args) => {
   const before = args[4].readPixels().slice()
   originalBrush(...args)
   const after = args[5].readPixels(), rect = args[8]
   for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) for (let c = 0; c < 4; c++) { const i = (y * W + x) * 4 + c; if (before[i] !== after[i]) brushMovedBytes++ }
  }
  const glTile = new AccumulationBuffer(gl, W, H, 'linear'); glTile.restorePixels(sourceBytes('zero'))
  const nativeTile = new CanonicalFieldBuffer(owner, W, H, 'linear'); nativeTile.upload(sourceBytes('zero'))
  const a = makeScratch(() => glPool.acquire(W, H), (b, p) => b.restorePixels(flip(p)), glTile, spec.mixed, spec.contacts, spec.foreign)
  const b = makeScratch(() => nativePool.acquire(W, H), (f, p) => f.upload(p), nativeTile, spec.mixed, spec.contacts, spec.foreign)
  const glField = { w: W, h: H, ...Object.fromEntries(['a','b','c','ca','cb','cc','coverage','mask','pressure','band'].map(k => [k, new AccumulationBuffer(gl, W, H, k === 'mask' || k === 'pressure' ? 'linear' : 'nearest')])) } as SettleField
  const nativeField = createCanonicalSettleField(owner, W, H)
  const glBuilder = new WatercolorSettlePlan({ gl: () => gl, pool: () => glPool, fieldFor: () => glField, paperWorldSize: () => ({ w: paperResolution, h: paperResolution }), minmaxExt: () => ({ MAX_EXT: 32776 }), ab: () => ({ noDiffuse: false, noCarry: false, opDry: false }), shouldPreview: () => false, passes: () => glPasses })
  const nativeBuilder = new CanonicalWatercolorSettlePlan({ pool: () => nativePool, fieldFor: () => nativeField, paperWorldSize: () => ({ w: paperResolution, h: paperResolution }), supportsFilm: () => true, ab: () => ({ noDiffuse: false, noCarry: false, opDry: false }), shouldPreview: () => false, passes: () => nativeAdapter, uploads: nativeAdapter.uploads })
  if (!primitive) primitive = await frontPrimitive(gl, glPasses, glField, owner, nativeAdapter, nativeField)
  const bounds = { minX: originX + 20, minY: originY + 20, maxX: originX + 44, maxY: originY + 44 }
  const glPlan = glBuilder.prepare(a.scratch as unknown as RibbonStrokeScratch, [{ buffer: glTile, originX, originY, contentRect: null }], bounds, .2, 8, 1, 1, 1, 1)!
  const nativePlan = nativeBuilder.prepare(b.scratch, [{ buffer: nativeTile, originX, originY, contentRect: null }], bounds, .2, 8, 1, 1, 1, 1)!
  const roles = ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'] as const
  let firstDivergence: { index: number; tag: string; role: string; difference: ReturnType<typeof compare>; samples: ReturnType<typeof mismatchSamples> } | null = null
  const tags: Record<string, number> = {}
  const fingerprints: number[] = []
  for (let index = 0; index < glPlan.ops.length; index++) {
   if (nativePlan.ops.length !== glPlan.ops.length) throw new Error('Different planner operation count')
   const tag = diagnosticSettleOpTag(glPlan.ops[index]); if (tag !== diagnosticSettleOpTag(nativePlan.ops[index])) throw new Error('Different planner operation tags')
   tags[tag] = (tags[tag] ?? 0) + 1
   glPlan.ops[index](); nativeAdapter.runQuantum(nativePlan.ops[index]); await owner.whenIdle()
   if (!firstDivergence) for (const role of roles) {
    const nativeBytes = await nativeField[role].readBytes()
    let fingerprint = 2166136261; for (const byte of nativeBytes) fingerprint = Math.imul(fingerprint ^ byte, 16777619) >>> 0
    fingerprints.push(fingerprint)
    const difference = compare(flip(glField[role].readPixels()), nativeBytes)
    if (difference.different) { firstDivergence = { index, tag, role, difference, samples: mismatchSamples(flip(glField[role].readPixels()), nativeBytes) }; break }
   }
  }
  glPlan.finish(); nativeAdapter.runQuantum(nativePlan.finish); await owner.whenIdle()
  const final: Record<string, ReturnType<typeof compare>> = {}
  for (const role of ['inkLoad','inkColor','coverage','inkSettled','colorSettled','inkDry','colorDry'] as const) {
   const legacy = a.entry[role], native = b.entry[role]
   if (!!legacy !== !!native) throw new Error('Different landed role presence: ' + role)
   if (legacy && native) final[role] = compare(flip(legacy.readPixels()), await native.readBytes())
  }
  landed.push(await b.entry.inkLoad!.readBytes())
  checkpoints.push(fingerprints)
  rows.push({ brushMovedBytes, name: spec.name, operations: glPlan.ops.length, tags, firstDivergence, final, gpuErrors, glError: gl.getError(), changedPigment: compare(sourceBytes('pigment'), await b.entry.inkLoad!.readBytes()).different })
  glPlan.dispose(); nativeAdapter.runQuantum(nativePlan.dispose); glBuilder.destroyTextures(); nativeBuilder.destroyTextures(); await owner.whenIdle()
  glPasses.destroy(); for (const buffer of new Set(Object.values(a.entry).filter((value): value is AccumulationBuffer => value instanceof AccumulationBuffer))) glPool.release(buffer); glPool.destroy(); glTile.destroy(); for (const role of roles) glField[role].destroy(); destroyCanonicalSettleField(nativeField); nativePool.destroy(); nativeTile.destroy(); owner.destroy()
 }
 const contactEffect = compare(landed[1], landed[2]), foreignEffect = compare(landed[2], landed[3])
 const foreignWorkingEffect = checkpoints[2].reduce((n, hash, i) => n + +(hash !== checkpoints[3][i]), 0)
 const pixelParity = rows.every(row => !row.firstDivergence && Object.values(row.final).every(r => !r.different) && !row.gpuErrors.length && !row.glError)
 return { primitive, pixelParity, contactEffect, foreignEffect, foreignWorkingEffect, hardwareParityNotPreviouslyProven: true, fieldPolicy: '128x128 component fixture; production 1536 field sizing not claimed', paper: { type: 'medium', resolution: paperResolution }, rows, exact: primitive?.exact && rows.every(row => !row.firstDivergence && Object.values(row.final).every(r => !r.different) && !row.gpuErrors.length && !row.glError && row.changedPigment > 0 && row.final.inkLoad.nonzero > 0 && row.final.inkColor.nonzero > 0) && rows[2].brushMovedBytes > 0 && contactEffect.different > 0 && foreignWorkingEffect > 0 }
}
