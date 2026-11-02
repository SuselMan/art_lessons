import {assertCanonicalPatternResourceCurrent,type CanonicalPatternResource} from './CanonicalMaskSourceBank';
import type { CanonicalPreparedResourceUpdate } from './TransformedMaskPrepass';
import {canonicalPrimaryTexturePin, canonicalFixedPrimaryTexturePin, canonicalPressureCurvePrimaryTexturePin, canonicalPrimaryTextureCell, type CanonicalPrimaryTexturePin, type CanonicalPressureCurvePrimaryTexturePin, type CanonicalFixedPrimaryTexturePin, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE} from '@grafetto/shared';
import { SOURCE_FUSED_OVER32_SCALAR_GLSL, prepareSourceFusedOver32ScalarControls } from '../raster/sourceFusedOver32ScalarShader';
import { SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL, SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL } from '../raster/sourceRgba8CompositeWebGL1';
import { canonicalizeSourceRgba8Control, canonicalizeSourceInstalledHsyControl } from '../raster/sourceRgba8CompositeShader';
import { SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE, SOURCE_RGBA8_GENERIC_SC_PROFILE, validateRgba8CompositeControl, type Rgba8CompositeControl } from '../presets/sourceColorRgba8';
import { SOURCE_FUSED_ALPHA_DARKEN32_SCALAR_GLSL, prepareSourceFusedAlphaDarken32ScalarControls } from '../raster/sourceFusedAlphaDarken32ScalarShader';
import type { BrushGlBatchFrame, BrushGlBatchInfo, BrushGlBatchLifetime } from './BrushGlBatch';
import type { SourceOver32ScalarControl } from '../presets/sourceOver32Scalar';
import { SOURCE_OVER32_SCALAR_GLSL } from '../raster/sourceOver32ScalarShader';
import type { SourceAlphaDarken32Control } from '../presets/sourceAlphaDarken32';
import { SOURCE_ALPHA_DARKEN32_GLSL } from '../raster/sourceAlphaDarken32Shader';
import { saveBrushGlState,type BrushGlContextOwner } from './BrushGlState';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache, allocateOwnedBrushTexture, allocateOwnedBrushBuffer, combineOwnedBrushResources, releaseUnpublishedBrushResource, type OwnedBrushResource, type OwnedBrushBuffer } from './BrushTextureCache';
import { reserveContextStorage, releaseStorageReservation, type StorageReservation } from '../buffers/ContextStorageOwner';
import type { TransformedMaskView } from './TransformedMaskPrepass';
import type { WorldRect } from '../buffers/tileMath';
const noMetadataRelease=()=>{};
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
export interface CanonicalExternalLifetime extends BrushGlBatchLifetime {
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
    readonly kind:'texturedMaskRgb';
    readonly view:TransformedMaskView;
    readonly rgb:readonly [number,number,number];
    readonly pattern:CanonicalPatternResource;
    readonly pin:CanonicalPrimaryTexturePin|CanonicalFixedPrimaryTexturePin|CanonicalPressureCurvePrimaryTexturePin;
    readonly strengthU8:number;
} | {
    readonly kind: 'straightRgba8';
    readonly view: CanonicalRgba8SourceView;
};
export type CanonicalCompositeOperation = {
    readonly kind:'alphaDarkenBrowserFloat';
    readonly control:Omit<SourceAlphaDarken32Control,'profile'> & {readonly profile:typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE};
} | {
    readonly kind:'overBrowserFloat';
    readonly control:Omit<SourceOver32ScalarControl,'profile'> & {readonly profile:typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE};
} | {
    /** Installed HSY float kernel; distinct from integer GenericSC admission. */
    readonly kind: 'colorHsyInstalled';
    readonly control: Extract<Rgba8CompositeControl, {readonly mode:'colorHsy'}> & {readonly profile:typeof SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE};
} | {
    /** Explicit source-law kernel; does not widen the room/stroke profile. */
    readonly kind: 'genericSCU8';
    readonly control: Extract<Rgba8CompositeControl, { readonly profile: typeof SOURCE_RGBA8_GENERIC_SC_PROFILE }>;
} | {
    readonly kind: 'alphaDarken32';
    readonly control: SourceAlphaDarken32Control;
} | {
    readonly kind: 'over32';
    readonly control: SourceOver32ScalarControl;
} | {
    readonly kind: 'alphaDarken32FusedScalar';
    readonly control: Omit<SourceAlphaDarken32Control, 'profile'> & { readonly profile: 'installed-arm64-scalar-fused-fpcr0-v1' };
} | {
    readonly kind: 'over32FusedScalar';
    readonly control: Omit<SourceOver32ScalarControl, 'profile'> & { readonly profile: 'installed-arm64-scalar-fused-fpcr0-v1' };
};
export type CanonicalCompositeOperationKind = CanonicalCompositeOperation['kind'];
export interface CanonicalCompositeRequest {
    readonly source: CanonicalCompositeSource;
    readonly target: CanonicalOwnedRgba8Target;
    readonly operation: CanonicalCompositeOperation;
    /** Immutable base for repeated preview; default target means ordinary feedback. */
    readonly readDestination?: CanonicalOwnedRgba8Target;
    /** Authoritative world pixel bounds, independent of viewport/source geometry. */
    readonly writeBounds?: Readonly<WorldRect>;
}
export interface CanonicalCompositeLimits {
    readonly width: number;
    readonly height: number;
    readonly operations?: readonly CanonicalCompositeOperationKind[];
    /** Explicit additional source-law variant; never an implicit plain-mask fallback. */
    readonly texturedOperations?:readonly CanonicalTexturedCompositeOperation[];
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
    if (!Array.isArray(operations) || !operations.length || operations.length > 3
        || operations.some(kind => !['alphaDarken32', 'over32', 'alphaDarken32FusedScalar', 'over32FusedScalar', 'genericSCU8', 'colorHsyInstalled', 'alphaDarkenBrowserFloat', 'overBrowserFloat'].includes(kind)))
        throw new RangeError('Invalid composite operations');
    return (['alphaDarken32', 'over32', 'alphaDarken32FusedScalar', 'over32FusedScalar', 'genericSCU8', 'colorHsyInstalled', 'alphaDarkenBrowserFloat', 'overBrowserFloat'] as const).filter(kind => operations.includes(kind));
}
const TEXTURED_OPERATIONS=['alphaDarken32FusedScalar','alphaDarkenBrowserFloat','over32FusedScalar','overBrowserFloat'] as const;
type CanonicalTexturedCompositeOperation=typeof TEXTURED_OPERATIONS[number];
const isTexturedOperation=(kind:CanonicalCompositeOperationKind):kind is CanonicalTexturedCompositeOperation=>TEXTURED_OPERATIONS.some(value=>value===kind);
const texturedProgram=(kind:CanonicalCompositeOperationKind)=>`${kind}:subtract-u8-v1` as const;
type CompositeProgramKey=CanonicalCompositeOperationKind|ReturnType<typeof texturedProgram>;
function texturedOperationsFor(limits:CanonicalCompositeLimits):readonly CanonicalTexturedCompositeOperation[] {
    const selected=limits.texturedOperations??[];
    if(!Array.isArray(selected)||selected.length>2||new Set(selected).size!==selected.length
        ||selected.some(kind=>!isTexturedOperation(kind)||!operationsFor(limits).includes(kind)))throw new RangeError('Invalid textured composite operations');
    return TEXTURED_OPERATIONS.filter(kind=>selected.includes(kind));
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
    return { gpuBytes: limits.width * limits.height * 4 + VBO_BYTES, cpuBytes: VBO_BYTES + PROGRAM_CPU_BYTES * (operationsFor(limits).length+texturedOperationsFor(limits).length) };
}
const VERTEX = 'attribute highp vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
/** One source/geometry template; only the selected numerical kernel is included. */
function fragmentFor(kind: CanonicalCompositeOperationKind): string {
    const kernel = kind === 'colorHsyInstalled' ? SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL : kind === 'genericSCU8' ? SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL : (kind === 'alphaDarken32'||kind==='alphaDarkenBrowserFloat') ? SOURCE_ALPHA_DARKEN32_GLSL : (kind === 'over32'||kind==='overBrowserFloat') ? SOURCE_OVER32_SCALAR_GLSL
        : kind === 'alphaDarken32FusedScalar' ? SOURCE_FUSED_ALPHA_DARKEN32_SCALAR_GLSL : SOURCE_FUSED_OVER32_SCALAR_GLSL;
    const apply = kind === 'colorHsyInstalled' ? 'sourceCompositeInstalledHsyRgba8(source,destination,SourceRgba8CompositeControl(policy.x,controls.x,controls.w,policy.y!=0.0,controls.z,controls.y,true))' : kind === 'genericSCU8' ? 'sourceCompositeRgba8(source,destination,SourceRgba8CompositeControl(policy.x,controls.x,controls.w,policy.y!=0.0,controls.z,controls.y,true))'
        : (kind === 'alphaDarken32'||kind==='alphaDarkenBrowserFloat') ? 'sourceCompositeAlphaDarken32(source,destination,controls,policy)'
        : (kind === 'over32'||kind==='overBrowserFloat') ? 'sourceCompositeOver32Scalar(source,destination,controls.xw,policy)'
        : kind === 'alphaDarken32FusedScalar' ? 'sourceCompositeFusedAlphaDarken32Scalar(source,destination,controls,policy,opacityParts,flowParts)'
        : 'sourceCompositeFusedOver32Scalar(source,destination,controls.xw,policy.y,opacityParts)';
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
uniform highp vec3 opacityParts;
uniform highp vec3 flowParts;
${kernel}
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
  gl_FragColor=${apply}/255.0;
}`;
}
/** The old fragment remains byte-identical; this explicit variant fuses the
 * versioned U8 coverage law before the existing composition kernel. */
function texturedFragmentFor(kind:CanonicalCompositeOperationKind):string {
    const reduce=[2048,1024,512,256,128,64,32,16,8,4,2,1].map(n=>`if(value>=period*${n}.0)value-=period*${n}.0;`).join('\n');
    const base=fragmentFor(kind);
    for(const required of ['uniform highp vec4 clipRect;','void main(){','  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sampled.r):sampled;'])if(!base.includes(required))throw new Error('Composite texture template changed');
    return base
        .replace('uniform highp vec4 clipRect;',`uniform highp sampler2D patternTexture;
uniform highp vec2 patternPhase;
uniform highp vec2 patternPeriod;
uniform highp float patternSide;
uniform highp float patternStrength;
uniform highp vec4 clipRect;`)
        .replace('void main(){',`highp float patternCell(highp float value,highp float period){
${reduce}
return value;
}
void main(){`)
        .replace('  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sampled.r):sampled;',`  highp vec2 patternPixel=patternPhase+floor(vec2(local.x,clipRect.w-local.y));
  highp vec2 cell=vec2(patternCell(patternPixel.x,patternPeriod.x),patternCell(patternPixel.y,patternPeriod.y));
  highp float grain=floor(texture2D(patternTexture,(cell+0.5)/patternSide).r*255.0+0.5);
  highp float coverage=max(0.0,sampled.r-grain-(255.0-patternStrength));
  highp vec4 source=vec4(pigment,coverage);`);
}
interface ProgramInfo {
    program: WebGLProgram;
    attribute: number;
    uniforms: Record<string, WebGLUniformLocation | null>;
}
interface Workspace {
    texture: WebGLTexture;
    buffer: WebGLBuffer;
    programs: Map<CompositeProgramKey, ProgramInfo>;
    vao?: WebGLVertexArrayObjectOES;
}
/** Internal opt-in numerical composition. Target is explicit straight RGBA8,
 * never the existing PM layer. Source view is already rasterized: no tip transform
 * or native-domain correction is repeated. Caller presents/outer-composites later. */
export class CanonicalRgba8CompositePass {
    readonly key: string;
    private readonly gl: WebGLRenderingContext;
    private readonly cache: BrushTextureCache;
    private readonly cpu: BrushMipCache;
    private limits?: CanonicalCompositeLimits;
    private workspace?: Workspace;
  private readonly contextOwner?:BrushGlContextOwner;
    private releaseCpu?: () => void;
    private reservedCpuBytes = 0;
    private companions: readonly Resource[] = [];
    private companionUpdate?:CanonicalPreparedResourceUpdate;
    private releaseCompanionMetadata?:()=>void;
    private instancing: ANGLE_instanced_arrays | null = null;
    private vertexArrays: OES_vertex_array_object | null = null;
    private busy = false;
    private batch?: BrushGlBatchFrame;
    constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache, prefix: string,contextOwner?:BrushGlContextOwner) {
        if (!prefix || prefix.includes('\0'))
            throw new RangeError('Invalid canonical composite scope');
        this.contextOwner=contextOwner;
        this.gl = gl;
        this.cache = cache;
        this.cpu = cpu;
        this.key = `${prefix}:workspace`;
    }
    private checkedCompanions(companions:readonly Resource[]):Map<string,number>{
        if(!Array.isArray(companions)||companions.length>4105)throw new RangeError('Invalid composite companion count')
        const group=new Map<string,number>()
        for (const r of companions) {
            if (!r.key || r.key === this.key || !whole(r.bytes, 1) || this.cache.resourceBytes(r.key) !== r.bytes || !this.cache.get(r.key)
                || group.has(r.key) && group.get(r.key) !== r.bytes)
                throw new RangeError('Unprepared composite companion');
            group.set(r.key, r.bytes);
        }
        return group
    }
    /** Stage ready-workspace companion metadata without changing live draws. */
    prepareCompanionUpdate(companions:readonly Resource[],companionCpuBytes=0):CanonicalPreparedResourceUpdate {
        if(this.companionUpdate||!this.workspace||!this.limits||this.batch||this.busy)throw new Error('Composite companion update unavailable')
        if(!Array.isArray(companions)||companions.length>4105||!whole(companionCpuBytes))throw new RangeError('Invalid composite companion count/budget')
        const owner=Object.freeze({pass:this}),epoch=this.workspace,limits=this.limits
        let oldCompanions:readonly Resource[]|undefined=this.companions
        let releaseNew=this.cpu.reserve(192*(companions.length+this.companions.length)+1024),releaseOld:undefined|(()=>void),state:'pending'|'published'|'cancelled'='pending',createdUpdate:CanonicalPreparedResourceUpdate|undefined
        try{
            const group=this.checkedCompanions(companions),budget=canonicalRgba8CompositeBudget(limits)
            if([...group.values()].reduce((a,b)=>a+b,0)+budget.gpuBytes>this.cache.budgetBytes||Math.max(this.cpu.reservedBytes-this.reservedCpuBytes,companionCpuBytes)+budget.cpuBytes>this.cpu.budgetBytes)throw new RangeError('Composite working set exceeds brush budgets')
            const maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,precision=this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER,this.gl.HIGH_FLOAT)
            if(!precision||precision.precision<23||Math.max(limits.width,limits.height)>maximum)throw new RangeError('Unverified composite GPU capability')
            if(texturedOperationsFor(limits).length&&(!whole(precision.rangeMax,24)||!whole(precision.rangeMin,14)))throw new RangeError('Unverified textured composite precision range')
            let next:readonly Resource[]|undefined=Object.freeze([...group].map(([key,bytes])=>Object.freeze({key,bytes})))
            const scalar=()=>state==='pending'&&owner.pass.companionUpdate===update&&owner.pass.workspace===epoch&&owner.pass.limits===limits&&owner.pass.companions===oldCompanions&&!owner.pass.batch&&!owner.pass.busy
            const assert=(receiver:unknown)=>{if(receiver!==update||!scalar())throw new Error('Composite companion update changed')}
            const update:CanonicalPreparedResourceUpdate=Object.freeze({
                get status(){return state},
                assertCurrent(){assert(this);if(!owner.pass.isReady()||next!.some(r=>owner.pass.cache.resourceBytes(r.key)!==r.bytes||!owner.pass.cache.get(r.key)))throw new Error('Composite staged resources changed')},
                publish(){assert(this);releaseOld=owner.pass.releaseCompanionMetadata;owner.pass.companions=next!;next=undefined;owner.pass.releaseCompanionMetadata=releaseNew;releaseNew=noMetadataRelease;oldCompanions=undefined;state='published';return undefined},
                finalizeCleanup(){if(this!==update)throw new Error('Composite companion update receiver changed');if(state==='pending')throw new Error('Composite companion update is not published');if(owner.pass.companionUpdate===update)owner.pass.companionUpdate=undefined;const release=releaseOld;releaseOld=undefined;release?.();return undefined},
                cancel(){if(this!==update)throw new Error('Composite companion update receiver changed');if(state!=='pending')return undefined;state='cancelled';next=undefined;if(owner.pass.companionUpdate===update)owner.pass.companionUpdate=undefined;oldCompanions=undefined;const release=releaseNew;releaseNew=noMetadataRelease;release();return undefined},
            })
            createdUpdate=update
            if(this.companionUpdate||this.workspace!==epoch||this.limits!==limits||this.companions!==oldCompanions||this.batch||this.busy)throw new Error('Composite companion update changed')
            this.companionUpdate=update;update.assertCurrent();return update
        }catch(error){if(createdUpdate?.status==='pending'){try{createdUpdate.cancel()}catch{/* Preserve validation error. */}}try{releaseNew()}catch{/* Preserve validation error. */}throw error}
    }

    /** Companion list is actual source-bank + prepass preparedResources metadata.
     * companionCpuBytes is the total concurrent companion estimate: already held
     * reservations are included via max(), not charged for a second time. */
    prepare(limits: CanonicalCompositeLimits, companions: readonly Resource[], companionCpuBytes = 0, signal?: AbortSignal): 'ready' | 'cancelled' {
        if (this.batch) throw new Error('Cannot prepare inside an active brush GL batch');
        if (signal?.aborted)
            return 'cancelled';
        const operations = operationsFor(limits),texturedOperations=texturedOperationsFor(limits);
        if(this.limits){
            if(this.limits.width!==limits.width||this.limits.height!==limits.height||operations.join(',')!==operationsFor(this.limits).join(',')||texturedOperations.join(',')!==texturedOperationsFor(this.limits).join(',')||!this.isReady())throw new Error('Reset composite pass before changing capacity/residency')
            const update=this.prepareCompanionUpdate(companions,companionCpuBytes);update.publish();update.finalizeCleanup();return 'ready'
        }
        const budget = canonicalRgba8CompositeBudget(limits), group = new Map<string, number>();
        if (!whole(companionCpuBytes))
            throw new RangeError('Invalid companion CPU bytes');
        const checked=this.checkedCompanions(companions);for(const [key,bytes]of checked)group.set(key,bytes)
        const otherCpu = this.cpu.reservedBytes - this.reservedCpuBytes;
        if ([...group.values()].reduce((a, b) => a + b, 0) + budget.gpuBytes > this.cache.budgetBytes
            || Math.max(otherCpu, companionCpuBytes) + budget.cpuBytes > this.cpu.budgetBytes)
            throw new RangeError('Composite working set exceeds brush budgets');
        const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
        const precision = this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER, this.gl.HIGH_FLOAT);
        if (!precision || precision.precision < 23 || Math.max(limits.width, limits.height) > maximum)
            throw new RangeError('Unverified composite GPU capability');
        if(texturedOperations.length&&(!whole(precision.rangeMax,24)||!whole(precision.rangeMin,14)))throw new RangeError('Unverified textured composite precision range');
        if (this.cache.resourceBytes(this.key) !== undefined)
            throw new Error('Canonical composite resource scope is already owned');
        const textureStorage=reserveContextStorage(this.gl,limits.width*limits.height*4,'brush-texture-rgba-equivalent');
        let bufferStorage:StorageReservation;
        try{bufferStorage=reserveContextStorage(this.gl,VBO_BYTES,'brush-buffer')}catch(error){releaseStorageReservation(textureStorage);throw error}
        let releaseCpu=()=>{},restore=()=>{},retainedCpu=false,failed=false,failure:unknown,cancelled=false;
        const loose:(OwnedBrushResource|OwnedBrushBuffer)[]=[],programs=new Map<CompositeProgramKey,ProgramInfo>();
        let vao:WebGLVertexArrayObjectOES|null=null,auxTransferred=false;
        const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;failure=error}}};
        try {
            releaseCpu=this.cpu.reserve(budget.cpuBytes);
            this.instancing=this.gl.getExtension('ANGLE_instanced_arrays');this.vertexArrays=this.gl.getExtension('OES_vertex_array_object');
            restore=saveBrushGlState(this.gl,[],this.instancing,this.vertexArrays,2);
            const gl=this.gl;
            this.cache.protect([...group.keys(),this.key]);gl.activeTexture(gl.TEXTURE0);
            const texture=allocateOwnedBrushTexture(gl,limits.width*limits.height*4,(handle,mark)=>{
                gl.bindTexture(gl.TEXTURE_2D,handle);mark(limits.width*limits.height*4);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,limits.width,limits.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
                for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.NEAREST);
                for(const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);
            },textureStorage);loose.push(texture);
            for(const kind of operations)programs.set(kind,this.compile(kind));
            for(const kind of texturedOperations)programs.set(texturedProgram(kind),this.compile(kind,true));
            const buffer=allocateOwnedBrushBuffer(gl,VBO_BYTES,(handle,mark)=>{gl.bindBuffer(gl.ARRAY_BUFFER,handle);mark(VBO_BYTES);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)},bufferStorage);loose.push(buffer);
            vao=this.vertexArrays?.createVertexArrayOES()??null;
            if(this.vertexArrays&&!vao)throw new Error('Composite VAO allocation failed');
            const owned:Workspace={texture:texture.texture,buffer:buffer.buffer,programs,...vao?{vao}:{}};
            const arrays=this.vertexArrays;
            const bundle=combineOwnedBrushResources(texture,[buffer],lost=>{
                let bad=false,first:unknown;
                for(const cleanup of [...[...owned.programs.values()].map(info=>()=>{if(!lost)gl.deleteProgram(info.program)}),()=>{if(!lost&&owned.vao)arrays!.deleteVertexArrayOES(owned.vao)}])try{cleanup()}catch(error){if(!bad){bad=true;first=error}}
                if(this.workspace===owned)this.workspace=undefined;
                if(bad)throw first;
            });loose.push(bundle);auxTransferred=true;
            this.workspace=owned;this.cache.putOwned(this.key,bundle);
            this.limits={...limits,operations,texturedOperations};this.companions=[...group].map(([key,bytes])=>({key,bytes}));
            this.releaseCpu=releaseCpu;this.reservedCpuBytes=budget.cpuBytes;retainedCpu=true;cancelled=!!signal?.aborted;
        }catch(error){failed=true;failure=error}
        finally{
            attempt(restore);
            if(failed||cancelled)attempt(()=>this.reset());
            for(const resource of loose)attempt(()=>releaseUnpublishedBrushResource(resource));
            if(!auxTransferred){for(const info of programs.values())attempt(()=>this.gl.deleteProgram(info.program));if(vao)attempt(()=>this.vertexArrays?.deleteVertexArrayOES(vao!))}
            if(!retainedCpu)attempt(releaseCpu);
            attempt(()=>releaseStorageReservation(textureStorage));attempt(()=>releaseStorageReservation(bufferStorage));
        }
        if(failed)throw failure;
        return cancelled?'cancelled':'ready';
    }

    isReady(): boolean { return !!this.workspace && !!this.limits && this.cache.get(this.key) === this.workspace.texture; }
    /** Actual compositing scratch capacity; not a brush/mask maximum.
     * Metadata-only epoch binds queued execution to this preparation. */
    preparedCapacity(): Readonly<{ width: number; height: number; epoch: object }> {
        if (!this.isReady() || !this.limits || !this.workspace) throw new Error('Composite pass is not prepared');
        return Object.freeze({ width:this.limits.width, height:this.limits.height, epoch:this.workspace });
    }
    /** Metadata admission before allocating/writing a layer target. No implicit
     * shader preparation or alternative operation is permitted. */
    supportsOperations(kinds: readonly CanonicalCompositeOperationKind[]): boolean {
        return this.isReady() && kinds.every(kind => this.workspace!.programs.has(kind));
    }
    supportsTexturedOperations(kinds:readonly CanonicalCompositeOperationKind[]):boolean {
        return this.isReady()&&kinds.every(kind=>isTexturedOperation(kind)&&this.workspace!.programs.has(texturedProgram(kind)));
    }
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
        return { gl: this.gl, cache: this.cache, cpu: this.cpu, contextOwner:this.contextOwner, epoch: this.workspace,
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
        const bounds = request.writeBounds;
        if (bounds !== undefined && (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isSafeInteger)
            || bounds.maxX < bounds.minX || bounds.maxY < bounds.minY))
            throw new RangeError('Invalid composite write bounds');
        const pattern=source.kind==='texturedMaskRgb'?this.validatePattern(source):undefined;
        const sampled = this.validateSource(source);
        this.validateTarget(target);
        if (base !== target) this.validateTarget(base);
        this.validateOperation(operation);
        if (base.width !== target.width || base.height !== target.height || base.originX !== target.originX || base.originY !== target.originY)
            throw new RangeError('Immutable destination geometry must match the output target');
        if (!this.isReady() || !this.workspace || !this.limits)
            throw new Error('Composite pass is not prepared');
        const info = this.workspace.programs.get(pattern?texturedProgram(operation.kind):operation.kind);
        if(pattern&&!isTexturedOperation(operation.kind))throw new RangeError('Unsupported textured composite operation');
        if (!info)
            throw new Error('Composite operation was not prepared');
        if (target.texture === sampled.texture || target.texture === this.workspace.texture || sampled.texture === this.workspace.texture || base.texture === this.workspace.texture)
            throw new RangeError('Composite framebuffer feedback alias');
        if(pattern&&(pattern.view.texture===target.texture||pattern.view.texture===base.texture||pattern.view.texture===this.workspace.texture||pattern.view.texture===sampled.texture))throw new RangeError('Composite pattern feedback alias');
        const resources = [...this.companions, ...this.preparedResources(),...pattern?[{key:pattern.view.key,bytes:pattern.view.width*pattern.view.height*4}]:[]];
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
        const clip = this.clip(sampled.rect, target, bounds);
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
        const gl = this.gl, work = this.workspace, restore = frame ? () => {} : saveBrushGlState(gl, [info.attribute], this.instancing, this.vertexArrays, pattern?3:2), releases: (() => void)[] = [];
        this.busy = true;
        const restoreSamplings:(()=>void)[]=[];
        let failure: unknown, failed = false;
        try {
            for (const lifetime of frame ? [] : declaredOwners) {
                const done = lifetime.lease();
                if (typeof done !== 'function')
                    throw new Error('Invalid external resource lease');
                releases.push(done);
            }
            if (this.workspace !== work || !this.limits)
                throw new Error('Composite resources changed during owner acquisition');
            if(pattern)assertCanonicalPatternResourceCurrent(pattern.view,{gl:this.gl,cache:this.cache,cpu:this.cpu});
            if (frame) { frame.bindTarget(target); if (base !== target) frame.bindTarget(base); }
            else { this.bindTarget(target); if (base !== target) this.bindTarget(base); }
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
            restoreSamplings.push(frame ? frame.pointSampling(sampled.texture) : this.pointSampling(sampled.texture));
            if(pattern){
                gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,pattern.view.texture);
                restoreSamplings.push(frame?frame.pointSampling(pattern.view.texture):this.pointSampling(pattern.view.texture,gl.TEXTURE0+2));
            }
            const u = info.uniforms;
            gl.uniform1i(u.sourceTexture, 0);
            gl.uniform1i(u.destinationTexture, 1);
            if(pattern){
                const phaseX=canonicalPrimaryTextureCell(sampled.rect.x+clip.maskX,pattern.pin.periodX,pattern.pin.offsetX);
                const phaseY=canonicalPrimaryTextureCell(sampled.rect.y+clip.maskY,pattern.pin.periodY,pattern.pin.offsetY);
                gl.uniform1i(u.patternTexture,2);gl.uniform2f(u.patternPhase,phaseX,phaseY);
                gl.uniform2f(u.patternPeriod,pattern.pin.periodX,pattern.pin.periodY);
                gl.uniform1f(u.patternSide,pattern.view.width);gl.uniform1f(u.patternStrength,pattern.strengthU8);
            }
            gl.uniform4f(u.clipRect, clip.x, clip.y, clip.width, clip.height);
            gl.uniform4f(u.sourceGeometry, clip.maskX, clip.maskY, sampled.rect.width, sampled.rect.height);
            gl.uniform4f(u.sourceBounds, sampled.bounds.x, sampled.bounds.y, sampled.bounds.width, sampled.bounds.height);
            gl.uniform2f(u.mirrorFlags, +sampled.mirror.horizontal, +sampled.mirror.vertical);
            gl.uniform2f(u.sourcePolicy, source.kind === 'straightRgba8' ? 1 : 0, sampled.rowOrder === 'bottomAtV0' ? 1 : 0);
            gl.uniform2f(u.scratchSize, this.limits.width, this.limits.height);
            gl.uniform3f(u.pigment, ...source.kind !== 'straightRgba8' ? source.rgb : [0, 0, 0] as [
                number,
                number,
                number
            ]);
            const c = operation.control;
            if (operation.kind === 'colorHsyInstalled') {
                const prepared = canonicalizeSourceInstalledHsyControl(operation.control);
                gl.uniform4f(u.controls, prepared.opacity, prepared.average, prepared.flow, prepared.mask);
                gl.uniform2f(u.policy, prepared.mode, +prepared.hasMask);
                gl.uniform1i(u.sourceHsyStageLimit, prepared.stageLimit);
            } else if (operation.kind === 'genericSCU8') {
                const prepared = canonicalizeSourceRgba8Control(operation.control);
                gl.uniform4f(u.controls, prepared.opacity, prepared.average, prepared.flow, prepared.mask);
                gl.uniform2f(u.policy, prepared.mode, +prepared.hasMask);
            } else if (operation.kind === 'alphaDarken32FusedScalar') {
                const prepared = prepareSourceFusedAlphaDarken32ScalarControls(operation.control.variant, operation.control, c.mask);
                gl.uniform4f(u.controls, ...prepared.values);
                gl.uniform2f(u.policy, ...prepared.selection);
                gl.uniform3f(u.opacityParts, ...prepared.opacityParts);
                gl.uniform3f(u.flowParts, ...prepared.flowParts);
            } else if (operation.kind === 'over32FusedScalar') {
                const prepared = prepareSourceFusedOver32ScalarControls(c.opacity, c.mask);
                gl.uniform4f(u.controls, prepared.values[0], 0, 0, prepared.values[1]);
                gl.uniform2f(u.policy, 0, prepared.hasMask);
                gl.uniform3f(u.opacityParts, ...prepared.opacityParts);
            } else if(operation.kind==='alphaDarken32'||operation.kind==='alphaDarkenBrowserFloat') {
                gl.uniform4f(u.controls,c.opacity,operation.control.averageOpacity,operation.control.flow,c.mask??0);
                gl.uniform2f(u.policy,operation.control.variant==='hard'?1:0,c.mask===undefined?0:1);
            } else {
                gl.uniform4f(u.controls,c.opacity,0,0,c.mask??0);
                gl.uniform2f(u.policy,operation.control.profile==='optimized32-neon64-scalar-frecpe-rne-v1'?1:0,c.mask===undefined?0:1);
            }
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
            for(const restoreSampling of restoreSamplings.reverse())cleanup(restoreSampling);
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
    private pointSampling(texture: WebGLTexture,unit:number=this.gl.TEXTURE0): () => void {
        const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T];
        const previous = names.map(name => gl.getTexParameter(gl.TEXTURE_2D, name) as number);
        const desired = [gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE];
        const restore=()=>{
            if(gl.isContextLost()||!gl.isTexture(texture))return;
            gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,texture);
            let failed=false,error:unknown;
            for(let i=0;i<names.length;i++)if(previous[i]!==desired[i])try{gl.texParameteri(gl.TEXTURE_2D,names[i],previous[i]);}catch(e){if(!failed){failed=true;error=e;}}
            if(failed)throw error;
        };
        try{
            for(let i=0;i<names.length;i++)if(previous[i]!==desired[i])gl.texParameteri(gl.TEXTURE_2D,names[i],desired[i]);
        }catch(error){try{restore();}catch{/* Preserve sampler preparation failure. */}throw error;}
        return restore;
    }

    reset(lost = false): void {
        if (this.batch && !lost) throw new Error('Cannot reset inside an active brush GL batch');
        if (this.busy && !lost)
            throw new Error('Cannot reset an active composite draw');
        let failed=false,primary:unknown;
        const update=this.companionUpdate;this.companionUpdate=undefined
        try{if(update?.status==='published')update.finalizeCleanup();else update?.cancel()}catch(error){failed=true;primary=error}
        try{this.cache.discard(this.key,lost)}catch(error){if(!failed){failed=true;primary=error}}
        this.workspace=undefined;this.limits=undefined;this.companions=[];
        const releaseMetadata=this.releaseCompanionMetadata;this.releaseCompanionMetadata=undefined
        try{releaseMetadata?.()}catch(error){if(!failed){failed=true;primary=error}}
        try{this.releaseCpu?.()}catch(error){if(!failed){failed=true;primary=error}}
        this.releaseCpu=undefined;this.reservedCpuBytes=0;this.instancing=null;this.vertexArrays=null;
        if(failed)throw primary;
    }

    private validatePattern(source:Extract<CanonicalCompositeSource,{kind:'texturedMaskRgb'}>):{view:CanonicalPatternResource;pin:CanonicalPrimaryTexturePin|CanonicalFixedPrimaryTexturePin|CanonicalPressureCurvePrimaryTexturePin;strengthU8:number} {
        const view=source.pattern;
        assertCanonicalPatternResourceCurrent(view,{gl:this.gl,cache:this.cache,cpu:this.cpu});
        const strength=Object.getOwnPropertyDescriptor(source.pin,'strength');
        if(!strength||!Object.hasOwn(strength,'value'))throw new TypeError('Invalid textured strength pin');
        const pin=strength.value==='source-pressure-curve-v1'?canonicalPressureCurvePrimaryTexturePin(source.pin,[view.asset]):strength.value==='fixed-one-v1'?canonicalFixedPrimaryTexturePin(source.pin,view.asset):canonicalPrimaryTexturePin(source.pin,view.asset),side=view.width,strengthU8=source.strengthU8;
        if(pin.strength==='fixed-one-v1'&&strengthU8!==255)throw new RangeError('Fixed texture requires S255');
        if(!whole(side,1)||side>4096||(side&(side-1))!==0||view.height!==side||!whole(strengthU8)||Object.is(strengthU8,-0)||strengthU8>255)throw new RangeError('Invalid textured composite source');
        return {view,pin,strengthU8};
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
        if (source.kind === 'maskRgb'||source.kind==='texturedMaskRgb') {
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
        if (operation.kind === 'colorHsyInstalled') {
            canonicalizeSourceInstalledHsyControl(operation.control);
        } else if (operation.kind === 'genericSCU8') {
            if (operation.control.profile !== SOURCE_RGBA8_GENERIC_SC_PROFILE
                || !['multiply', 'lighten', 'colorDodge', 'overlay'].includes(operation.control.mode))
                throw new RangeError('Invalid GenericSC U8 profile or mode');
            validateRgba8CompositeControl(operation.control);
        } else if (operation.kind === 'alphaDarken32' || operation.kind === 'alphaDarken32FusedScalar'||operation.kind==='alphaDarkenBrowserFloat') {
            const a = operation.control;
            if (a.profile !== (operation.kind==='alphaDarkenBrowserFloat'?CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE:operation.kind === 'alphaDarken32' ? 'optimized32-scalar-f32-rne-v1' : 'installed-arm64-scalar-fused-fpcr0-v1') || !['creamy', 'hard'].includes(a.variant)
                || ![a.averageOpacity, a.flow].every(v => Number.isFinite(v) && v >= 0 && v <= 1))
                throw new RangeError('Invalid local alphaDarken32 controls');
        }
        else if (operation.kind==='overBrowserFloat'?operation.control.profile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE:operation.kind === 'over32FusedScalar' ? operation.control.profile !== 'installed-arm64-scalar-fused-fpcr0-v1' : operation.kind !== 'over32' || !['portable-f32-division-rne-v1', 'optimized32-neon64-scalar-frecpe-rne-v1'].includes(operation.control.profile))
            throw new RangeError('Invalid Over32 profile');
    }
    private clip(rect: TransformedMaskView['rect'], target: CanonicalStraightRgba8Target, bounds?: Readonly<WorldRect>): Clip | undefined {
        const x = Math.max(rect.x, target.originX, bounds?.minX ?? -Infinity), y = Math.max(rect.y, target.originY, bounds?.minY ?? -Infinity), right = Math.min(rect.x + rect.width, target.originX + target.width, bounds?.maxX ?? Infinity), bottom = Math.min(rect.y + rect.height, target.originY + target.height, bounds?.maxY ?? Infinity);
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
    private compile(kind: CanonicalCompositeOperationKind,textured=false): ProgramInfo {
        const gl = this.gl, shaders: WebGLShader[] = [];
        let program: WebGLProgram | null = null;
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, textured?texturedFragmentFor(kind):fragmentFor(kind)]] as const) {
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
            for (const name of ['sourceTexture', 'destinationTexture', 'clipRect', 'sourceGeometry', 'sourceBounds', 'mirrorFlags', 'sourcePolicy', 'scratchSize', 'pigment', 'controls', 'policy', 'opacityParts', 'flowParts', ...kind === 'colorHsyInstalled' ? ['sourceHsyStageLimit'] : [],...textured?['patternTexture','patternPhase','patternPeriod','patternSide','patternStrength']:[]])
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
