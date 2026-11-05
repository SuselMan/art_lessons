/** Per-painter GPU residency, conservatively charged as RGBA including mips.
 * Active draw-group resources may exceed the target; evicting one of those
 * would invalidate a bound sampler or re-upload the same working set forever. */
export class BrushTextureCache {
  private readonly entries = new Map<string, { texture: WebGLTexture; bytes: number }>()
  private protectedKeys = new Set<string>()
  private readonly leases = new Map<symbol, readonly { key: string; bytes: number }[]>()
  private usedBytes = 0
  private readonly gl: WebGLRenderingContext
  private readonly targetBytes: number
  constructor(gl: WebGLRenderingContext, targetBytes = 16 * 1024 * 1024) { this.gl = gl; this.targetBytes = targetBytes }
  get bytes(): number { return this.usedBytes }
  protect(keys: readonly string[]): void {
    this.protectedKeys = new Set(keys)
    this.trim()
  }
  /** Synchronous paint-batch pinning, admitted only within the unchanged byte
   * target. It prevents a partially resident animation's sequential scan from
   * evicting its own later frames. No gesture/lifetime residency is promised. */
  lease(resources: readonly { key: string; bytes: number }[]): () => void {
    const union = new Map<string, number>()
    for (const group of this.leases.values()) for (const item of group) union.set(item.key,item.bytes)
    for (const item of resources) union.set(item.key,item.bytes)
    if ([...union.values()].reduce((sum,bytes)=>sum+bytes,0) > this.targetBytes) return () => {}
    const token = Symbol()
    this.leases.set(token,resources)
    // The previous draw group can still be bound here. The caller switches
    // it before loading; changing residency now could evict a live sampler.
    return () => { this.leases.delete(token); this.trim() }
  }
  get(key: string): WebGLTexture | undefined {
    const entry = this.entries.get(key)
    if (entry) { this.entries.delete(key); this.entries.set(key, entry) }
    return entry?.texture
  }
  put(key: string, texture: WebGLTexture, bytes: number): void {
    if (!this.protectedKeys.has(key)) throw new Error('Resolve a protected brush group before uploading')
    const previous = this.entries.get(key)
    if (previous) throw new Error('Brush texture cache entry already exists')
    this.entries.set(key, { texture, bytes })
    this.usedBytes += bytes
    this.trim()
  }
  clear(lost = false): void {
    if (!lost) for (const entry of this.entries.values()) this.gl.deleteTexture(entry.texture)
    this.entries.clear(); this.protectedKeys.clear(); this.leases.clear(); this.usedBytes = 0
  }
  private trim(): void {
    let protectedBytes = 0
    for (const [key, entry] of this.entries) if (this.protectedKeys.has(key)) protectedBytes += entry.bytes
    const limit = Math.max(this.targetBytes, protectedBytes)
    let protectedKeys = this.protectedKeys
    if (this.leases.size) {
      protectedKeys = new Set(this.protectedKeys)
      for (const group of this.leases.values()) for (const item of group) protectedKeys.add(item.key)
      let unionBytes = 0
      for (const [key,entry] of this.entries) if (protectedKeys.has(key)) unionBytes += entry.bytes
      // An unplanned/oversized nested draw takes precedence over optional batch
      // pins. Never enlarge the old max(target,current draw working set) bound.
      if (unionBytes > limit) { this.leases.clear(); protectedKeys = this.protectedKeys }
    }
    for (const [key, entry] of this.entries) {
      if (this.usedBytes <= limit) break
      if (protectedKeys.has(key)) continue
      this.gl.deleteTexture(entry.texture); this.entries.delete(key); this.usedBytes -= entry.bytes
    }
  }
}

/** Upload does not bind an FBO or leave a different sampler/packing state.
 * Resolve the entire protected group before the caller binds it for drawing. */
export function uploadBrushTexture(gl: WebGLRenderingContext, levels: readonly Uint8Array[], format: number, wrapMode: number, discrete = false, plane?: { width: number; height: number }): { texture: WebGLTexture; bytes: number } {
  const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
  const previous = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  const unpack = gl.getParameter(gl.UNPACK_ALIGNMENT) as number
  const texture = gl.createTexture()
  if (!texture) throw new Error('Brush texture allocation failed')
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    let bytes = 0
    for (const [level, pixels] of (discrete ? levels.slice(0,1) : levels).entries()) {
      const channels=format===gl.RGBA ? 4 : format===gl.LUMINANCE_ALPHA ? 2 : 1
      const size = Math.sqrt(pixels.length/channels)
      const width = plane?.width ?? size, height = plane?.height ?? size
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || pixels.length !== width * height * channels || plane && (levels.length !== 1 || level !== 0 || wrapMode !== gl.CLAMP_TO_EDGE)) throw Error('Invalid brush texture plane dimensions')
      gl.texImage2D(gl.TEXTURE_2D, level, format, width, height, 0, format, gl.UNSIGNED_BYTE, pixels)
      bytes += width * height * 4
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, plane ? gl.LINEAR : discrete ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, discrete ? gl.NEAREST : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode)
    return { texture, bytes }
  } catch (error) {
    gl.deleteTexture(texture)
    throw error
  } finally {
    gl.activeTexture(active)
    gl.bindTexture(gl.TEXTURE_2D, previous)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpack)
  }
}
