import type { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { AccumulationBuffer as ReadbackBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import type { SettleField } from '../../../../apps/web/src/engine/src/buffers/SettleField'
import { createProgram, getUniforms } from '../../../../apps/web/src/engine/src/raster/utils'
import { DISPLAY_VERT } from '../../../../apps/web/src/engine/src/raster/shaders'
import { getPaperBytes } from '../../../../apps/web/src/engine/src/paper/paperLoader'
import type { PaperType } from '@grafetto/shared'

export type FieldStats = {
  width: number; height: number; channels: number; byteLength: number
  nonzero: number[]; max: number[]; sum: number[]
}
export function fieldStats(bytes: Uint8Array, width: number, height: number, channels = 4): FieldStats {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || bytes.length !== width * height * channels) throw new Error('Field capture dimensions/bytes mismatch')
  const nonzero = Array(channels).fill(0) as number[], max = Array(channels).fill(0) as number[], sum = Array(channels).fill(0) as number[]
  for (let i = 0; i < bytes.length; i++) { const c = i % channels, value = bytes[i]; if (value) nonzero[c]++; max[c] = Math.max(max[c], value); sum[c] += value }
  return { width, height, channels, byteLength: bytes.byteLength, nonzero, max, sum }
}
const sha = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))].map(n => n.toString(16).padStart(2, '0')).join('')
export type FieldRecord = FieldStats & { key: string; role: string; sha256: string }
export function fieldCoverage(records: Array<Pick<FieldRecord, 'role' | 'max' | 'channels'>>, mrtPairs: number) {
  const pigment = records.some(r => r.role === 'P' && r.channels === 4 && r.max[2] > 0 && r.max[3] > 0)
  const colour = records.some(r => r.role === 'C' && r.channels === 4 && Math.max(...r.max.slice(0, 3)) > 0 && r.max[3] > 0)
  const water = records.some(r => r.role === 'water' && r.max[0] > 0)
  const height = records.some(r => r.role === 'h' && r.max[0] > 0)
  const cov = records.some(r => r.role === 'cov' && r.max[3] > 0)
  return { pigment, colour, water, height, cov, nonemptyRequiredRoles: pigment && colour && water && height && cov, mrtExercised: mrtPairs > 0 }
}

type CaptureProbe = {
  gl: WebGLRenderingContext; _fieldCache: SettleField[]
  _replayRibbonChunks: Map<string, { scratch: RibbonStrokeScratch }>
  _wash: { id: string; scratch: RibbonStrokeScratch } | null
  _paperTex: WebGLTexture; _screenBuf: WebGLBuffer
}
export async function captureFieldRoles(probe: CaptureProbe, paper: PaperType, mrtPairs: number) {
  const records: FieldRecord[] = [], unavailable: string[] = []
  async function add(key: string, role: string, buffer: AccumulationBuffer, channel?: number) {
    let bytes = buffer.readPixels()
    if (channel !== undefined) {
      const plane = new Uint8Array(buffer.width * buffer.height)
      for (let i = 0; i < plane.length; i++) plane[i] = bytes[i * 4 + channel]
      bytes = plane
    }
    records.push({ key, role, ...fieldStats(bytes, buffer.width, buffer.height, channel === undefined ? 4 : 1), sha256: await sha(bytes) })
  }
  const owners = new Map<string, RibbonStrokeScratch>()
  for (const [key, chunk] of probe._replayRibbonChunks) owners.set('replay:' + key, chunk.scratch)
  if (probe._wash) owners.set('live:' + probe._wash.id, probe._wash.scratch)
  for (const [owner, scratch] of owners) {
    let tileIndex = 0
    for (const [, entry] of scratch.tileEntries()) {
      const prefix = owner + ':tile' + tileIndex++
      if (entry.inkLoad) await add(prefix + ':inkLoad', 'P', entry.inkLoad)
      else unavailable.push(prefix + ':P')
      if (entry.inkColor) await add(prefix + ':inkColor', 'C', entry.inkColor)
      else unavailable.push(prefix + ':C')
      await add(prefix + ':coverage', 'cov', entry.coverage)
      // Canonical connected water is coverage.a; independent solvent, when
      // present, is named separately rather than conflated with this gate.
      await add(prefix + ':coverage.a', 'water', entry.coverage, 3)
      for (const name of ['inkDry', 'colorDry', 'solventLoad', 'foreignSolventLoad'] as const) {
        const buffer = entry[name]
        if (buffer) await add(prefix + ':' + name, name, buffer)
        else unavailable.push(prefix + ':' + name)
      }
    }
  }
  // Working fields can change role between passes; preserve actual names,
  // never call pressure.g a height map after pressure was reused for pigment.
  for (let i = 0; i < probe._fieldCache.length; i++) {
    const field = probe._fieldCache[i]
    for (const name of ['a', 'b', 'c', 'ca', 'cb', 'cc', 'coverage', 'mask', 'pressure', 'band'] as const) await add('field' + i + ':' + name, 'working:' + name, field[name])
  }
  // Capture actual texture sampling at native input dimensions, not worldSize.
  // This is diagnostic work AFTER the timed boundary and touches no solver target.
  const payload = await getPaperBytes(paper), resolution = Math.sqrt(payload.length / 2)
  if (!Number.isInteger(resolution)) throw new Error('Paper native dimensions invalid')
  const gl = probe.gl, previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
  const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
  const previousBlend = gl.isEnabled(gl.BLEND), previousScissor = gl.isEnabled(gl.SCISSOR_TEST)
  gl.activeTexture(gl.TEXTURE0)
  const previousTexture0 = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  const height = new ReadbackBuffer(gl, resolution, resolution, 'nearest')
  let program: WebGLProgram | null = null
  try {
    program = createProgram(gl, DISPLAY_VERT, 'precision highp float; varying vec2 v_uv; uniform sampler2D u_paper; void main(){gl_FragColor=texture2D(u_paper,v_uv);}')
    const uniforms = getUniforms(gl, program, ['u_paper']), position = gl.getAttribLocation(program, 'a_position')
    height.beginReplaceDraw(); gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, probe._screenBuf); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, probe._paperTex); gl.uniform1i(uniforms.u_paper, 0)
    gl.disable(gl.SCISSOR_TEST); gl.drawArrays(gl.TRIANGLES, 0, 6); height.endDraw()
    await add('paper:nativeTexture.r', 'h', height, 0)
    await add('paper:nativeTexture.a', 'paperCatch', height, 3)
  } finally {
    if (program) gl.deleteProgram(program); height.destroy()
    gl.useProgram(previousProgram); gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer)
    gl.viewport(previousViewport[0], previousViewport[1], previousViewport[2], previousViewport[3])
    gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, previousTexture0); gl.activeTexture(previousActiveTexture)
    if (previousBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND)
    if (previousScissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST)
  }
  const coverage = fieldCoverage(records, mrtPairs)
  return { stage: 'afterTimedTapeBeforeUndo', records, unavailable, coverage,
    limitations: ['Hash only; readback runs after timed section', 'water=canonical coverage.a; ephemeral PaperWet display clock is excluded', 'working fields named by storage slot, not assumed physical role', 'h is native paper texture sampled to owned RGBA8 at actual dimensions', 'Nonempty roles gate must pass; absent/zero scratch cannot establish parity'] }
}
