import { PAPER_GEN_VERT, PAPER_GEN_FRAG } from './shaders';
import { createProgram, createFullscreenQuad } from './utils';

// Paper grain configs.
// scale = noise cells across canvas width:
//   at 1057px canvas: scale=150 → cell=7px, scale=250 → cell=4px, scale=400 → cell=2.6px
// warp = domain warp strength (displaces UV by another noise pass — breaks regularity,
//   creates organic fiber-like look instead of grid blobs)
const CONFIGS = {
  rough:   { scale: 150, gain: 0.55, contrast: 1.4, warp: 1.5 },
  smooth:  { scale: 260, gain: 0.45, contrast: 0.9, warp: 0.8 },
  bristol: { scale: 420, gain: 0.38, contrast: 0.7, warp: 0.3 },
};

// Generate paper height map via WebGL shader at full canvas resolution.
// Result is stored as a LUMINANCE texture (no tiling, no sin() artifacts).
export function createPaperTexture(gl, type, width, height) {
  const cfg = CONFIGS[type] ?? CONFIGS.rough;

  // --- compile generation program ---
  const prog  = createProgram(gl, PAPER_GEN_VERT, PAPER_GEN_FRAG);
  const quad  = createFullscreenQuad(gl);

  // --- framebuffer to render into ---
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  // --- render ---
  gl.viewport(0, 0, width, height);
  gl.disable(gl.BLEND);
  gl.useProgram(prog);

  gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), width, height);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_scale'),    cfg.scale);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_gain'),     cfg.gain);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_contrast'), cfg.contrast);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_warp'),     cfg.warp);

  const posLoc = gl.getAttribLocation(prog, 'a_position');
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // --- cleanup ---
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteProgram(prog);
  gl.deleteBuffer(quad);

  return tex;
}
