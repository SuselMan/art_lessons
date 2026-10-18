// WebGL1 plumbing: context, float/half-float render targets that are proven
// renderable (not just "extension present"), small program helper, ping-pong.

export function createContext(canvas, opts = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: !!opts.preserve,
    powerPreference: 'high-performance',
  })
  if (!gl) throw new Error('WebGL1 недоступен')
  return gl
}

const VS = `attribute vec2 a;
varying vec2 v_uv;
void main(){ v_uv = a*0.5+0.5; gl_Position = vec4(a,0.0,1.0); }`

export function makeQuad(gl) {
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  return buf
}

export function makeProgram(gl, name, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`${name}: compile: ${gl.getShaderInfoLog(s)}`)
    }
    return s
  }
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
  gl.bindAttribLocation(p, 0, 'a')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${name}: link: ${gl.getProgramInfoLog(p) || '(пустой лог)'}`)
  }
  const uni = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)
    uni[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name)
  }
  return { p, uni, name, fsLength: fs.length }
}

function makeTex(gl, w, h, type, filter) {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null)
  return t
}

export function makeTarget(gl, w, h, type) {
  const tex = makeTex(gl, w, h, type, gl.NEAREST)
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fb, w, h, ok: status === gl.FRAMEBUFFER_COMPLETE }
}

export function destroyTarget(gl, t) {
  gl.deleteFramebuffer(t.fb)
  gl.deleteTexture(t.tex)
}

export class PingPong {
  constructor(gl, w, h, type) {
    this.a = makeTarget(gl, w, h, type)
    this.b = makeTarget(gl, w, h, type)
  }
  get read() { return this.a }
  get write() { return this.b }
  swap() { const t = this.a; this.a = this.b; this.b = t }
  destroy(gl) { destroyTarget(gl, this.a); destroyTarget(gl, this.b) }
}

// Probe which float format we can actually render into, and how precise it is.
// "Extension present" is not enough: iOS exposes OES_texture_float but refuses
// float colour attachments on some versions, and half-float needs its own ext.
// We write 1 + 1/4096 into the target and read it back through an 8-bit pass:
// fp32 keeps the 1/4096, fp16 (10-bit mantissa, step 1/1024 at 1.0) loses it.
export function probeFloatTargets(gl, quad) {
  const exts = {
    float: gl.getExtension('OES_texture_float'),
    half: gl.getExtension('OES_texture_half_float'),
    cbFloat: gl.getExtension('WEBGL_color_buffer_float'),
    cbHalf: gl.getExtension('EXT_color_buffer_half_float'),
  }
  const candidates = []
  if (exts.float) candidates.push({ name: 'float32', type: gl.FLOAT })
  if (exts.half) candidates.push({ name: 'half16', type: exts.half.HALF_FLOAT_OES })

  const writeProg = makeProgram(gl, 'probeWrite', `precision highp float;
    uniform float u_v; void main(){ gl_FragColor = vec4(u_v, 1.0 + 1.0/4096.0, 0.25, 1.0); }`)
  const readProg = makeProgram(gl, 'probeRead', `precision highp float;
    uniform sampler2D u_t; varying vec2 v_uv;
    void main(){ vec4 c = texture2D(u_t, v_uv);
      gl_FragColor = vec4(c.r, clamp((c.g - 1.0) * 4096.0 * 0.5, 0.0, 1.0), c.b, 1.0); }`)
  const out = makeTarget(gl, 4, 4, gl.UNSIGNED_BYTE)
  const results = []
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  for (const c of candidates) {
    const t = makeTarget(gl, 4, 4, c.type)
    let renders = false, precise = false
    if (t.ok) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
      gl.viewport(0, 0, 4, 4)
      gl.useProgram(writeProg.p)
      gl.uniform1f(writeProg.uni.u_v, 0.5)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb)
      gl.useProgram(readProg.p)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, t.tex)
      gl.uniform1i(readProg.uni.u_t, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const px = new Uint8Array(4)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      renders = Math.abs(px[0] - 128) <= 2 && Math.abs(px[2] - 64) <= 2
      precise = px[1] > 100 // ≈127 for fp32, 0 for fp16
    }
    destroyTarget(gl, t)
    results.push({ ...c, complete: t.ok, renders, precise })
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  destroyTarget(gl, out)
  gl.deleteProgram(writeProg.p)
  gl.deleteProgram(readProg.p)
  return {
    exts: Object.fromEntries(Object.entries(exts).map(([k, v]) => [k, !!v])),
    results,
  }
}

// Separable box blur with wrap-around (the paper tile is seamless).
function boxBlurWrap(a, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n)
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < n; y++) {
    const row = y * n
    let s = 0
    for (let i = -r; i <= r; i++) s += a[row + ((i + n) % n)]
    for (let x = 0; x < n; x++) {
      tmp[row + x] = s * k
      s += a[row + ((x + r + 1) % n)] - a[row + ((x - r + n) % n)]
    }
  }
  for (let x = 0; x < n; x++) {
    let s = 0
    for (let i = -r; i <= r; i++) s += tmp[((i + n) % n) * n + x]
    for (let y = 0; y < n; y++) {
      out[y * n + x] = s * k
      s += tmp[((y + r + 1) % n) * n + x] - tmp[((y - r + n) % n) * n + x]
    }
  }
  return out
}

export function loadPaperTexture(gl, url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Two channels: L = raw height (grain, granulation), A = height blurred
      // over a few texels (what the water "feels" as the slope of the sheet).
      const n = img.width
      const cv = document.createElement('canvas')
      cv.width = n; cv.height = n
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const src = ctx.getImageData(0, 0, n, n).data
      const raw = new Float32Array(n * n)
      for (let i = 0; i < n * n; i++) raw[i] = src[i * 4]
      const blur = boxBlurWrap(boxBlurWrap(raw, n, 3), n, 3)
      const packed = new Uint8Array(n * n * 2)
      for (let i = 0; i < n * n; i++) {
        packed[i * 2] = raw[i]
        // stretch the blurred plane back to a usable range (blur shrinks the spread)
        packed[i * 2 + 1] = Math.max(0, Math.min(255, 127.5 + (blur[i] - 127.5) * 3.0))
      }
      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, n, n, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, packed)
      // LINEAR: at a sheet scale (A4 = 1.65 texels per cell) NEAREST aliases;
      // at 1 texel per cell the samples land on texel centres and both agree
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      resolve({ tex: t, size: img.width })
    }
    img.onerror = () => reject(new Error('не загрузилась бумага ' + url))
    img.src = url
  })
}
