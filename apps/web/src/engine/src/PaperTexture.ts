import type { PaperType } from '@art-lessons/shared'
import { PAPER_GEN_VERT, PAPER_GEN_FRAG } from './shaders'
import { createProgram, createFullscreenQuad } from './utils'

// Paper grain configs.
// scale = noise cells across canvas width:
//   at 1057px canvas: scale=150 → cell=7px, scale=250 → cell=4px, scale=400 → cell=2.6px
// warp = domain warp strength (displaces UV by another noise pass — breaks regularity,
//   creates organic fiber-like look instead of grid blobs)
// Contrast/gain lowered across the board (#95) — at the original values all
// three papers read as too bas-relief; real paper grain is a much fainter
// variation. Relative ordering (rough roughest, bristol nearly flat) kept.
//
// #95 follow-up, from real-use feedback: even after the first pass, rough
// still read as coarser than intended — what used to be `smooth`'s level is
// actually the right feel for `rough`. So each tier shifted one notch finer
// (rough takes the old smooth config, smooth takes the old bristol config),
// and bristol got a genuinely new, finer-still config by extrapolating the
// same smooth→bristol step (scale/gain/contrast/warp all continuing their
// prior trend) rather than just inheriting an existing tier.
//
// Second follow-up: "close, but still a bit much" — this time actually
// lowering gain/contrast (the noise's own amplitude) rather than further
// diluting how much the existing noise shows through in DISPLAY_FRAG
// (that dilution was tuned separately and stays as-is). scale/warp
// (grain size/organic-ness) unchanged — only intensity turned down again.
//
// Third follow-up: current bristol is the new reference for "roughest" —
// rough now takes the old bristol config outright, and smooth/bristol
// extrapolate one and two steps finer still (same scale/gain/contrast/warp
// trend as the previous follow-up, continued).
const CONFIGS: Record<PaperType, { scale: number; gain: number; contrast: number; warp: number }> = {
  rough:   { scale: 580,  gain: 0.18,  contrast: 0.3,   warp: 0.15 },
  smooth:  { scale: 780,  gain: 0.135, contrast: 0.225, warp: 0.09 },
  bristol: { scale: 1050, gain: 0.1,   contrast: 0.17,  warp: 0.05 },
}

// Generate paper height map via WebGL shader at full canvas resolution.
// Result is stored as an RGBA texture (no tiling, no sin() artifacts).
//
// `repeat` (#141): false (default) keeps the original CLAMP_TO_EDGE
// behavior — correct for a bounded room, where this texture is generated
// at exactly canvas.width x canvas.height and sampled 0..1 across it
// exactly once, so it never needs to tile. true switches to REPEAT, for
// the infinite-canvas case: there the texture is a fixed, power-of-two
// world-space resolution (see engine/index.ts's _initPaper /
// INFINITE_PAPER_TEX_PIXELS) sampled at world-position-derived UVs that
// routinely fall outside [0,1] as the camera roams — REPEAT is what makes
// that tile seamlessly instead of clamping to a smeared edge color.
// WebGL1 only allows REPEAT on a power-of-two texture, which is why the
// infinite-mode caller always passes a POT width/height.
export function createPaperTexture(
  gl: WebGLRenderingContext, type: PaperType, width: number, height: number, repeat = false,
): WebGLTexture {
  const cfg = CONFIGS[type] ?? CONFIGS.rough

  const prog = createProgram(gl, PAPER_GEN_VERT, PAPER_GEN_FRAG)
  const quad = createFullscreenQuad(gl)

  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)

  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

  gl.viewport(0, 0, width, height)
  gl.disable(gl.BLEND)
  gl.useProgram(prog)

  gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), width, height)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_scale'),    cfg.scale)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_gain'),     cfg.gain)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_contrast'), cfg.contrast)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_warp'),     cfg.warp)
  // #141: same flag that picked the wrap mode above also gates the
  // seamless-noise path in PAPER_GEN_FRAG — see its own comment. Without
  // this, GL_REPEAT would wrap the *sample coordinate* but not the
  // underlying noise's own hash lookups, leaving a hard seam every time
  // the texture tiles.
  gl.uniform1f(gl.getUniformLocation(prog, 'u_seamless'), repeat ? 1.0 : 0.0)

  const posLoc = gl.getAttribLocation(prog, 'a_position')
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(fbo)
  gl.deleteProgram(prog)
  gl.deleteBuffer(quad)

  return tex
}
