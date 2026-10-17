/** Lossless, opt-in RGBA8 GPU residency. This cache owns no application lifetime. */
export interface ResidentBuffer {
  readonly gl: WebGLRenderingContext
  readonly width: number
  readonly height: number
  readonly mipmapsAllocated?: boolean
  readonly idlePoolBuffer?: boolean
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

/** Known copy operations touch only these bindings. Nested residency transfers
 * preserve their own pixel-store state; released textures must never rebind. */
export function preserveResidencyBindings<T>(gl:WebGLRenderingContext,run:()=>T):T {
 const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null
 const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number
 const texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null
 try{return run()}finally{
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo)
  gl.activeTexture(active)
  gl.bindTexture(gl.TEXTURE_2D,texture&&!releasedTextures.has(texture)?texture:null)
 }
}
/** Synchronous allocation-only scopes; no hooks survive their finally. */
const allocationBindings = new WeakMap<WebGLRenderingContext, () => void>()
export function withBufferAllocationBindings<T>(gl:WebGLRenderingContext,work:()=>T):T {
 const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null
 const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number
 const texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null
 const restore=()=>{
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo)
  gl.activeTexture(active)
  gl.bindTexture(gl.TEXTURE_2D,texture&&!releasedTextures.has(texture)?texture:null)
 }
 const previous=allocationBindings.get(gl)
 allocationBindings.set(gl,restore)
 try{return work()}finally{
  if(previous)allocationBindings.set(gl,previous);else allocationBindings.delete(gl)
  restore()
 }
}
/** Constructor allocation only. Restore even inside a batch: admission for the
 * next buffer must not see the preceding allocation as a bound sampler. */
export function preserveBufferAllocationBindings<T>(gl:WebGLRenderingContext,work:()=>T):T {
 const restore=allocationBindings.get(gl)
 if(!restore)return preserveResidencyBindings(gl,work)
 try{return work()}finally{restore()}
}
/** Internal only: normalize exactly the pixel-store parameters this operation reads. */
function preserveResidencyPixelStore<T>(gl:WebGLRenderingContext,keys:readonly number[],run:()=>T):T {
 const saved=keys.filter(key=>typeof key==='number').map(key=>[key,gl.getParameter(key)] as const)
 try{
  for(const[key]of saved)gl.pixelStorei(key,key===gl.PACK_ALIGNMENT||key===gl.UNPACK_ALIGNMENT?1:0)
  return run()
 }finally{for(const[key,value]of saved)if(value!==null)gl.pixelStorei(key,Number(value))}
}
/** readPixels changes its source framebuffer and reads PACK only. */
export function preserveResidencyReadback<T>(gl:WebGLRenderingContext,run:()=>T):T {
 const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null
 try{return preserveResidencyPixelStore(gl,[gl.PACK_ALIGNMENT],run)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,fbo)}
}
/** Texture creation/upload needs the current bindings and three UNPACK states. */
export function preserveResidencyUpload<T>(gl:WebGLRenderingContext,run:()=>T):T {
 return preserveResidencyBindings(gl,()=>preserveResidencyPixelStore(gl,[gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL],run))
}

export class BufferResidency {
  private entries = new Map<ResidentBuffer, boolean>()
  private pins = new Map<ResidentBuffer, number>()
  private used = 0
  private allocatedBytes = new WeakMap<ResidentBuffer, number>()
  private disposed = false
  readonly gl: WebGLRenderingContext
  private _budgetBytes: number
  get budgetBytes():number{return this._budgetBytes}
  constructor(gl: WebGLRenderingContext, budgetBytes = 96 * 1024 * 1024) {
    this.gl = gl
    this._budgetBytes = budgetBytes
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0) throw new Error('Invalid residency budget')
    const caches = registries.get(gl) ?? new Set()
    caches.add(this)
    registries.set(gl, caches)
  }
  get residentBytes(): number { return this.used }
  get bufferCount(): number { return this.entries.size }
  private bytes(buffer: ResidentBuffer): number {
    return this.allocatedBytes.get(buffer) ?? this.allocationBytes(buffer, buffer.mipmapsAllocated === true)
  }
  private allocationBytes(buffer: ResidentBuffer, mipmaps: boolean): number {
    let { width, height } = buffer
    let bytes = width * height * 4
    if (mipmaps && (width & (width - 1)) === 0 && (height & (height - 1)) === 0) {
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
      const eligible = (buffer: ResidentBuffer, resident: boolean): boolean => resident && buffer !== except
        && !this.pins.has(buffer) && !draws.get(this.gl)?.some(scope => scope.has(buffer)) && !this.bound(buffer)
      const candidates = [...this.entries]
      // Idle opt-in pool leases have no observable contents. Prefer retiring
      // those before a live material plane, preserving all pin/binding checks.
      const victim = candidates.find(([buffer, resident]) => buffer.idlePoolBuffer && eligible(buffer, resident))
        ?? candidates.find(([buffer, resident]) => eligible(buffer, resident))
      if (!victim) throw new Error('Residency budget exhausted: all buffers pinned or bound')
      victim[0]._residencyEvict()
      this.entries.set(victim[0], false)
      this.used -= this.bytes(victim[0])
    }
  }
  /** Commit a lower cap only after lossless eviction; never evict pins/bound draws. */
  trySetBudget(bytes:number):{ok:true}|{ok:false;reason:string}{
    if(this.disposed||!Number.isSafeInteger(bytes)||bytes<=0)return {ok:false,reason:'invalid-budget'}
    if(bytes>=this.used){this._budgetBytes=bytes;return {ok:true}}
    const victims:ResidentBuffer[]=[];let remaining=this.used
    try{
      for(const [buffer,resident]of this.entries){
        if(!resident||this.pins.has(buffer)||draws.get(this.gl)?.some(scope=>scope.has(buffer))||this.bound(buffer))continue
        victims.push(buffer);remaining-=this.bytes(buffer);if(remaining<=bytes)break
      }
      if(remaining>bytes)return {ok:false,reason:'pinned-or-bound'}
      for(const buffer of victims){buffer._residencyEvict();this.entries.set(buffer,false);this.used-=this.bytes(buffer)}
    }catch{return {ok:false,reason:'eviction-failed'}}
    this._budgetBytes=bytes;return {ok:true}
  }
  register(buffer: ResidentBuffer): void {
    if (this.disposed || buffer.gl !== this.gl) throw new Error('Invalid residency cache/context')
    if (this.entries.has(buffer)) return
    this.allocatedBytes.set(buffer, this.allocationBytes(buffer, buffer.mipmapsAllocated === true))
    this.reserve(this.bytes(buffer), buffer)
    this.entries.set(buffer, true)
    this.used += this.bytes(buffer)
  }
  /** Admit the additional levels before generateMipmap can allocate them.
   * Data fields never generate mips and pay only for their level zero. */
  requireMipmaps(buffer: ResidentBuffer): void {
    const required = this.allocationBytes(buffer, true)
    if (required > this.budgetBytes) throw new Error('Buffer mipmaps exceed residency budget')
    this.runPinned([buffer], () => {
      this.touch(buffer)
      const extra = required - this.bytes(buffer)
      if (extra <= 0) return
      this.reserve(extra, buffer)
      this.allocatedBytes.set(buffer, required)
      this.used += extra
    })
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
    this.allocatedBytes.delete(buffer)
  }
  /** Context loss invalidates current pixels; never fabricate stale CPU data. */
  forgetContext(): void {
    for (const buffer of this.entries.keys()) buffer._residencyForget()
    this.entries.clear()
    this.allocatedBytes = new WeakMap()
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
