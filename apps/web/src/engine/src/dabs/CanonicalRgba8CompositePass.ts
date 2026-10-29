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
export interface CanonicalCompositeLimits {
    readonly width: number;
    readonly height: number;
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
const VBO_BYTES = 48, CPU_BYTES = 8192 + VBO_BYTES;
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
    return { gpuBytes: limits.width * limits.height * 4 + VBO_BYTES, cpuBytes: CPU_BYTES };
}
const VERTEX = 'attribute highp vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
const FRAGMENT = `precision highp float;
uniform highp sampler2D maskTexture;
uniform highp sampler2D destinationTexture;
uniform highp vec4 clipRect;
uniform highp vec4 maskGeometry;
uniform highp vec4 maskBounds;
uniform highp vec2 mirrorFlags;
uniform highp vec2 scratchSize;
uniform highp vec3 pigment;
uniform highp vec4 controls;
uniform highp vec2 policy;
${SOURCE_ALPHA_DARKEN32_GLSL}
void main(){
  highp vec2 local=gl_FragCoord.xy-clipRect.xy;
  highp vec2 pixel=floor(vec2(maskGeometry.x+local.x,maskGeometry.y+clipRect.w-local.y));
  if(mirrorFlags.x!=0.0)pixel.x=maskGeometry.z-1.0-pixel.x;
  if(mirrorFlags.y!=0.0)pixel.y=maskGeometry.w-1.0-pixel.y;
  highp vec2 maskUV=maskBounds.xy+(pixel+0.5)/maskGeometry.zw*maskBounds.zw;
  highp float alpha=floor(texture2D(maskTexture,maskUV).r*255.0+0.5);
  highp vec4 destination=floor(texture2D(destinationTexture,local/scratchSize)*255.0+0.5);
  gl_FragColor=sourceCompositeAlphaDarken32(vec4(pigment,alpha),destination,controls,policy)/255.0;
}`;
interface Workspace {
    texture: WebGLTexture;
    buffer: WebGLBuffer;
    program: WebGLProgram;
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
    private attribute = -1;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private instancing: ANGLE_instanced_arrays | null = null;
    private vertexArrays: OES_vertex_array_object | null = null;
    private busy = false;
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
        if (signal?.aborted)
            return 'cancelled';
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
            if (this.limits.width !== limits.width || this.limits.height !== limits.height || !this.isReady())
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
        let texture: WebGLTexture | undefined, buffer: WebGLBuffer | null = null, program: WebGLProgram | undefined, vao: WebGLVertexArrayObjectOES | null = null;
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
            program = this.compile();
            buffer = gl.createBuffer();
            if (!buffer)
                throw new Error('Composite VBO allocation failed');
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            vao = this.vertexArrays?.createVertexArrayOES() ?? null;
            if (this.vertexArrays && !vao)
                throw new Error('Composite VAO allocation failed');
            const owned: Workspace = { texture, buffer, program, ...vao ? { vao } : {} };
            const arrays = this.vertexArrays;
            this.cache.put(this.key, texture, budget.gpuBytes, lost => {
                if (!lost) {
                    gl.deleteBuffer(owned.buffer);
                    gl.deleteProgram(owned.program);
                    if (owned.vao)
                        arrays!.deleteVertexArrayOES(owned.vao);
                }
                if (this.workspace === owned)
                    this.workspace = undefined;
            });
            this.workspace = owned;
            texture = undefined;
            buffer = null;
            program = undefined;
            vao = null;
            this.limits = { ...limits };
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
            if (program)
                this.gl.deleteProgram(program);
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
    preparedResources(): readonly Resource[] { if (!this.isReady())
        throw new Error('Composite pass is not prepared'); return [{ key: this.key, bytes: this.cache.resourceBytes(this.key)! }]; }
    draw(view: TransformedMaskView, target: CanonicalStraightRgba8Target, pigment: readonly [
        number,
        number,
        number
    ], control: SourceAlphaDarken32Control): 'painted' | 'empty' {
        if (this.busy)
            throw new Error('Composite draw is already active');
        const clip = this.validate(view, target, pigment, control);
        if (!this.isReady() || !this.workspace || !this.limits)
            throw new Error('Composite pass is not prepared');
        if (target.texture === this.workspace.texture || target.texture === view.texture || view.texture === this.workspace.texture)
            throw new RangeError('Composite framebuffer feedback alias');
        const viewBytes = this.cache.resourceBytes(view.key);
        if (!viewBytes || this.cache.get(view.key) !== view.texture)
            throw new RangeError('Unprepared transformed mask view');
        for (const r of this.companions)
            if (this.cache.resourceBytes(r.key) !== r.bytes || !this.cache.get(r.key))
                throw new Error('Composite companion residency changed');
        if (!clip)
            return 'empty';
        if (clip.width > this.limits.width || clip.height > this.limits.height)
            throw new RangeError('Composite clip exceeds prepared capacity');
        const resources = [...this.companions, { key: view.key, bytes: viewBytes }, ...this.preparedResources()];
        const unique = new Map(resources.map(r => [r.key, r.bytes]));
        if ([...unique.values()].reduce((a, b) => a + b, 0) > this.cache.budgetBytes)
            throw new RangeError('Composite draw exceeds GPU budget');
        this.cache.protect([...unique.keys()]);
        const release = this.cache.lease([...unique].map(([key, bytes]) => ({ key, bytes })));
        const gl = this.gl, restore = saveBrushGlState(gl, [this.attribute], this.instancing, this.vertexArrays, 2), work = this.workspace;
        this.busy = true;
        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
                || gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) !== target.texture)
                throw new Error('Canonical target attachment does not match its declared texture');
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, work.texture);
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, clip.x, clip.y, clip.width, clip.height);
            gl.viewport(clip.x, clip.y, clip.width, clip.height);
            for (const cap of [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST])
                gl.disable(cap);
            gl.colorMask(true, true, true, true);
            gl.useProgram(work.program);
            if (work.vao)
                this.vertexArrays!.bindVertexArrayOES(work.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, work.buffer);
            gl.enableVertexAttribArray(this.attribute);
            this.instancing?.vertexAttribDivisorANGLE(this.attribute, 0);
            gl.vertexAttribPointer(this.attribute, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, view.texture);
            const u = this.uniforms;
            gl.uniform1i(u.maskTexture, 0);
            gl.uniform1i(u.destinationTexture, 1);
            gl.uniform4f(u.clipRect, clip.x, clip.y, clip.width, clip.height);
            gl.uniform4f(u.maskGeometry, clip.maskX, clip.maskY, view.rect.width, view.rect.height);
            gl.uniform4f(u.maskBounds, view.bounds.x, view.bounds.y, view.bounds.width, view.bounds.height);
            gl.uniform2f(u.mirrorFlags, +view.mirror.horizontal, +view.mirror.vertical);
            gl.uniform2f(u.scratchSize, this.limits.width, this.limits.height);
            gl.uniform3f(u.pigment, ...pigment);
            gl.uniform4f(u.controls, control.opacity, control.averageOpacity, control.flow, control.mask ?? 0);
            gl.uniform2f(u.policy, control.variant === 'hard' ? 1 : 0, control.mask === undefined ? 0 : 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            return 'painted';
        }
        finally {
            restore();
            release();
            this.busy = false;
        }
    }
    reset(lost = false): void {
        this.cache.discard(this.key, lost);
        this.workspace = undefined;
        this.limits = undefined;
        this.companions = [];
        this.releaseCpu?.();
        this.releaseCpu = undefined;
        this.reservedCpuBytes = 0;
        this.uniforms = {};
        this.attribute = -1;
        this.instancing = null;
        this.vertexArrays = null;
    }
    private validate(view: TransformedMaskView, target: CanonicalStraightRgba8Target, pigment: readonly [
        number,
        number,
        number
    ], c: SourceAlphaDarken32Control): Clip | undefined {
        if (!view || !rectValid(view.rect) || view.rect.width > 4096 || view.rect.height > 4096 || view.rect.width * view.rect.height > 1048576 || view.channel !== 'r' || !view.texture || !view.key
            || !view.bounds || ![view.bounds.x, view.bounds.y, view.bounds.width, view.bounds.height].every(Number.isFinite)
            || view.bounds.x < 0 || view.bounds.y < 0 || view.bounds.width <= 0 || view.bounds.height <= 0 || view.bounds.x + view.bounds.width > 1 || view.bounds.y + view.bounds.height > 1
            || !view.mirror || typeof view.mirror.horizontal !== 'boolean' || typeof view.mirror.vertical !== 'boolean')
            throw new RangeError('Invalid transformed mask view');
        if (!target || target.brand !== 'canonical-straight-rgba8-v1' || !target.texture || !target.framebuffer
            || !rectValid({ x: target.originX, y: target.originY, width: target.width, height: target.height })
            || target.width > 4096 || target.height > 4096)
            throw new RangeError('Explicit straight RGBA8 target required');
        if (!Array.isArray(pigment) || pigment.length !== 3 || !pigment.every(v => whole(v) && v <= 255))
            throw new RangeError('Invalid straight pigment bytes');
        if (!c || c.profile !== 'optimized32-scalar-f32-rne-v1' || !['creamy', 'hard'].includes(c.variant)
            || ![c.opacity, c.averageOpacity, c.flow].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
            || c.mask !== undefined && (!whole(c.mask) || c.mask > 255))
            throw new RangeError('Invalid local alphaDarken32 controls');
        const x = Math.max(view.rect.x, target.originX), y = Math.max(view.rect.y, target.originY);
        const right = Math.min(view.rect.x + view.rect.width, target.originX + target.width), bottom = Math.min(view.rect.y + view.rect.height, target.originY + target.height);
        if (right <= x || bottom <= y)
            return;
        return { x: x - target.originX, y: target.height - (bottom - target.originY), width: right - x, height: bottom - y, maskX: x - view.rect.x, maskY: y - view.rect.y };
    }
    private compile(): WebGLProgram {
        const gl = this.gl, shaders: WebGLShader[] = [];
        let program: WebGLProgram | null = null;
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
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
            this.attribute = gl.getAttribLocation(program, 'position');
            if (this.attribute < 0)
                throw new Error('Composite attribute unavailable');
            for (const name of ['maskTexture', 'destinationTexture', 'clipRect', 'maskGeometry', 'maskBounds', 'mirrorFlags', 'scratchSize', 'pigment', 'controls', 'policy'])
                this.uniforms[name] = gl.getUniformLocation(program, name);
            return program;
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
