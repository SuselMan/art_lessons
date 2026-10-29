import type { BrushGlBatchFrame, BrushGlBatchInfo } from './BrushGlBatch';
import type { SourceOver32ScalarControl } from '../presets/sourceOver32Scalar';
import { SOURCE_OVER32_SCALAR_GLSL } from '../raster/sourceOver32ScalarShader';
import type { SourceAlphaDarken32Control } from '../presets/sourceAlphaDarken32';
import { SOURCE_ALPHA_DARKEN32_GLSL } from '../raster/sourceAlphaDarken32Shader';
import { saveBrushGlState } from './BrushGlState';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache } from './BrushTextureCache';
import type { TransformedMaskView } from './TransformedMaskPrepass';
export interface CanonicalStraightRgba8Target {
    readonly brand: 'canonical-straight-rgba8-v1';
    readonly texture: WebGLTexture;
    readonly framebuffer: WebGLFramebuffer;
    readonly width: number;
    readonly height: number;
    /** Logical TOP-left world pixel. Target GL row0 is its logical bottom. */
    readonly originX: number;
    readonly originY: number;
}
export interface CanonicalExternalLifetime {
    readonly kind: 'external';
    /** Identifies the retained resource scope, not ambient/global renderer state. */
    readonly owner: object;
    readonly lease: () => (() => void);
}
export type CanonicalSourceResidency = {
    readonly kind: 'cache';
    readonly key: string;
    readonly bytes: number;
} | CanonicalExternalLifetime;
export interface CanonicalOwnedRgba8Target extends CanonicalStraightRgba8Target {
    readonly lifetime: CanonicalExternalLifetime;
}
export interface CanonicalUvBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface CanonicalRgba8SourceView {
    readonly brand: 'canonical-straight-rgba8-view-v1';
    readonly texture: WebGLTexture;
    readonly textureWidth: number;
    readonly textureHeight: number;
    readonly rect: TransformedMaskView['rect'];
    readonly bounds: CanonicalUvBounds;
    readonly mirror: TransformedMaskView['mirror'];
    readonly rowOrder: 'topAtV0' | 'bottomAtV0';
    readonly residency: CanonicalSourceResidency;
}
export type CanonicalCompositeSource = {
    readonly kind: 'maskRgb';
    readonly view: TransformedMaskView;
    readonly rgb: readonly [
        number,
        number,
        number
    ];
} | {
    readonly kind: 'straightRgba8';
    readonly view: CanonicalRgba8SourceView;
};
export type CanonicalCompositeOperation = {
    readonly kind: 'alphaDarken32';
    readonly control: SourceAlphaDarken32Control;
} | {
    readonly kind: 'over32';
    readonly control: SourceOver32ScalarControl;
};
export type CanonicalCompositeOperationKind = CanonicalCompositeOperation['kind'];
export interface CanonicalCompositeRequest {
    readonly source: CanonicalCompositeSource;
    readonly target: CanonicalOwnedRgba8Target;
    readonly operation: CanonicalCompositeOperation;
    /** Immutable base for repeated preview; default target means ordinary feedback. */
    readonly readDestination?: CanonicalOwnedRgba8Target;
}
export interface CanonicalCompositeLimits {
    readonly width: number;
    readonly height: number;
    readonly operations?: readonly CanonicalCompositeOperationKind[];
}
interface Resource {
    readonly key: string;
    readonly bytes: number;
}
interface Clip {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly maskX: number;
    readonly maskY: number;
}
const VBO_BYTES = 48, PROGRAM_CPU_BYTES = 8192;
const borrowedRelease = () => { };
function operationsFor(limits: CanonicalCompositeLimits): readonly CanonicalCompositeOperationKind[] {
    const operations = limits.operations ?? ['alphaDarken32'];
    if (!Array.isArray(operations) || !operations.length || operations.length > 2
        || operations.some(kind => kind !== 'alphaDarken32' && kind !== 'over32'))
        throw new RangeError('Invalid composite operations');
    return (['alphaDarken32', 'over32'] as const).filter(kind => operations.includes(kind));
}
const whole = (n: number, minimum = 0) => Number.isSafeInteger(n) && n >= minimum;
const rectValid = (r: {
    x: number;
    y: number;
    width: number;
    height: number;
}) => [r.x, r.y].every(Number.isSafeInteger)
    && whole(r.width, 1) && whole(r.height, 1) && Number.isSafeInteger(r.x + r.width) && Number.isSafeInteger(r.y + r.height);
/** Scratch is a single RGBA8 texture plus VBO. CPU charge includes uniform/
 * program metadata and small synchronous state/staging objects, not driver code.
 * Driver program allocation is opaque; this is the existing texture-residency
 * budget, not a hard bound on vendor shader compiler heap/driver memory. */
export function canonicalRgba8CompositeBudget(limits: CanonicalCompositeLimits): {
    gpuBytes: number;
    cpuBytes: number;
} {
    if (!whole(limits.width, 1) || !whole(limits.height, 1) || limits.width > 4096 || limits.height > 4096
        || limits.width * limits.height > 1048576)
        throw new RangeError('Invalid canonical composite capacity');
    return { gpuBytes: limits.width * limits.height * 4 + VBO_BYTES, cpuBytes: VBO_BYTES + PROGRAM_CPU_BYTES * operationsFor(limits).length };
}
const VERTEX = 'attribute highp vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
/** One source/geometry template; only the selected numerical kernel is included. */
function fragmentFor(kind: CanonicalCompositeOperationKind): string {
    return `precision highp float;
uniform highp sampler2D sourceTexture;
uniform highp sampler2D destinationTexture;
uniform highp vec4 clipRect;
uniform highp vec4 sourceGeometry;
uniform highp vec4 sourceBounds;
uniform highp vec2 mirrorFlags;
uniform highp vec2 sourcePolicy;
uniform highp vec2 scratchSize;
uniform highp vec3 pigment;
uniform highp vec4 controls;
uniform highp vec2 policy;
${kind === 'alphaDarken32' ? SOURCE_ALPHA_DARKEN32_GLSL : SOURCE_OVER32_SCALAR_GLSL}
void main(){
  highp vec2 local=gl_FragCoord.xy-clipRect.xy;
  highp vec2 pixel=floor(vec2(sourceGeometry.x+local.x,sourceGeometry.y+clipRect.w-local.y));
  if(mirrorFlags.x!=0.0)pixel.x=sourceGeometry.z-1.0-pixel.x;
  if(mirrorFlags.y!=0.0)pixel.y=sourceGeometry.w-1.0-pixel.y;
  if(sourcePolicy.y!=0.0)pixel.y=sourceGeometry.w-1.0-pixel.y;
  highp vec2 sourceUV=sourceBounds.xy+(pixel+0.5)/sourceGeometry.zw*sourceBounds.zw;
  highp vec4 sampled=floor(texture2D(sourceTexture,sourceUV)*255.0+0.5);
  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sampled.r):sampled;
  highp vec4 destination=floor(texture2D(destinationTexture,local/scratchSize)*255.0+0.5);
  gl_FragColor=${kind === 'alphaDarken32' ? 'sourceCompositeAlphaDarken32(source,destination,controls,policy)' : 'sourceCompositeOver32Scalar(source,destination,controls.xw,policy)'}/255.0;
}`;
}
interface ProgramInfo {
    program: WebGLProgram;
    attribute: number;
    uniforms: Record<string, WebGLUniformLocation | null>;
}
interface Workspace {
    texture: WebGLTexture;
    buffer: WebGLBuffer;
    programs: Map<CanonicalCompositeOperationKind, ProgramInfo>;
    vao?: WebGLVertexArrayObjectOES;
}
/** Internal opt-in LOCAL alphaDarken only. Target is explicit straight RGBA8,
 * never the existing PM layer. Source view is already rasterized: no tip transform
 * or native-domain correction is repeated. Caller presents/outer-composites later. */
export class CanonicalRgba8CompositePass {
    readonly key: string;
    private readonly gl: WebGLRenderingContext;
    private readonly cache: BrushTextureCache;
    private readonly cpu: BrushMipCache;
    private limits?: CanonicalCompositeLimits;
    private workspace?: Workspace;
    private releaseCpu?: () => void;
    private reservedCpuBytes = 0;
    private companions: readonly Resource[] = [];
    private instancing: ANGLE_instanced_arrays | null = null;
    private vertexArrays: OES_vertex_array_object | null = null;
    private busy = false;
    private batch?: BrushGlBatchFrame;
    constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache, prefix: string) {
        if (!prefix || prefix.includes('\0'))
            throw new RangeError('Invalid canonical composite scope');
        this.gl = gl;
        this.cache = cache;
        this.cpu = cpu;
        this.key = `${prefix}:workspace`;
    }
    /** Companion list is actual source-bank + prepass preparedResources metadata.
     * companionCpuBytes is the total concurrent companion estimate: already held
     * reservations are included via max(), not charged for a second time. */
    prepare(limits: CanonicalCompositeLimits, companions: readonly Resource[], companionCpuBytes = 0, signal?: AbortSignal): 'ready' | 'cancelled' {
        if (this.batch) throw new Error('Cannot prepare inside an active brush GL batch');
        if (signal?.aborted)
            return 'cancelled';
        const operations = operationsFor(limits);
        const budget = canonicalRgba8CompositeBudget(limits), group = new Map<string, number>();
        if (!whole(companionCpuBytes))
            throw new RangeError('Invalid companion CPU bytes');
        for (const r of companions) {
            if (!r.key || r.key === this.key || !whole(r.bytes, 1) || this.cache.resourceBytes(r.key) !== r.bytes || !this.cache.get(r.key)
                || group.has(r.key) && group.get(r.key) !== r.bytes)
                throw new RangeError('Unprepared composite companion');
            group.set(r.key, r.bytes);
        }
        const otherCpu = this.cpu.reservedBytes - this.reservedCpuBytes;
        if ([...group.values()].reduce((a, b) => a + b, 0) + budget.gpuBytes > this.cache.budgetBytes
            || Math.max(otherCpu, companionCpuBytes) + budget.cpuBytes > this.cpu.budgetBytes)
            throw new RangeError('Composite working set exceeds brush budgets');
        const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
        const precision = this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER, this.gl.HIGH_FLOAT);
        if (!precision || precision.precision < 23 || Math.max(limits.width, limits.height) > maximum)
            throw new RangeError('Unverified composite GPU capability');
        if (this.limits) {
            if (this.limits.width !== limits.width || this.limits.height !== limits.height || operations.join(',') !== operationsFor(this.limits).join(',') || !this.isReady())
                throw new Error('Reset composite pass before changing capacity/residency');
            this.companions = [...group].map(([key, bytes]) => ({ key, bytes }));
            return 'ready';
        }
        if (this.cache.resourceBytes(this.key) !== undefined)
            throw new Error('Canonical composite resource scope is already owned');
        const releaseCpu = this.cpu.reserve(budget.cpuBytes);
        this.instancing = this.gl.getExtension('ANGLE_instanced_arrays');
        this.vertexArrays = this.gl.getExtension('OES_vertex_array_object');
        const restore = saveBrushGlState(this.gl, [], this.instancing, this.vertexArrays, 2);
        let texture: WebGLTexture | undefined, buffer: WebGLBuffer | null = null, programs = new Map<CanonicalCompositeOperationKind, ProgramInfo>(), vao: WebGLVertexArrayObjectOES | null = null;
        try {
            const gl = this.gl;
            this.cache.protect([...group.keys(), this.key]);
            gl.activeTexture(gl.TEXTURE0);
            // Null storage allocates no width*height CPU buffer.
            texture = gl.createTexture() ?? undefined;
            if (!texture)
                throw new Error('Composite scratch allocation failed');
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, limits.width, limits.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
                gl.texParameteri(gl.TEXTURE_2D, name, gl.NEAREST);
            for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
                gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
            for (const kind of operations)
                programs.set(kind, this.compile(kind));
            buffer = gl.createBuffer();
            if (!buffer)
                throw new Error('Composite VBO allocation failed');
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            vao = this.vertexArrays?.createVertexArrayOES() ?? null;
            if (this.vertexArrays && !vao)
                throw new Error('Composite VAO allocation failed');
            const owned: Workspace = { texture, buffer, programs, ...vao ? { vao } : {} };
            const arrays = this.vertexArrays;
            this.cache.put(this.key, texture, budget.gpuBytes, lost => {
                if (!lost) {
                    gl.deleteBuffer(owned.buffer);
                    for (const info of owned.programs.values())
                        gl.deleteProgram(info.program);
                    if (owned.vao)
                        arrays!.deleteVertexArrayOES(owned.vao);
                }
                if (this.workspace === owned)
                    this.workspace = undefined;
            });
            this.workspace = owned;
            texture = undefined;
            buffer = null;
            programs = new Map();
            vao = null;
            this.limits = { ...limits, operations };
            this.companions = [...group].map(([key, bytes]) => ({ key, bytes }));
            this.releaseCpu = releaseCpu;
            this.reservedCpuBytes = budget.cpuBytes;
            if (signal?.aborted) {
                this.reset();
                return 'cancelled';
            }
            return 'ready';
        }
        catch (error) {
            if (texture)
                this.gl.deleteTexture(texture);
            if (buffer)
                this.gl.deleteBuffer(buffer);
            for (const info of programs.values())
                this.gl.deleteProgram(info.program);
            if (vao)
                this.vertexArrays?.deleteVertexArrayOES(vao);
            this.reset();
            releaseCpu();
            throw error;
        }
        finally {
            restore();
        }
    }
    isReady(): boolean { return !!this.workspace && !!this.limits && this.cache.get(this.key) === this.workspace.texture; }
    preparedResources(): readonly Resource[] {
        if (!this.isReady())
            throw new Error('Composite pass is not prepared');
        return [{ key: this.key, bytes: this.cache.resourceBytes(this.key)! }];
    }
    /** Compatibility adapter: existing callers already retain their external target
     * throughout this synchronous call. New frame APIs pass explicit lifetimes. */
    draw(view: TransformedMaskView, target: CanonicalStraightRgba8Target, rgb: readonly [
        number,
        number,
        number
    ], control: SourceAlphaDarken32Control): 'painted' | 'empty' {
        const owned: CanonicalOwnedRgba8Target = { ...target, lifetime: { kind: 'external', owner: target, lease: () => borrowedRelease } };
        return this.drawSource({ source: { kind: 'maskRgb', view, rgb }, target: owned, operation: { kind: 'alphaDarken32', control } });
    }
    brushGlBatchInfo(): BrushGlBatchInfo {
        if (!this.isReady() || !this.workspace) throw new Error('Composite pass is not prepared');
        return { gl: this.gl, cache: this.cache, cpu: this.cpu, epoch: this.workspace,
            attributes: [...this.workspace.programs.values()].map(info => info.attribute), instancing: this.instancing, vertexArrays: this.vertexArrays,
            resources: [...this.companions, ...this.preparedResources()] };
    }
    enterBrushGlBatch(frame: BrushGlBatchFrame): () => void {
        frame.acceptParticipant(this);
        if (this.batch || this.busy) throw new Error('Composite pass already has an active batch/draw');
        this.batch = frame;
        return () => { if (this.batch === frame) this.batch = undefined; };
    }
    drawSource(request: CanonicalCompositeRequest, frame?: BrushGlBatchFrame): 'painted' | 'empty' {
        if (this.batch !== frame) throw new Error('Composite batch identity mismatch');
        if (this.busy)
            throw new Error('Composite draw is already active');
        if (!request || !request.source || !request.operation)
            throw new RangeError('Missing composite request');
        const { source, target, operation } = request, base = request.readDestination ?? target;
        const sampled = this.validateSource(source);
        this.validateTarget(target);
        this.validateTarget(base);
        this.validateOperation(operation);
        if (base.width !== target.width || base.height !== target.height || base.originX !== target.originX || base.originY !== target.originY)
            throw new RangeError('Immutable destination geometry must match the output target');
        if (!this.isReady() || !this.workspace || !this.limits)
            throw new Error('Composite pass is not prepared');
        const info = this.workspace.programs.get(operation.kind);
        if (!info)
            throw new Error('Composite operation was not prepared');
        if (target.texture === sampled.texture || target.texture === this.workspace.texture || sampled.texture === this.workspace.texture || base.texture === this.workspace.texture)
            throw new RangeError('Composite framebuffer feedback alias');
        const resources = [...this.companions, ...this.preparedResources()];
        for (const r of this.companions)
            if (this.cache.resourceBytes(r.key) !== r.bytes || !this.cache.get(r.key))
                throw new Error('Composite companion residency changed');
        if (sampled.residency.kind === 'cache') {
            const r = sampled.residency;
            if (this.cache.resourceBytes(r.key) !== r.bytes || this.cache.get(r.key) !== sampled.texture)
                throw new RangeError('Unprepared composite source view');
            resources.push({ key: r.key, bytes: r.bytes });
        }
        const unique = new Map(resources.map(r => [r.key, r.bytes]));
        if ([...unique.values()].reduce((a, b) => a + b, 0) > this.cache.budgetBytes)
            throw new RangeError('Composite draw exceeds GPU budget');
        const declaredOwners = [target.lifetime, ...base === target ? [] : [base.lifetime], ...sampled.residency.kind === 'external' ? [sampled.residency] : []];
        const clip = this.clip(sampled.rect, target);
        if (!clip) {
            frame?.assert(this, resources, declaredOwners);
            frame?.beginDraw();
            return 'empty';
        }
        if (clip.width > this.limits.width || clip.height > this.limits.height)
            throw new RangeError('Composite clip exceeds prepared capacity');
        frame?.assert(this, resources, declaredOwners);
        frame?.beginDraw();
        this.cache.protect([...unique.keys()]);
        const release = frame ? () => {} : this.cache.lease([...unique].map(([key, bytes]) => ({ key, bytes })));
        const gl = this.gl, work = this.workspace, restore = frame ? () => {} : saveBrushGlState(gl, [info.attribute], this.instancing, this.vertexArrays, 2), releases: (() => void)[] = [];
        this.busy = true;
        let restoreSampling: (() => void) | undefined, failure: unknown, failed = false;
        try {
            for (const lifetime of frame ? [] : declaredOwners) {
                const done = lifetime.lease();
                if (typeof done !== 'function')
                    throw new Error('Invalid external resource lease');
                releases.push(done);
            }
            if (this.workspace !== work || !this.limits)
                throw new Error('Composite resources changed during owner acquisition');
            if (frame) { frame.bindTarget(target); frame.bindTarget(base); }
            else { this.bindTarget(target); this.bindTarget(base); }
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, work.texture);
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, clip.x, clip.y, clip.width, clip.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
            gl.viewport(clip.x, clip.y, clip.width, clip.height);
            for (const cap of [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST])
                gl.disable(cap);
            gl.colorMask(true, true, true, true);
            gl.useProgram(info.program);
            if (work.vao)
                this.vertexArrays!.bindVertexArrayOES(work.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, work.buffer);
            gl.enableVertexAttribArray(info.attribute);
            this.instancing?.vertexAttribDivisorANGLE(info.attribute, 0);
            gl.vertexAttribPointer(info.attribute, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sampled.texture);
            restoreSampling = frame ? frame.pointSampling(sampled.texture) : this.pointSampling(sampled.texture);
            const u = info.uniforms;
            gl.uniform1i(u.sourceTexture, 0);
            gl.uniform1i(u.destinationTexture, 1);
            gl.uniform4f(u.clipRect, clip.x, clip.y, clip.width, clip.height);
            gl.uniform4f(u.sourceGeometry, clip.maskX, clip.maskY, sampled.rect.width, sampled.rect.height);
            gl.uniform4f(u.sourceBounds, sampled.bounds.x, sampled.bounds.y, sampled.bounds.width, sampled.bounds.height);
            gl.uniform2f(u.mirrorFlags, +sampled.mirror.horizontal, +sampled.mirror.vertical);
            gl.uniform2f(u.sourcePolicy, source.kind === 'straightRgba8' ? 1 : 0, sampled.rowOrder === 'bottomAtV0' ? 1 : 0);
            gl.uniform2f(u.scratchSize, this.limits.width, this.limits.height);
            gl.uniform3f(u.pigment, ...source.kind === 'maskRgb' ? source.rgb : [0, 0, 0] as [
                number,
                number,
                number
            ]);
            const c = operation.control;
            gl.uniform4f(u.controls, c.opacity, operation.kind === 'alphaDarken32' ? operation.control.averageOpacity : 0, operation.kind === 'alphaDarken32' ? operation.control.flow : 0, c.mask ?? 0);
            gl.uniform2f(u.policy, operation.kind === 'alphaDarken32' ? (operation.control.variant === 'hard' ? 1 : 0) : (operation.control.profile === 'optimized32-neon64-scalar-frecpe-rne-v1' ? 1 : 0), c.mask === undefined ? 0 : 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        catch (error) {
            failed = true;
            failure = error;
        }
        finally {
            const cleanup = (done: () => void) => { try {
                done();
            }
            catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            } };
            // Restore the sampler while its external/cache owner is still held.
            if (restoreSampling)
                cleanup(restoreSampling);
            cleanup(restore);
            for (const done of releases.reverse())
                cleanup(done);
            cleanup(release);
            this.busy = false;
        }
        if (failed)
            throw failure;
        return 'painted';
    }
    private pointSampling(texture: WebGLTexture): () => void {
        const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T];
        const previous = names.map(name => gl.getTexParameter(gl.TEXTURE_2D, name) as number);
        const desired = [gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE];
        for (let i = 0; i < names.length; i++)
            if (previous[i] !== desired[i])
                gl.texParameteri(gl.TEXTURE_2D, names[i], desired[i]);
        return () => {
            if (gl.isContextLost() || !gl.isTexture(texture))
                return;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            for (let i = 0; i < names.length; i++)
                if (previous[i] !== desired[i])
                    gl.texParameteri(gl.TEXTURE_2D, names[i], previous[i]);
        };
    }
    reset(lost = false): void {
        if (this.batch && !lost) throw new Error('Cannot reset inside an active brush GL batch');
        if (this.busy && !lost)
            throw new Error('Cannot reset an active composite draw');
        this.cache.discard(this.key, lost);
        this.workspace = undefined;
        this.limits = undefined;
        this.companions = [];
        this.releaseCpu?.();
        this.releaseCpu = undefined;
        this.reservedCpuBytes = 0;
        this.instancing = null;
        this.vertexArrays = null;
    }
    private validateSource(source: CanonicalCompositeSource): {
        texture: WebGLTexture;
        rect: TransformedMaskView['rect'];
        bounds: CanonicalUvBounds;
        mirror: TransformedMaskView['mirror'];
        rowOrder: 'topAtV0' | 'bottomAtV0';
        residency: CanonicalSourceResidency;
    } {
        const view = source.view;
        if (!view || !rectValid(view.rect) || view.rect.width > 4096 || view.rect.height > 4096 || !view.texture
            || !view.bounds || ![view.bounds.x, view.bounds.y, view.bounds.width, view.bounds.height].every(Number.isFinite)
            || view.bounds.x < 0 || view.bounds.y < 0 || view.bounds.width <= 0 || view.bounds.height <= 0 || view.bounds.x + view.bounds.width > 1 || view.bounds.y + view.bounds.height > 1
            || !view.mirror || typeof view.mirror.horizontal !== 'boolean' || typeof view.mirror.vertical !== 'boolean')
            throw new RangeError('Invalid composite source view');
        if (source.kind === 'maskRgb') {
            const mask = source.view;
            if (mask.channel !== 'r' || !mask.key || !Array.isArray(source.rgb) || source.rgb.length !== 3 || !source.rgb.every(v => whole(v) && v <= 255))
                throw new RangeError('Invalid mask source/pigment bytes');
            const bytes = this.cache.resourceBytes(mask.key);
            if (!bytes)
                throw new RangeError('Unprepared transformed mask view');
            return { ...mask, rowOrder: 'topAtV0', residency: { kind: 'cache', key: mask.key, bytes } };
        }
        if (source.kind !== 'straightRgba8')
            throw new RangeError('Unknown composite source kind');
        const rgba = source.view;
        if (rgba.brand !== 'canonical-straight-rgba8-view-v1' || !whole(rgba.textureWidth, 1) || !whole(rgba.textureHeight, 1)
            || rgba.textureWidth > 4096 || rgba.textureHeight > 4096 || !['topAtV0', 'bottomAtV0'].includes(rgba.rowOrder)
            || rgba.bounds.width !== rgba.rect.width / rgba.textureWidth || rgba.bounds.height !== rgba.rect.height / rgba.textureHeight
            || rgba.bounds.x !== Math.round(rgba.bounds.x * rgba.textureWidth) / rgba.textureWidth
            || rgba.bounds.y !== Math.round(rgba.bounds.y * rgba.textureHeight) / rgba.textureHeight)
            throw new RangeError('RGBA source must be an explicit unscaled integer-texel view');
        const r = rgba.residency;
        if (!r || r.kind !== 'external' && r.kind !== 'cache')
            throw new RangeError('Explicit source residency required');
        if (r.kind === 'external')
            this.validateLifetime(r);
        else if (!r.key || !whole(r.bytes, 1) || r.bytes < rgba.textureWidth * rgba.textureHeight * 4)
            throw new RangeError('Invalid cached RGBA source charge');
        return rgba;
    }
    private validateLifetime(lifetime: CanonicalExternalLifetime): void {
        if (!lifetime || lifetime.kind !== 'external' || !lifetime.owner || typeof lifetime.owner !== 'object' || typeof lifetime.lease !== 'function')
            throw new RangeError('Explicit external resource lifetime required');
    }
    private validateTarget(target: CanonicalOwnedRgba8Target): void {
        if (!target || target.brand !== 'canonical-straight-rgba8-v1' || !target.texture || !target.framebuffer
            || !rectValid({ x: target.originX, y: target.originY, width: target.width, height: target.height }) || target.width > 4096 || target.height > 4096)
            throw new RangeError('Explicit straight RGBA8 target required');
        this.validateLifetime(target.lifetime);
    }
    private validateOperation(operation: CanonicalCompositeOperation): void {
        const c = operation.control;
        if (!c || !Number.isFinite(c.opacity) || c.opacity < 0 || c.opacity > 1 || c.mask !== undefined && (!whole(c.mask) || c.mask > 255))
            throw new RangeError('Invalid composite controls');
        if (operation.kind === 'alphaDarken32') {
            const a = operation.control;
            if (a.profile !== 'optimized32-scalar-f32-rne-v1' || !['creamy', 'hard'].includes(a.variant)
                || ![a.averageOpacity, a.flow].every(v => Number.isFinite(v) && v >= 0 && v <= 1))
                throw new RangeError('Invalid local alphaDarken32 controls');
        }
        else if (operation.kind !== 'over32' || !['portable-f32-division-rne-v1', 'optimized32-neon64-scalar-frecpe-rne-v1'].includes(operation.control.profile))
            throw new RangeError('Invalid Over32 profile');
    }
    private clip(rect: TransformedMaskView['rect'], target: CanonicalStraightRgba8Target): Clip | undefined {
        const x = Math.max(rect.x, target.originX), y = Math.max(rect.y, target.originY), right = Math.min(rect.x + rect.width, target.originX + target.width), bottom = Math.min(rect.y + rect.height, target.originY + target.height);
        if (right <= x || bottom <= y)
            return;
        return { x: x - target.originX, y: target.height - (bottom - target.originY), width: right - x, height: bottom - y, maskX: x - rect.x, maskY: y - rect.y };
    }
    private bindTarget(target: CanonicalStraightRgba8Target): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
            || gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) !== target.texture)
            throw new Error('Canonical target attachment does not match its declared texture');
    }
    private compile(kind: CanonicalCompositeOperationKind): ProgramInfo {
        const gl = this.gl, shaders: WebGLShader[] = [];
        let program: WebGLProgram | null = null;
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragmentFor(kind)]] as const) {
                const shader = gl.createShader(type);
                if (!shader)
                    throw new Error('Composite shader allocation failed');
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                    throw new Error('Composite shader compile failed: ' + gl.getShaderInfoLog(shader));
            }
            program = gl.createProgram();
            if (!program)
                throw new Error('Composite program allocation failed');
            for (const shader of shaders)
                gl.attachShader(program, shader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                throw new Error('Composite link failed: ' + gl.getProgramInfoLog(program));
            const attribute = gl.getAttribLocation(program, 'position');
            if (attribute < 0)
                throw new Error('Composite attribute unavailable');
            const uniforms: Record<string, WebGLUniformLocation | null> = {};
            for (const name of ['sourceTexture', 'destinationTexture', 'clipRect', 'sourceGeometry', 'sourceBounds', 'mirrorFlags', 'sourcePolicy', 'scratchSize', 'pigment', 'controls', 'policy'])
                uniforms[name] = gl.getUniformLocation(program, name);
            return { program, attribute, uniforms };
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
}
