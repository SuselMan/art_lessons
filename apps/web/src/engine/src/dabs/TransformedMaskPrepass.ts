import type { SourceDabMaterialSpec } from '../presets/sourceDabCache';
import { buildRgba64FactorLut } from '../raster/sourceRgba64StraightShader';
import { SOURCE_TRANSFORMED_MASK_VERT, sourceTransformedMaskFragment } from '../raster/sourceTransformedMaskShader';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache } from './BrushTextureCache';
import { resolvedTransformedMaskPlan, writeTransformedMaskVertices, type TransformedMaskPlan } from './TransformedMaskPlan';
export interface TransformedMaskLimits {
  readonly width: number;
  readonly height: number;
  readonly slots: number;
}
export interface TransformedMaskSource {
  readonly key: string;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}
export interface TransformedMaskRequest {
  readonly owner: object;
  readonly role: string;
  readonly material: SourceDabMaterialSpec;
  readonly source: TransformedMaskSource;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly profile: 'wide8-separate-wordsize64' | 'neon4-summed-wordsize64';
}
export interface TransformedMaskView {
  readonly key: string;
  readonly texture: WebGLTexture;
  readonly rect: TransformedMaskRequest['rect'];
  /** Allocation UVs, no original-tip transform must be applied again. */
  readonly bounds: {
    readonly x: 0;
    readonly y: 0;
    readonly width: number;
    readonly height: number;
  };
  readonly mirror: {
    readonly horizontal: boolean;
    readonly vertical: boolean;
  };
  readonly channel: 'r';
}
interface Slot {
  key: string;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  owner?: object;
  role?: string;
  revision?: string;
  material?: SourceDabMaterialSpec;
  plan?: TransformedMaskPlan;
  profile?: string;
  sourceKey?: string;
  used: number;
}
interface Workspace {
  low: WebGLTexture;
  high: WebGLTexture;
  buffer: WebGLBuffer;
  vao?: WebGLVertexArrayObjectOES;
}
const FACTOR_BYTES = 524288, FLOATS_PER_ROW = 72, PLAN_BYTES_PER_ROW = 256;
const safe = (v: number, low: number, high: number) => Number.isSafeInteger(v) && v >= low && v <= high;
/** Internal opt-in service, not connected to painters or a wire descriptor.
* Its texture cache is the existing painter's cache, NEVER a new independent
* memory allowance. Call prepare after assets and before input unlock.
*/
export class TransformedMaskPrepass {
  private limits?: TransformedMaskLimits;
  private sources = new Map<string, number>();
  private workspace?: Workspace;
  private slots: (Slot | undefined)[] = [];
  private staging?: Float32Array;
  private program?: WebGLProgram;
  private attributes: number[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private releaseCpu?: () => void;
  private reservedCpuBytes = 0;
  private clock = 0;
  private activeGroup?: symbol;
  private instancing: ANGLE_instanced_arrays | null = null;
  private vertexArrays: OES_vertex_array_object | null = null;
  private readonly workspaceKey: string;
  private readonly gl: WebGLRenderingContext;
  private readonly cache: BrushTextureCache;
  private readonly cpu: BrushMipCache;
  private readonly prefix: string;
  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache, prefix: string) {
    this.gl = gl;
    this.cache = cache;
    this.cpu = cpu;
    this.prefix = prefix;
    if (!prefix || prefix.includes('\0'))
      throw new RangeError('Missing prepass resource scope');
    this.workspaceKey = `${prefix}:workspace`;
  }
  /** All metadata/budgets are checked before allocation or cache eviction.
  * Source entries must already be prepared straight RGBA8 gray+alpha levels.
  * Caller accounts expansion scratch during source preparation separately.
  */
  prepare(limits: TransformedMaskLimits, sourceResources: readonly {
    key: string;
    bytes: number;
  }[], signal?: AbortSignal): 'ready' | 'cancelled' {
    if (signal?.aborted)
      return 'cancelled';
    if (!safe(limits.width, 1, 4096) || !safe(limits.height, 1, 4096) || limits.width * limits.height > 1048576 || !safe(limits.slots, 1, 8))
      throw new RangeError('Invalid prepass capacity');
    const sourceMap = new Map<string, number>();
    for (const source of sourceResources) {
      if (!source.key || source.key.startsWith(this.prefix + ':') || !safe(source.bytes, 1, Number.MAX_SAFE_INTEGER))
        throw new RangeError('Invalid prepared source budget');
      if (sourceMap.has(source.key) && sourceMap.get(source.key) !== source.bytes)
        throw new RangeError('Conflicting source budget');
      if (this.cache.resourceBytes(source.key) !== source.bytes || !this.cache.get(source.key))
        throw new RangeError('Source bank must be prepared before the prepass');
      sourceMap.set(source.key, source.bytes);
    }
    const vertexBytes = limits.height * FLOATS_PER_ROW * 4;
    const cpuBytes = vertexBytes + limits.height * PLAN_BYTES_PER_ROW * limits.slots * 2 + FACTOR_BYTES;
    const gpuBytes = FACTOR_BYTES + vertexBytes + limits.width * limits.height * 4 * limits.slots + [...sourceMap.values()].reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(gpuBytes) || gpuBytes > this.cache.budgetBytes || cpuBytes + this.cpu.reservedBytes - this.reservedCpuBytes > this.cpu.budgetBytes)
      throw new RangeError('Prepass working set exceeds existing brush budgets');
    const precision = this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER, this.gl.HIGH_FLOAT);
    const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (!precision || precision.precision < 23 || Math.max(256, limits.width, limits.height) > maximum)
      throw new RangeError('Unverified prepass GPU capability');
    if (this.limits) {
      if (this.limits.width !== limits.width || this.limits.height !== limits.height || this.limits.slots !== limits.slots)
        throw new Error('Reset prepass before changing prepared capacity');
      if (this.isReady()) {
        this.sources = sourceMap;
        return 'ready';
      }
      throw new Error('Reset and prepare evicted prepass resources before input');
    }
    this.instancing = this.gl.getExtension('ANGLE_instanced_arrays');
    this.vertexArrays = this.gl.getExtension('OES_vertex_array_object');
    const release = this.cpu.reserve(cpuBytes);
    const group = [...sourceMap.keys(), this.workspaceKey, ...Array.from({ length: limits.slots }, (_, i) => `${this.prefix}:slot:${i}`)];
    const restore = this.saveState([]);
    try {
      this.cache.protect(group);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.staging = new Float32Array(limits.height * FLOATS_PER_ROW);
      this.compile();
      const lut = buildRgba64FactorLut(), low = this.texture(256, 256, lut.low);
      let high: WebGLTexture | undefined, buffer: WebGLBuffer | null = null;
      try {
        high = this.texture(256, 256, lut.high);
        buffer = this.gl.createBuffer();
        if (!buffer)
          throw new Error('Prepass VBO allocation failed');
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexBytes, this.gl.STREAM_DRAW);
        const vaoExtension = this.vertexArrays;
        const vao = vaoExtension?.createVertexArrayOES() ?? undefined;
        if (vaoExtension && !vao) throw new Error('Prepass VAO allocation failed');
        const workspace: Workspace = { low, high, buffer, vao };
        this.cache.put(this.workspaceKey, low, FACTOR_BYTES + vertexBytes, lost => {
          if (!lost) {
            this.gl.deleteTexture(workspace.high);
            this.gl.deleteBuffer(workspace.buffer);
            if (workspace.vao) vaoExtension!.deleteVertexArrayOES(workspace.vao);
          }
          if (this.workspace === workspace)
            this.workspace = undefined;
        });
        this.workspace = workspace;
      }
      catch (error) {
        this.gl.deleteTexture(low);
        if (high)
          this.gl.deleteTexture(high);
        if (buffer)
          this.gl.deleteBuffer(buffer);
        throw error;
      }
      for (let i = 0; i < limits.slots; i++) {
        const texture = this.texture(limits.width, limits.height, null), framebuffer = this.gl.createFramebuffer();
        if (!framebuffer) {
          this.gl.deleteTexture(texture);
          throw new Error('Prepass FBO allocation failed');
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);
        if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
          this.gl.deleteFramebuffer(framebuffer);
          this.gl.deleteTexture(texture);
          throw new Error('Prepass FBO incomplete');
        }
        const slot: Slot = { key: `${this.prefix}:slot:${i}`, texture, framebuffer, used: 0 };
        this.slots[i] = slot;
        this.cache.put(slot.key, texture, limits.width * limits.height * 4, lost => {
          if (!lost)
            this.gl.deleteFramebuffer(slot.framebuffer);
          if (this.slots[i] === slot)
            this.slots[i] = undefined;
        });
      }
      if (signal?.aborted) {
        this.reset(false);
        release();
        return 'cancelled';
      }
      this.limits = { ...limits };
      this.sources = sourceMap;
      this.releaseCpu = release;
      this.reservedCpuBytes = cpuBytes;
      return 'ready';
    }
    catch (error) {
      this.reset(false);
      release();
      throw error;
    }
    finally {
      restore();
    }
  }
  isReady(): boolean {
    return !!this.limits && !!this.workspace && this.cache.get(this.workspaceKey) === this.workspace.low && this.slots.length === this.limits.slots && this.slots.every(slot => !!slot && this.cache.get(slot.key) === slot.texture);
  }
  /** Holds all source/LUT/target entries through the caller's synchronous draw.
  * Caller MUST release in finally. No GL state is touched on a cache hit.
  */
  resolveGroup(requests: readonly TransformedMaskRequest[]): {
    views: TransformedMaskView[];
    release: () => void;
  } {
    if (this.activeGroup)
      throw new Error('Release the previous prepass group before resolving another');
    if (!this.isReady() || !this.limits || !this.workspace || !this.program || !this.staging)
      throw new Error('Prepass is not prepared');
    if (requests.length > this.limits.slots)
      throw new RangeError('Prepass simultaneous-role capacity exceeded');
    const seen = new Map<object, Set<string>>();
    const prepared = requests.map(request => {
      if (!request.owner || typeof request.owner !== 'object' || !request.role || !['wide8-separate-wordsize64', 'neon4-summed-wordsize64'].includes(request.profile))
        throw new RangeError('Invalid prepass owner/profile');
      let roles = seen.get(request.owner);
      if (!roles) {
        roles = new Set();
        seen.set(request.owner, roles);
      }
      if (roles.has(request.role))
        throw new RangeError('Duplicate prepass role');
      roles.add(request.role);
      const material = request.material;
      if (!material || !material.brush || !material.shape || !material.key || !material.mirror || typeof material.mirror.horizontal !== 'boolean' || typeof material.mirror.vertical !== 'boolean')
        throw new RangeError('Invalid saved source material');
      const immutable = Object.isFrozen(material) && Object.isFrozen(material.brush) && Object.isFrozen(material.shape) && Object.isFrozen(material.key);
      const previous = this.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.material === material && slot.sourceKey === request.source.key && slot.profile === request.profile);
      const source = request.source, rect = request.rect;
      const k = material.key;
      const revision = immutable && previous?.revision ? previous.revision : JSON.stringify([request.profile, source.key, material.brushIdentity, material.width, material.height, material.brush.width, material.brush.height, material.brush.scale, material.brush.angle, material.shape.scale, material.shape.ratio, material.shape.rotation, k.subPixelX, k.subPixelY, k.color, k.softness, k.lightness, k.index, k.mirrorH, k.mirrorV].map(v => Object.is(v, -0) ? '-0' : v));
      const same = this.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision);
      const plan = same?.plan ?? resolvedTransformedMaskPlan(material);
      if (plan.width > this.limits!.width || plan.height > this.limits!.height || plan.spans.length > this.limits!.height
        || !safe(source.width, 1, 4096) || !safe(source.height, 1, 4096) || source.width !== plan.levelWidth + 2 || source.height !== plan.levelHeight + 2
        || (this.sources.get(source.key) ?? 0) < source.width * source.height * 4 || this.cache.get(source.key) !== source.texture
        || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.width !== plan.width || rect.height !== plan.height)
        throw new RangeError('Unprepared material geometry/source');
      // Validate every new native row before any GL ownership side effect.
      if (!same)
        writeTransformedMaskVertices(plan, this.staging!);
      return { request, plan, revision };
    });
    const slots = this.slots as Slot[], selected = new Set<Slot>();
    // Reserve all existing hits before choosing an LRU destination for misses.
    const hits = prepared.map(item => {
      const slot = slots.find(s => !selected.has(s) && s.owner === item.request.owner && s.role === item.request.role && s.revision === item.revision);
      if (slot)
        selected.add(slot);
      return slot;
    });
    const assigned = prepared.map((item, index) => {
      const slot = hits[index] ?? slots.filter(s => !selected.has(s)).sort((a, b) => a.used - b.used)[0];
      selected.add(slot);
      return { ...item, slot };
    });
    const resources = [{ key: this.workspaceKey, bytes: FACTOR_BYTES + this.staging.byteLength }, ...slots.map(s => ({ key: s.key, bytes: this.limits!.width * this.limits!.height * 4 })), ...[...this.sources].map(([key, bytes]) => ({ key, bytes }))];
    this.cache.protect(resources.map(r => r.key));
    const releaseResources = this.cache.lease(resources), token = Symbol('prepass-group');
    this.activeGroup = token;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseResources();
      if (this.activeGroup === token) this.activeGroup = undefined;
    };
    try {
      const misses = assigned.filter(item => item.slot.revision !== item.revision || item.slot.owner !== item.request.owner || item.slot.role !== item.request.role);
      if (misses.length) {
        const restore = this.saveState(this.attributes);
        try {
          for (const item of misses) {
            item.slot.revision = undefined;
            item.slot.material = undefined;
            item.slot.plan = undefined;
            this.draw(item.slot, item.request, item.plan);
            item.slot.revision = item.revision;
            item.slot.owner = item.request.owner;
            item.slot.role = item.request.role;
            item.slot.material = item.request.material;
            item.slot.plan = item.plan;
            item.slot.sourceKey = item.request.source.key;
            item.slot.profile = item.request.profile;
          }
        }
        finally {
          restore();
        }
      }
      const views = assigned.map(({ slot, request, plan }) => {
        slot.material = request.material;
        slot.used = ++this.clock;
        return { key: slot.key, texture: slot.texture, rect: { ...request.rect }, bounds: { x: 0 as const, y: 0 as const, width: plan.width / this.limits!.width, height: plan.height / this.limits!.height },
          mirror: { horizontal: request.material.mirror.horizontal, vertical: request.material.mirror.vertical }, channel: 'r' as const };
      });
      return { views, release };
    }
    catch (error) {
      release();
      throw error;
    }
  }
  releaseOwner(owner: object): void { for (const slot of this.slots)
    if (slot?.owner === owner) {
      slot.owner = undefined;
      slot.role = undefined;
      slot.revision = undefined;
      slot.material = undefined;
      slot.plan = undefined;
      slot.sourceKey = undefined;
      slot.profile = undefined;
    } }
  reset(lost = false): void {
    // Old returned releases can never unlock a newly prepared group.
    this.activeGroup = undefined;
    for (const slot of [...this.slots])
      if (slot)
        this.cache.discard(slot.key, lost);
    this.cache.discard(this.workspaceKey, lost);
    if (this.program && !lost)
      this.gl.deleteProgram(this.program);
    this.program = undefined;
    this.workspace = undefined;
    this.slots = [];
    this.staging = undefined;
    this.limits = undefined;
    this.sources.clear();
    this.attributes = [];
    this.uniforms = {};
    this.instancing = null;
    this.vertexArrays = null;
    this.releaseCpu?.();
    this.releaseCpu = undefined;
    this.reservedCpuBytes = 0;
  }
  private texture(width: number, height: number, data: Uint8Array | null): WebGLTexture {
    const gl = this.gl, texture = gl.createTexture();
    if (!texture)
      throw new Error('Prepass texture allocation failed');
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }
  private compile(): void {
    const gl = this.gl, shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, SOURCE_TRANSFORMED_MASK_VERT], [gl.FRAGMENT_SHADER, sourceTransformedMaskFragment()]] as const) {
        const shader = gl.createShader(type);
        if (!shader)
          throw new Error('Prepass shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error('Prepass shader compile failed: ' + gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      if (!program)
        throw new Error('Prepass program allocation failed');
      for (const shader of shaders)
        gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Prepass program link failed');
      this.attributes = ['a_position', 'a_origin', 'a_step', 'a_span'].map(name => gl.getAttribLocation(program!, name));
      if (this.attributes.some(index => index < 0))
        throw new Error('Prepass attribute unavailable');
      for (const name of ['u_targetSize', 'u_source', 'u_sourceSize', 'u_factorLow', 'u_factorHigh', 'u_decode', 'u_summed', 'u_directCopy'])
        this.uniforms[name] = gl.getUniformLocation(program, name);
      this.program = program;
    }
    catch (error) {
      if (program)
        gl.deleteProgram(program);
      throw error;
    }
    finally {
      for (const shader of shaders)
        gl.deleteShader(shader);
    }
  }
  private draw(slot: Slot, request: TransformedMaskRequest, plan: TransformedMaskPlan): void {
    const gl = this.gl, u = this.uniforms, workspace = this.workspace!, limits = this.limits!;
    const count = writeTransformedMaskVertices(plan, this.staging!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.framebuffer);
    gl.viewport(0, 0, plan.width, plan.height);
    for (const cap of [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST])
      gl.disable(cap);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program!);
    if (workspace.vao) this.vertexArrays!.bindVertexArrayOES(workspace.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, workspace.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.staging!.subarray(0, count * 12));
    for (const [i, size, offset] of [[0, 2, 0], [1, 4, 2], [2, 4, 6], [3, 2, 10]]) {
      const location = this.attributes[i];
      gl.enableVertexAttribArray(location);
      this.instancing?.vertexAttribDivisorANGLE(location, 0);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 48, offset * 4);
    }
    for (const [unit, texture, uniform] of [[0, request.source.texture, u.u_source], [1, workspace.low, u.u_factorLow], [2, workspace.high, u.u_factorHigh]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    }
    gl.uniform2f(u.u_sourceSize, request.source.width, request.source.height);
    gl.uniform2f(u.u_targetSize, plan.width, plan.height);
    gl.uniform1f(u.u_decode, request.profile.startsWith('neon4') ? 3 : 0);
    gl.uniform1f(u.u_summed, request.profile.startsWith('neon4') ? 1 : 0);
    gl.uniform1f(u.u_directCopy, plan.directCopy ? 1 : 0);
    // Capacity and valid viewport are distinct; only the latter is sampled.
    if (plan.width > limits.width || plan.height > limits.height)
      throw new Error('Prepass capacity changed after preflight');
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
  private saveState(attributes: readonly number[]): () => void {
    const vaoExtension = this.vertexArrays;
    const previousVao = vaoExtension ? this.gl.getParameter(vaoExtension.VERTEX_ARRAY_BINDING_OES) : null;
    const gl = this.gl, active = gl.getParameter(gl.ACTIVE_TEXTURE), textures: (WebGLTexture | null)[] = [];
    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
    }
    gl.activeTexture(active);
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING), viewport = gl.getParameter(gl.VIEWPORT), program = gl.getParameter(gl.CURRENT_PROGRAM), array = gl.getParameter(gl.ARRAY_BUFFER_BINDING), unpack = gl.getParameter(gl.UNPACK_ALIGNMENT), color = gl.getParameter(gl.COLOR_CLEAR_VALUE), mask = gl.getParameter(gl.COLOR_WRITEMASK);
    const caps = [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST].map(cap => [cap, gl.isEnabled(cap)] as const);
    const attribs = (vaoExtension ? [] : attributes).map(index => ({ index, enabled: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_ENABLED), buffer: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING), size: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_SIZE), type: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_TYPE), normalized: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED), stride: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_STRIDE), offset: gl.getVertexAttribOffset(index, gl.VERTEX_ATTRIB_ARRAY_POINTER), divisor: this.instancing ? gl.getVertexAttrib(index, this.instancing.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE) : 0 }));
    return () => {
      if (vaoExtension) vaoExtension.bindVertexArrayOES(previousVao);
      for (const a of attribs) {
        if (a.buffer && gl.isBuffer(a.buffer)) {
          gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer);
          gl.vertexAttribPointer(a.index, a.size, a.type, a.normalized, a.stride, a.offset);
        }
        this.instancing?.vertexAttribDivisorANGLE(a.index, a.divisor);
        if (a.enabled)
          gl.enableVertexAttribArray(a.index);
        else
          gl.disableVertexAttribArray(a.index);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, array && gl.isBuffer(array) ? array : null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(...viewport as [
        number,
        number,
        number,
        number
      ]);
      gl.useProgram(program);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpack);
      gl.clearColor(...color as [
        number,
        number,
        number,
        number
      ]);
      gl.colorMask(...mask as [
        boolean,
        boolean,
        boolean,
        boolean
      ]);
      for (const [cap, enabled] of caps)
        if (enabled)
          gl.enable(cap);
        else
          gl.disable(cap);
      for (let i = 0; i < 3; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        const texture = textures[i];
        gl.bindTexture(gl.TEXTURE_2D, texture && gl.isTexture(texture) ? texture : null);
      }
      gl.activeTexture(active);
    };
  }
}
