import type { BrushGlBatchFrame, BrushGlBatchInfo } from './BrushGlBatch';
import { sourcePngPyramid } from '@grafetto/shared';
import { saveBrushGlState } from './BrushGlState';
import type { SourceDabMaterialSpec } from '../presets/sourceDabCache';
import { buildRgba64FactorLut } from '../raster/sourceRgba64StraightShader';
import { SOURCE_TRANSFORMED_MASK_VERT, sourceTransformedMaskFragment } from '../raster/sourceTransformedMaskShader';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache } from './BrushTextureCache';
import { resolvedTransformedMaskPlan, writeTransformedMaskVertices, type TransformedMaskPlan, type TransformedMaskMaterial, type CanonicalMaskSourceBinding, canonicalTransformedMaskMetadata, canonicalTransformedMaskPlan, canonicalMaskRevision, canonicalAutoMaskRevision, prepareCanonicalAutoMask, type CanonicalAutoMaskMaterial } from './TransformedMaskPlan';
export interface TransformedMaskLimits {
  readonly width: number;
  readonly height: number;
  readonly slots: number;
}
/** Metadata-only, same admitted workspace formulas used by prepare. */
export function transformedMaskPrepassBudget(limits: TransformedMaskLimits): {
  gpuBytes: number; cpuBytes: number; vertexBytes: number;
} {
  if (!Number.isSafeInteger(limits.width) || !Number.isSafeInteger(limits.height)
    || !Number.isSafeInteger(limits.slots) || limits.width < 1 || limits.height < 1
    || limits.width > 4096 || limits.height > 4096 || limits.width * limits.height > 1048576
    || limits.slots < 1 || limits.slots > 8) throw new RangeError('Invalid prepass capacity');
  const vertexBytes = limits.height * FLOATS_PER_ROW * 4;
  return { vertexBytes, cpuBytes: vertexBytes + limits.height * PLAN_BYTES_PER_ROW * limits.slots * 2 + FACTOR_BYTES,
    gpuBytes: FACTOR_BYTES + vertexBytes + limits.width * limits.height * 4 * limits.slots };
}
export interface TransformedMaskSource {
  readonly key: string;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}
export interface TransformedMaskPreparedSource {
  readonly key: string;
  readonly bytes: number;
  /** Trusted cold bank binding, copied before drawing. Legacy callers omit it. */
  readonly canonical?: CanonicalMaskSourceBinding;
}
function savedMaterial(m: TransformedMaskMaterial): SourceDabMaterialSpec {
  if ('kind' in m) {
    if (m.kind === 'savedSource') return m.source;
    throw new RangeError('Canonical material is not a saved source request');
  }
  return m;
}
function canonicalMaterial(m: TransformedMaskMaterial): m is Extract<TransformedMaskMaterial, { kind: 'canonical' }> {
  return !!m && 'kind' in m && m.kind === 'canonical';
}
function checkedBinding(b: CanonicalMaskSourceBinding, bytes: number): CanonicalMaskSourceBinding {
  const a = b?.asset;
  if (!a || !/^asset:[0-9a-f]{64}$/.test(a.id) || ![a.size, a.width, a.height].every(n => Number.isSafeInteger(n) && n > 0)
    || a.size > 4096 || ![a.x, a.y].every(n => Number.isSafeInteger(n) && n >= 0)
    || a.x + a.width > a.size || a.y + a.height > a.size || !Number.isSafeInteger(b.index) || b.index < 0)
    throw new RangeError('Invalid canonical prepared source binding');
  const level = sourcePngPyramid(a.width, a.height).levels[b.index];
  if (!level || b.baseScale !== level.scale || b.nativeWidth !== level.width || b.nativeHeight !== level.height
    || bytes !== (level.width + 2) * (level.height + 2) * 4) throw new RangeError('Invalid canonical prepared level binding');
  return Object.freeze({ ...b, asset: Object.freeze({ ...a }) });
}
export interface TransformedMaskRequest {
  readonly owner: object;
  readonly role: string;
  readonly material: TransformedMaskMaterial;
  readonly source: TransformedMaskSource;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly profile: 'wide8-separate-wordsize64' | 'neon4-summed-wordsize64';
}
export type CanonicalAutoMaskRequest = Omit<TransformedMaskRequest, 'material' | 'source'> & {
  readonly material: CanonicalAutoMaskMaterial;
  readonly source?: never;
};
export type AnyTransformedMaskRequest = TransformedMaskRequest | CanonicalAutoMaskRequest;
/** Borrowed output: its owning prepass retains immutable NEAREST/CLAMP sampler
 * configuration. Consumers/owner callbacks must not call texParameteri on it.
 * Sampling/view geometry is valid only while the returned group is leased. */
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
  material?: TransformedMaskMaterial;
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
  private pendingAuto?: {
    readonly owner: object; readonly role: string; readonly revision: string; readonly slot: Slot;
    readonly epoch: Workspace; readonly evaluator: ReturnType<typeof prepareCanonicalAutoMask>['evaluator'];
    readonly material: CanonicalAutoMaskMaterial; readonly width: number; readonly height: number;
    readonly a8: Uint8Array; readonly rgba: Uint8Array; readonly release: () => void;
    filled: number; uploadedRows: number;
  };
  private batch?: BrushGlBatchFrame;
  private limits?: TransformedMaskLimits;
  private sources = new Map<string, number>();
  private sourceBindings = new Map<string, CanonicalMaskSourceBinding>();
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
  prepare(limits: TransformedMaskLimits, sourceResources: readonly TransformedMaskPreparedSource[], signal?: AbortSignal): 'ready' | 'cancelled' {
    if (this.batch) throw new Error('Cannot prepare inside an active brush GL batch');
    if (signal?.aborted)
      return 'cancelled';
    const budget = transformedMaskPrepassBudget(limits);
    const sourceMap = new Map<string, number>();
    const bindings = new Map<string, CanonicalMaskSourceBinding>();
    for (const source of sourceResources) {
      if (!source.key || source.key.startsWith(this.prefix + ':') || !safe(source.bytes, 1, Number.MAX_SAFE_INTEGER))
        throw new RangeError('Invalid prepared source budget');
      if (sourceMap.has(source.key) && sourceMap.get(source.key) !== source.bytes)
        throw new RangeError('Conflicting source budget');
      if (this.cache.resourceBytes(source.key) !== source.bytes || !this.cache.get(source.key))
        throw new RangeError('Source bank must be prepared before the prepass');
      sourceMap.set(source.key, source.bytes);
      if (source.canonical) {
        const binding = checkedBinding(source.canonical, source.bytes), previous = bindings.get(source.key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(binding)) throw new RangeError('Conflicting canonical prepared binding');
        bindings.set(source.key, binding);
      }
    }
    const { vertexBytes, cpuBytes } = budget;
    const gpuBytes = budget.gpuBytes + [...sourceMap.values()].reduce((a, b) => a + b, 0);
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
        this.sources = sourceMap; this.sourceBindings = bindings;
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
      this.sources = sourceMap; this.sourceBindings = bindings;
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
  /** Actual prepared storage, independent of the next brush's tiny footprint.
   * Opaque epoch binds queued work to this preparation without GL queries. */
  preparedCapacity(): Readonly<{ width: number; height: number; epoch: object }> {
    if (!this.isReady() || !this.limits || !this.workspace) throw new Error('Prepass is not prepared');
    return Object.freeze({ width:this.limits.width, height:this.limits.height, epoch:this.workspace });
  }
  /** Cold/preflight metadata only. Source-bank resources are reported separately. */
  preparedResources(): readonly { key: string; bytes: number }[] {
    if (!this.isReady()) throw new Error('Prepass is not prepared');
    return [this.workspaceKey, ...this.slots.map(slot => slot!.key)].map(key => ({ key, bytes: this.cache.resourceBytes(key)! }));
  }
  /** Holds all source/LUT/target entries through the caller's synchronous draw.
  * Caller MUST release in finally. No GL state is touched on a cache hit.
  */
  brushGlBatchInfo(): BrushGlBatchInfo {
    if (!this.isReady() || !this.workspace) throw new Error('Prepass is not prepared');
    return { gl: this.gl, cache: this.cache, cpu: this.cpu, epoch: this.workspace, attributes: this.attributes, instancing: this.instancing, vertexArrays: this.vertexArrays,
      resources: [...this.preparedResources(), ...[...this.sources].map(([key, bytes]) => ({ key, bytes }))],
      ownedPointSamplers: this.slots.filter((slot): slot is Slot => !!slot).map(slot => ({ key: slot.key, texture: slot.texture, bytes: this.limits!.width * this.limits!.height * 4, epoch: this.workspace! })) };
  }
  enterBrushGlBatch(frame: BrushGlBatchFrame): () => void {
    frame.acceptParticipant(this);
    if (this.batch || this.activeGroup) throw new Error('Prepass already has an active batch/group');
    this.batch = frame;
    return () => { if (this.batch === frame) this.batch = undefined; };
  }
  resolveGroup(requests: readonly AnyTransformedMaskRequest[], frame?: BrushGlBatchFrame): {
    views: TransformedMaskView[];
    release: () => void;
  } {
    if (this.batch !== frame) throw new Error('Prepass batch identity mismatch');
    if (this.activeGroup)
      throw new Error('Release the previous prepass group before resolving another');
    if (this.pendingAuto) throw new Error('Auto generation is incomplete');
    const batchGroup = frame?.beginGroup();
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
      const material = request.material, source = request.source, rect = request.rect;
      if (!material || typeof material !== 'object') throw new RangeError('Invalid prepass material');
      if ('kind' in material && material.kind === 'canonicalAuto') {
        const revision = canonicalAutoMaskRevision(material), { recipe } = material;
        const slot = this.slots.find(s => s?.owner === request.owner && s.role === request.role && s.revision === revision);
        if (!slot) throw new Error('Canonical auto generation must complete outside brush GL batch');
        if (source || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger)
          || rect.width !== recipe.width || rect.height !== recipe.height) throw new RangeError('Invalid canonical auto placement/source');
        return { request, plan: undefined, revision, width: recipe.width, height: recipe.height,
          mirror: { horizontal: recipe.mirrorH, vertical: recipe.mirrorV } };
      }
      if (!source) throw new RangeError('Image mask requires a prepared source');
      let revision: string, plan: TransformedMaskPlan;
      let mirror: { horizontal: boolean; vertical: boolean };
      if (canonicalMaterial(material)) {
        const { recipe, asset } = material, metadata = canonicalTransformedMaskMetadata(recipe, asset), binding = this.sourceBindings.get(source.key);
        if (!binding || ['id', 'size', 'x', 'y', 'width', 'height'].some(k => binding.asset[k as keyof typeof asset] !== asset[k as keyof typeof asset])
          || binding.index !== metadata.index || binding.baseScale !== metadata.baseScale
          || binding.nativeWidth !== metadata.levelWidth || binding.nativeHeight !== metadata.levelHeight)
          throw new RangeError('Canonical mask differs from prepared source binding');
        revision = canonicalMaskRevision(request.profile, source.key, recipe, asset);
        const same = this.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision);
        plan = same?.plan ?? canonicalTransformedMaskPlan(recipe, asset);
        mirror = { horizontal: recipe.mirrorH, vertical: recipe.mirrorV };
      } else {
        const saved = savedMaterial(material);
        if(saved?.geometry?.kind==='defaultAuto'||saved?.geometry?.kind==='gaussianAuto')throw new RangeError('Default auto requires a typed procedural material resolver');
        if (!saved || !saved.brush || !saved.shape || !saved.key || !saved.mirror || typeof saved.mirror.horizontal !== 'boolean' || typeof saved.mirror.vertical !== 'boolean')
          throw new RangeError('Invalid saved source material');
        const immutable = Object.isFrozen(saved) && Object.isFrozen(saved.brush) && Object.isFrozen(saved.shape) && Object.isFrozen(saved.key);
        const previous = this.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.material === material && slot.sourceKey === source.key && slot.profile === request.profile);
        const k = saved.key;
        revision = immutable && previous?.revision ? previous.revision : JSON.stringify([request.profile, source.key, saved.brushIdentity, saved.width, saved.height, saved.brush.width, saved.brush.height, saved.brush.scale, saved.brush.angle, saved.shape.scale, saved.shape.ratio, saved.shape.rotation, k.subPixelX, k.subPixelY, k.color, k.softness, k.lightness, k.index, k.mirrorH, k.mirrorV].map(v => Object.is(v, -0) ? '-0' : v));
        const same = this.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision);
        plan = same?.plan ?? resolvedTransformedMaskPlan(saved);
        mirror = { horizontal: saved.mirror.horizontal, vertical: saved.mirror.vertical };
      }
      if (plan.width > this.limits!.width || plan.height > this.limits!.height || plan.spans.length > this.limits!.height
        || !safe(source.width, 1, 4096) || !safe(source.height, 1, 4096) || source.width !== plan.levelWidth + 2 || source.height !== plan.levelHeight + 2
        || (this.sources.get(source.key) ?? 0) < source.width * source.height * 4 || this.cache.get(source.key) !== source.texture
        || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.width !== plan.width || rect.height !== plan.height)
        throw new RangeError('Unprepared material geometry/source');
      // Validate every new native row before any GL ownership side effect.
      if (!this.slots.some(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision))
        writeTransformedMaskVertices(plan, this.staging!);
      return { request, plan, revision, mirror, width: plan.width, height: plan.height };
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
    frame?.assert(this, resources);
    this.cache.protect(resources.map(r => r.key));
    const releaseResources = frame ? () => {} : this.cache.lease(resources), token = Symbol('prepass-group');
    this.activeGroup = token;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseResources();
      if (batchGroup) frame!.endGroup(batchGroup);
      if (this.activeGroup === token) this.activeGroup = undefined;
    };
    frame?.holdGroup(release);
    try {
      const misses = assigned.filter(item => item.slot.revision !== item.revision || item.slot.owner !== item.request.owner || item.slot.role !== item.request.role);
      if (misses.length) {
        const restore = frame ? () => {} : this.saveState(this.attributes);
        try {
          for (const item of misses) {
            item.slot.revision = undefined;
            item.slot.material = undefined;
            item.slot.plan = undefined;
            if (!item.plan) throw new Error('Auto mask cannot be generated inside a GL batch');
            if (!item.request.source) throw new Error('Image source missing');
            this.draw(item.slot, item.request as TransformedMaskRequest, item.plan);
            item.slot.revision = item.revision;
            item.slot.owner = item.request.owner;
            item.slot.role = item.request.role;
            item.slot.material = item.request.material;
            item.slot.plan = item.plan;
            item.slot.sourceKey = item.request.source?.key;
            item.slot.profile = item.request.profile;
          }
        }
        finally {
          restore();
        }
      }
      const views = assigned.map(({ slot, request, width, height, mirror }) => {
        slot.material = request.material;
        slot.used = ++this.clock;
        return { key: slot.key, texture: slot.texture, rect: { ...request.rect }, bounds: { x: 0 as const, y: 0 as const, width: width / this.limits!.width, height: height / this.limits!.height },
          mirror, channel: 'r' as const };
      });
      return { views, release };
    }
    catch (error) {
      release();
      throw error;
    }
  }
  /** No pixels/GL on a hit. One continuation belongs to the existing executor cursor. */
  beginAutoGeneration(request: AnyTransformedMaskRequest): boolean {
    if (this.batch || this.activeGroup) throw new Error('Auto generation requires an idle prepass outside GL batch');
    if (!this.isReady() || !this.limits || !this.workspace) throw new Error('Prepass is not prepared');
    const material = request.material;
    if (!('kind' in material) || material.kind !== 'canonicalAuto' || request.source
      || !request.owner || typeof request.owner !== 'object' || !request.role) throw new RangeError('Invalid auto generation request');
    const revision = canonicalAutoMaskRevision(material), { width, height } = material.recipe;
    if (width > this.limits.width || height > this.limits.height) throw new RangeError('Auto mask exceeds prepared capacity');
    if (this.pendingAuto) {
      if (this.pendingAuto.owner !== request.owner || this.pendingAuto.role !== request.role || this.pendingAuto.revision !== revision)
        throw new Error('Another auto generation is pending');
      return false;
    }
    if (this.slots.some(s => s?.owner === request.owner && s.role === request.role && s.revision === revision)) return true;
    const prepared = prepareCanonicalAutoMask(material);
    const rows = Math.min(height, Math.max(1, Math.floor(16384 / width))), pixels = rows * width;
    // Include bounded cursor/pin metadata alongside stripe storage.
    const release = this.cpu.reserve(pixels * 5 + 512);
    if (!release) throw new RangeError('Auto stripe CPU reservation exhausted');
    try {
      const a8 = new Uint8Array(pixels), rgba = new Uint8Array(pixels * 4);
      const slot = (this.slots as Slot[]).slice().sort((a,b) => a.used-b.used)[0];
      slot.revision = undefined; slot.plan = undefined; slot.material = undefined;
      const captured = Object.freeze({ ...material, recipe: Object.freeze({ ...material.recipe, source: Object.freeze({ ...material.recipe.source }) }),
        trustedSource: Object.freeze({ ...material.trustedSource, source: Object.freeze({ ...material.trustedSource.source }) }) });
      this.pendingAuto = { owner: request.owner, role: request.role, revision, slot, epoch: this.workspace,
        evaluator: prepared.evaluator, material: captured, width, height, a8, rgba, release, filled: 0, uploadedRows: 0 };
      return false;
    } catch (error) { prepared.evaluator.cancel(); release(); throw error; }
  }
  /** Advances <=maxSamples; at most one bounded stripe upload. Caller owns the
   * cooperative time budget and yields without holding a GL batch/target lease. */
  advanceAutoGeneration(maxSamples: number): { done: boolean; consumed: number; uploadedBytes: number } {
    if (this.batch || this.activeGroup) throw new Error('Cannot advance auto generation inside GL batch/group');
    const p = this.pendingAuto;
    if (!p) throw new Error('No auto generation pending');
    if (!this.isReady() || this.workspace !== p.epoch || this.cache.get(p.slot.key) !== p.slot.texture) {
      this.cancelAutoGeneration(); throw new Error('Auto generation residency changed');
    }
    try {
      const result = p.evaluator.advance(p.a8, p.filled, maxSamples);
      const previousFilled = p.filled;
      p.filled += result.written;
      // Pack only this bounded sample quantum; no full-stripe packing burst.
      for (let i=previousFilled; i<p.filled; i++) p.rgba.fill(p.a8[i], i*4, i*4+4);
      let uploadedBytes = 0;
      if (p.filled === p.a8.length || result.done) {
        const rows = p.filled / p.width;
        if (!Number.isSafeInteger(rows)) throw new Error('Auto stripe ended between rows');
        const release = this.cache.lease([{ key: p.slot.key, bytes: this.limits!.width*this.limits!.height*4 }]);
        const gl = this.gl;
        let restore: (() => void) | undefined;
        let failed=false, failure: unknown;
        try {
          restore = this.saveAutoUploadState();
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,p.slot.texture);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
          gl.texSubImage2D(gl.TEXTURE_2D,0,0,p.uploadedRows,p.width,rows,gl.RGBA,gl.UNSIGNED_BYTE,p.rgba.subarray(0,p.filled*4));
        } catch(error) { failed=true; failure=error; }
        finally {
          try { restore?.(); } catch(error) { if(!failed){failed=true;failure=error} }
          try { release(); } catch(error) { if(!failed){failed=true;failure=error} }
        }
        if(failed)throw failure;
        p.uploadedRows += rows; uploadedBytes = p.filled*4; p.filled = 0;
      }
      if (result.done) {
        p.slot.owner=p.owner; p.slot.role=p.role; p.slot.revision=p.revision; p.slot.material=p.material;
        p.slot.sourceKey=undefined; p.slot.profile=undefined; p.slot.used=++this.clock;
        p.release(); this.pendingAuto=undefined;
      }
      return { done: result.done, consumed: result.consumed, uploadedBytes };
    } catch(error) { this.cancelAutoGeneration(); throw error; }
  }
  cancelAutoGeneration(): void {
    const p=this.pendingAuto; this.pendingAuto=undefined;
    if(p) { p.evaluator.cancel(); p.release(); }
  }
  releaseOwner(owner: object): void { if (this.batch) throw new Error('Cannot release owner inside active brush GL batch'); if (this.pendingAuto?.owner === owner) this.cancelAutoGeneration(); for (const slot of this.slots)
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
    if (this.batch && !lost) throw new Error('Cannot reset inside an active brush GL batch');
    this.cancelAutoGeneration();
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
    this.sources.clear(); this.sourceBindings.clear();
    this.attributes = [];
    this.uniforms = {};
    this.instancing = null;
    this.vertexArrays = null;
    this.releaseCpu?.();
    this.releaseCpu = undefined;
    this.reservedCpuBytes = 0;
  }
  /** Stripe upload touches only unit0 and unpack state: no draw/program/FBO,
   * vertex or capability state enters this capsule. Five synchronous queries. */
  private saveAutoUploadState(): () => void {
    const gl=this.gl;
    const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    const alignment=gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
    const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    const premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
    let texture: WebGLTexture | null;
    try {
      gl.activeTexture(gl.TEXTURE0);
      texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    } finally { gl.activeTexture(active); }
    return () => {
      // Synchronous owned upload cannot delete the borrowed original texture.
      // Attempt independent restores even if a test/driver wrapper throws;
      // active unit restoration is always last and cannot mask earlier errors.
      let failed=false, failure: unknown, unitReady=false;
      const attempt=(restore:()=>void)=>{try{restore()}catch(error){if(!failed){failed=true;failure=error}}};
      attempt(()=>{gl.activeTexture(gl.TEXTURE0);unitReady=true});
      if(unitReady)attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture));
      attempt(()=>gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment));
      attempt(()=>gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip));
      attempt(()=>gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply));
      attempt(()=>gl.activeTexture(active));
      if(failed)throw failure;
    };
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
    for (const [unit, texture, uniform] of [[0, request.source!.texture, u.u_source], [1, workspace.low, u.u_factorLow], [2, workspace.high, u.u_factorHigh]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    }
    gl.uniform2f(u.u_sourceSize, request.source!.width, request.source!.height);
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
    return saveBrushGlState(this.gl, attributes, this.instancing, this.vertexArrays, 3);
  }
}
