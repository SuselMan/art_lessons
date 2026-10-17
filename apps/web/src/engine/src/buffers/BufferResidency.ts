/** Lossless, opt-in RGBA8 GPU residency. This cache owns no application lifetime. */
export interface ResidentBuffer {
  readonly gl: WebGLRenderingContext
  readonly width: number
  readonly height: number
  _texture: WebGLTexture
  _fbo: WebGLFramebuffer
  destroy(): void
  _residencyEvict(): void
  _residencyHydrate(): void
  _residencyForget(): void
}

const releasedTextures = new WeakSet<WebGLTexture>()
export function releaseResidencyTexture(texture: WebGLTexture): void { releasedTextures.add(texture) }

const registries = new WeakMap<WebGLRenderingContext, Set<BufferResidency>>()
const draws = new WeakMap<WebGLRenderingContext, Set<ResidentBuffer>[]>()

export function beginResidencyDraw(gl: WebGLRenderingContext, output: ResidentBuffer): void {
  if (!registries.has(gl)) return
  const stack = draws.get(gl) ?? []
  stack.push(new Set([output]))
  draws.set(gl, stack)
}
export function endResidencyDraw(gl: WebGLRenderingContext): void { draws.get(gl)?.pop() }

/** Internal transfers preserve the caller's target and current sampler binding. */
export function preserveResidencyState<T>(gl: WebGLRenderingContext, run: () => T): T {
  const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
  const texture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  const pixelState = [gl.PACK_ALIGNMENT, gl.UNPACK_ALIGNMENT, gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL]
    .filter(key => typeof key === 'number')
    .map(key => [key, gl.getParameter(key)] as const)
  for (const [key] of pixelState) gl.pixelStorei(key, key === gl.PACK_ALIGNMENT || key === gl.UNPACK_ALIGNMENT ? 1 : 0)
  try { return run() } finally {
    for (const [key, value] of pixelState) if (value !== null) gl.pixelStorei(key, Number(value))
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.activeTexture(active)
    gl.bindTexture(gl.TEXTURE_2D, texture && !releasedTextures.has(texture) ? texture : null)
  }
}

export class BufferResidency {
  private entries = new Map<ResidentBuffer, boolean>()
  private pins = new Map<ResidentBuffer, number>()
  private used = 0
  private disposed = false
  readonly gl: WebGLRenderingContext
  readonly budgetBytes: number
  constructor(gl: WebGLRenderingContext, budgetBytes = 96 * 1024 * 1024) {
    this.gl = gl
    this.budgetBytes = budgetBytes
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0) throw new Error('Invalid residency budget')
    const caches = registries.get(gl) ?? new Set()
    caches.add(this)
    registries.set(gl, caches)
  }
  get residentBytes(): number { return this.used }
  get bufferCount(): number { return this.entries.size }
  private bytes(buffer: ResidentBuffer): number {
    let { width, height } = buffer
    let bytes = width * height * 4
    // Reserve the possible mip chain up front; generating it cannot exceed cap.
    if ((width & (width - 1)) === 0 && (height & (height - 1)) === 0) {
      while (width > 1 || height > 1) {
        width = Math.max(1, width >> 1); height = Math.max(1, height >> 1)
        bytes += width * height * 4
      }
    }
    return bytes
  }
  private bound(buffer: ResidentBuffer): boolean {
    const gl = this.gl
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === buffer._fbo) return true
    if (!draws.get(gl)?.length) return false
    const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    try {
      const count = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) as number
      for (let i = 0; i < count; i++) {
        gl.activeTexture(gl.TEXTURE0 + i)
        if (gl.getParameter(gl.TEXTURE_BINDING_2D) === buffer._texture) return true
      }
      return false
    } finally { gl.activeTexture(active) }
  }
  private reserve(bytes: number, except: ResidentBuffer): void {
    if (bytes > this.budgetBytes) throw new Error('Buffer exceeds residency budget')
    while (this.used + bytes > this.budgetBytes) {
      const victim = [...this.entries].find(([buffer, resident]) => resident && buffer !== except
        && !this.pins.has(buffer) && !draws.get(this.gl)?.some(scope => scope.has(buffer)) && !this.bound(buffer))
      if (!victim) throw new Error('Residency budget exhausted: all buffers pinned or bound')
      victim[0]._residencyEvict()
      this.entries.set(victim[0], false)
      this.used -= this.bytes(victim[0])
    }
  }
  register(buffer: ResidentBuffer): void {
    if (this.disposed || buffer.gl !== this.gl) throw new Error('Invalid residency cache/context')
    if (this.entries.has(buffer)) return
    this.reserve(this.bytes(buffer), buffer)
    this.entries.set(buffer, true)
    this.used += this.bytes(buffer)
  }
  touch(buffer: ResidentBuffer): void {
    if (!this.entries.has(buffer)) throw new Error('Buffer residency unavailable')
    const scope = draws.get(this.gl)?.at(-1)
    scope?.add(buffer)
    if (!this.entries.get(buffer)) {
      this.reserve(this.bytes(buffer), buffer)
      buffer._residencyHydrate()
      this.used += this.bytes(buffer)
    }
    this.entries.delete(buffer)
    this.entries.set(buffer, true)
  }
  runPinned<T>(buffers: readonly ResidentBuffer[], run: () => T): T {
    for (const buffer of buffers) this.pins.set(buffer, (this.pins.get(buffer) ?? 0) + 1)
    try { return run() } finally {
      for (const buffer of buffers) {
        const count = this.pins.get(buffer)! - 1
        if (count) this.pins.set(buffer, count)
        else this.pins.delete(buffer)
      }
    }
  }
  remove(buffer: ResidentBuffer): void {
    if (this.entries.get(buffer)) this.used -= this.bytes(buffer)
    this.entries.delete(buffer)
    this.pins.delete(buffer)
  }
  /** Context loss invalidates current pixels; never fabricate stale CPU data. */
  forgetContext(): void {
    for (const buffer of this.entries.keys()) buffer._residencyForget()
    this.entries.clear()
    this.pins.clear()
    this.used = 0
    draws.delete(this.gl)
  }
  dispose(): void {
    for (const buffer of this.entries.keys()) buffer.destroy()
    registries.get(this.gl)?.delete(this)
    this.disposed = true
  }
}
