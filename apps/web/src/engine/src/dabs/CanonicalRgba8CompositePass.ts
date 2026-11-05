import {SOURCE_TABLE_COMPOSITE_MODES,isSourceTableCompositeMode,tableCompositeFragmentVariant,type SourceTableCompositeMode,isSourceCapturedCompositeMode,capturedCompositeFragmentVariant,type SourceCapturedCompositeMode} from '../raster/sourceCompositeProgramShader'
import{sourceDissolveUint32Bytes}from'../presets/sourceDissolve'
import {CanonicalScalarAtlas} from './CanonicalScalarAtlas'
import {isSourceScalarPowerMode,type SourceScalarPowerMode} from '../presets/sourceScalarPowerTable'
import {scalarPowerFragmentVariant} from '../raster/sourceScalarPowerShader'
import {setGlColorMask} from '../raster/GlClearState'
import { SOURCE_RGBA8_GENERIC_SC_MODES } from '../presets/sourceColorRgba8';
import {CANONICAL_TEXTURE_COLOR_MATERIAL_GLSL} from './canonicalTextureColorMaterial';
import { CANONICAL_MASKING_BLEND_GLSL } from './canonicalMaskingBlendShader';
import {BRUSH_ALPHA_THRESHOLD_GLSL} from '../presets/brushAlphaThreshold'
import {BRUSH_LIGHTNESS_GLSL} from '../raster/brushBehaviorShaders'
import {assertBrushGlMutationIdle} from './BrushGlBatch';
import {canonicalPatternResourceLifetime,assertCanonicalPatternResourceCurrent,type CanonicalPatternResource,type CanonicalGradientResource} from './CanonicalMaskSourceBank';
import type { CanonicalPreparedResourceUpdate } from './TransformedMaskPrepass';
import {canonicalPixelColorTexturePin,type CanonicalPixelColorTexturePin,canonicalMaskingBlendModes,canonicalPixelPrimaryTexturePin,type CanonicalPixelPrimaryTexturePin,canonicalMultiplyPrimaryTexturePin,type CanonicalMultiplyPrimaryTexturePin,canonicalRecordedPrimaryTexturePin, type CanonicalRecordedPrimaryTexturePin, canonicalPrimaryTexturePin, canonicalFixedPrimaryTexturePin, canonicalPressureCurvePrimaryTexturePin, canonicalPrimaryTextureCell, type CanonicalPrimaryTexturePin, type CanonicalPressureCurvePrimaryTexturePin, type CanonicalFixedPrimaryTexturePin, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE} from '@grafetto/shared';
import { SOURCE_FUSED_OVER32_SCALAR_GLSL, prepareSourceFusedOver32ScalarControls } from '../raster/sourceFusedOver32ScalarShader';
import { SOURCE_RGBA8_BROWSER_HSY_WEBGL1_GLSL, SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL, SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL } from '../raster/sourceRgba8CompositeWebGL1';
import { canonicalizeSourceBrowserHsyControl, canonicalizeSourceRgba8Control, canonicalizeSourceInstalledHsyControl } from '../raster/sourceRgba8CompositeShader';
import { SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE, SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE, SOURCE_RGBA8_GENERIC_SC_PROFILE, validateRgba8CompositeControl, type Rgba8CompositeControl } from '../presets/sourceColorRgba8';
import { SOURCE_FUSED_ALPHA_DARKEN32_SCALAR_GLSL, prepareSourceFusedAlphaDarken32ScalarControls } from '../raster/sourceFusedAlphaDarken32ScalarShader';
import type { BrushGlBatchFrame, BrushGlBatchInfo, BrushGlBatchLifetime,BrushGlBatchParticipant } from './BrushGlBatch';
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
export type CanonicalCompositeSource = ({readonly kind:'imageMaterialRgba';readonly material:'lightness-map-v1'|'color-stamp-v1'|'gradient-map-v1';readonly view:TransformedMaskView;readonly rgb:readonly[number,number,number];readonly strength:number;readonly foregroundAlpha:number} | {
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
    readonly pin:CanonicalPrimaryTexturePin|CanonicalFixedPrimaryTexturePin|CanonicalPressureCurvePrimaryTexturePin|CanonicalRecordedPrimaryTexturePin;
    readonly strengthU8:number;
} | {
    /** Explicit new grain law; historical texturedMaskRgb stays subtract-only. */
    readonly kind:'primaryGrainMaskRgb';
    readonly view:TransformedMaskView;
    readonly rgb:readonly [number,number,number];
    readonly pattern:CanonicalPatternResource;
    readonly pin:CanonicalMultiplyPrimaryTexturePin|CanonicalPixelPrimaryTexturePin|CanonicalPixelColorTexturePin;
    readonly gradient?:CanonicalGradientResource;
    readonly textureColorStrength?:number;
    readonly imageMaterial?:Readonly<{kind:'lightness-map-v1'|'color-stamp-v1'|'gradient-map-v1';strength:number;foregroundAlpha:number}>;
    readonly strengthU8?:number;
} | {
    readonly kind: 'straightRgba8';
    readonly view: CanonicalRgba8SourceView;
}) & {readonly pigmentAlphaU8?:number};
export const CANONICAL_DUAL_MASKING_MODES=['multiply','darken','overlay','colorDodge','colorBurn','linearBurn','add','hardMix','hardMixSofter','subtract'] as const;
export type CanonicalDualMaskingMode=typeof CANONICAL_DUAL_MASKING_MODES[number];
export type CanonicalCompositeOperation = {readonly kind:'erase32FusedScalar';readonly control:Omit<SourceOver32ScalarControl,'profile'>&{readonly profile:'installed-arm64-scalar-fused-fpcr0-v1'}} | {readonly kind:'maskingAlpha';readonly control:{readonly mode:CanonicalDualMaskingMode}} | {
    readonly kind:'alphaDarkenBrowserFloat';
    readonly control:Omit<SourceAlphaDarken32Control,'profile'> & {readonly profile:typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE};
} | {
    readonly kind:'overBrowserFloat';
    readonly control:Omit<SourceOver32ScalarControl,'profile'> & {readonly profile:typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE};
} | {
    readonly kind:'colorHsyBrowser';
    readonly control:Extract<Rgba8CompositeControl,{readonly mode:'colorHsy'}>&{readonly profile:typeof SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE};
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
    readonly primaryGrainPrograms?:readonly CanonicalPrimaryGrainProgram[];
    readonly imageMaterialOperations?:readonly CanonicalCompositeOperationKind[];
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
    if (!Array.isArray(operations) || !operations.length || operations.length > 3+Number(operations.includes('colorHsyBrowser'))+Number(operations.includes('maskingAlpha'))+Number(operations.includes('erase32FusedScalar'))
        || operations.some(kind => !['alphaDarken32', 'over32', 'alphaDarken32FusedScalar', 'over32FusedScalar', 'genericSCU8', 'colorHsyInstalled', 'colorHsyBrowser', 'alphaDarkenBrowserFloat', 'overBrowserFloat','maskingAlpha','erase32FusedScalar'].includes(kind)))
        throw new RangeError('Invalid composite operations');
    return (['alphaDarken32', 'over32', 'alphaDarken32FusedScalar', 'over32FusedScalar', 'genericSCU8', 'colorHsyInstalled', 'colorHsyBrowser', 'alphaDarkenBrowserFloat', 'overBrowserFloat','maskingAlpha','erase32FusedScalar'] as const).filter(kind => operations.includes(kind));
}
const TEXTURED_OPERATIONS=['alphaDarken32FusedScalar','alphaDarkenBrowserFloat','over32FusedScalar','overBrowserFloat'] as const;
type CanonicalTexturedCompositeOperation=typeof TEXTURED_OPERATIONS[number];
const isTexturedOperation=(kind:CanonicalCompositeOperationKind):kind is CanonicalTexturedCompositeOperation=>TEXTURED_OPERATIONS.some(value=>value===kind);
const texturedProgram=(kind:CanonicalCompositeOperationKind)=>`${kind}:subtract-u8-v1` as const;
export interface CanonicalPrimaryGrainProgram {
    readonly operation:CanonicalTexturedCompositeOperation|'erase32FusedScalar'|'genericSCU8'|'colorHsyBrowser';
    readonly law:'hard-multiply-u8-native-v1'|'pixel-texture-u8-v1'|'pixel-color-texture-v1';
}
const capturedProgram=(mode:SourceCapturedCompositeMode,base:string):`captured-composite:${string}`=>`captured-composite:${mode}:${base}`;
const multiplyProgram='over32FusedScalar:hard-multiply-u8-native-v1' as const;
const pixelTextureProgram=(kind:CanonicalCompositeOperationKind)=>`${kind}:pixel-texture-u8-v1` as const;
const colorTextureProgram=(kind:CanonicalCompositeOperationKind)=>`${kind}:pixel-color-texture-v1` as const;
const primaryGrainProgram=(law:CanonicalPrimaryGrainProgram['law'],kind:CanonicalCompositeOperationKind)=>law==='pixel-color-texture-v1'?colorTextureProgram(kind):law==='pixel-texture-u8-v1'?pixelTextureProgram(kind):multiplyProgram;
function primaryGrainProgramsFor(limits:CanonicalCompositeLimits):readonly CanonicalPrimaryGrainProgram[] {
    const selected=limits.primaryGrainPrograms??[];
    if(!Array.isArray(selected)||selected.length>operationsFor(limits).length*3)throw new RangeError('Invalid primary grain programs');
    for(let i=0;i<selected.length;i++){
        const item=Object.getOwnPropertyDescriptor(selected,String(i));
        if(!item||!Object.hasOwn(item,'value'))throw new RangeError('Invalid primary grain program item');
        const entry:unknown=item.value;
        if(!entry||typeof entry!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(entry))||Reflect.ownKeys(entry).length!==2)throw new RangeError('Invalid primary grain program');
        const operation=Object.getOwnPropertyDescriptor(entry,'operation'),law=Object.getOwnPropertyDescriptor(entry,'law');
        if(!operation||!Object.hasOwn(operation,'value')||!['alphaDarken32FusedScalar','alphaDarkenBrowserFloat','over32FusedScalar','overBrowserFloat','erase32FusedScalar','genericSCU8','colorHsyBrowser'].includes(operation.value)||!law||!Object.hasOwn(law,'value')||!['hard-multiply-u8-native-v1','pixel-texture-u8-v1','pixel-color-texture-v1'].includes(law.value)||!operationsFor(limits).includes(operation.value))throw new RangeError('Invalid primary grain program');
    }
    if(selected.some(p=>p.law==='hard-multiply-u8-native-v1'&&p.operation!=='over32FusedScalar'))throw new RangeError('Historical multiply only supports OVER');
    if(new Set(selected.map(p=>primaryGrainProgram(p.law,p.operation))).size!==selected.length)throw new RangeError('Duplicate primary grain program');
    return Object.freeze(selected.map(p=>Object.freeze({operation:p.operation,law:p.law})));
}
const imageMaterialProgram=(kind:CanonicalCompositeOperationKind)=>`${kind}:image-material` as const;
function imageMaterialOperationsFor(limits:CanonicalCompositeLimits):readonly CanonicalCompositeOperationKind[]{const selected=limits.imageMaterialOperations??[];if(!Array.isArray(selected)||selected.length>operationsFor(limits).length||new Set(selected).size!==selected.length||selected.some(k=>k==='maskingAlpha'||!operationsFor(limits).includes(k)))throw new RangeError('Invalid lightness operation inventory');return operationsFor(limits).filter(k=>selected.includes(k));}
type CompositeProgramKey=`captured-composite:${string}`|`table-composite:${SourceTableCompositeMode}:${string}`|`scalar-power:${SourceScalarPowerMode}:${string}`|CanonicalCompositeOperationKind|ReturnType<typeof texturedProgram>|typeof multiplyProgram|ReturnType<typeof pixelTextureProgram>|ReturnType<typeof colorTextureProgram>|ReturnType<typeof imageMaterialProgram>;
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
    return { gpuBytes: limits.width * limits.height * 4 + VBO_BYTES, cpuBytes: VBO_BYTES + PROGRAM_CPU_BYTES * (operationsFor(limits).length+texturedOperationsFor(limits).length+primaryGrainProgramsFor(limits).length+imageMaterialOperationsFor(limits).length+SOURCE_TABLE_COMPOSITE_MODES.length*(Number(operationsFor(limits).includes('genericSCU8'))+primaryGrainProgramsFor(limits).filter(p=>p.operation==='genericSCU8').length+Number(imageMaterialOperationsFor(limits).includes('genericSCU8')))) };
}
const VERTEX = 'attribute highp vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
/** One source/geometry template; only the selected numerical kernel is included. */
function fragmentFor(kind: CanonicalCompositeOperationKind): string {
    if(kind==='erase32FusedScalar')return fragmentFor('over32FusedScalar').replace(
      'gl_FragColor=sourceCompositeFusedOver32Scalar(source,destination,controls.xw,policy.y,opacityParts)/255.0;',
      'highp float eraseAlpha=source.a*controls.x*(policy.y!=0.0?controls.w*0.003921568859368563:1.0);gl_FragColor=vec4(destination.rgb,sourceOver32RoundEven(clamp(sourceFmaFiniteNumbers(-eraseAlpha,destination.a*0.003921568859368563,destination.a),0.0,255.0)))/255.0;');

    if(kind==='maskingAlpha')return fragmentFor('over32FusedScalar')
      .replace('void main(){',`${CANONICAL_MASKING_BLEND_GLSL}\nvoid main(){`)
      .replace('gl_FragColor=sourceCompositeFusedOver32Scalar(source,destination,controls.xw,policy.y,opacityParts)/255.0;',
        'gl_FragColor=vec4(destination.rgb,canonicalMaskingBlend(controls.x,source.a,destination.a,-1.0,0.0))/255.0;');

    const kernel = kind === 'colorHsyBrowser' ? SOURCE_RGBA8_BROWSER_HSY_WEBGL1_GLSL : kind === 'colorHsyInstalled' ? SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL : kind === 'genericSCU8' ? SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL : (kind === 'alphaDarken32'||kind==='alphaDarkenBrowserFloat') ? SOURCE_ALPHA_DARKEN32_GLSL : (kind === 'over32'||kind==='overBrowserFloat') ? SOURCE_OVER32_SCALAR_GLSL
        : kind === 'alphaDarken32FusedScalar' ? SOURCE_FUSED_ALPHA_DARKEN32_SCALAR_GLSL : SOURCE_FUSED_OVER32_SCALAR_GLSL;
    const apply = kind === 'colorHsyBrowser' ? 'sourceCompositeBrowserHsyRgba8(source,destination,SourceRgba8CompositeControl(policy.x,controls.x,controls.w,policy.y!=0.0,controls.z,controls.y,true))' : kind === 'colorHsyInstalled' ? 'sourceCompositeInstalledHsyRgba8(source,destination,SourceRgba8CompositeControl(policy.x,controls.x,controls.w,policy.y!=0.0,controls.z,controls.y,true))' : kind === 'genericSCU8' ? 'sourceCompositeRgba8(source,destination,SourceRgba8CompositeControl(policy.x,controls.x,controls.w,policy.y!=0.0,controls.z,controls.y,(policy.x>=128.0&&policy.x<=129.0)?policy.z!=0.0:true),policy.w!=0.0)'
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
uniform highp float pigmentAlpha;
uniform highp float sourceAlphaChannel;
uniform highp vec4 controls;
uniform highp ${kind==='genericSCU8'?'vec4':'vec2'} policy;
uniform highp vec3 opacityParts;
uniform highp vec3 flowParts;
uniform highp vec3 sharpness;
${BRUSH_ALPHA_THRESHOLD_GLSL}
highp float sourcePigmentCoverage(highp float coverage){highp float n=coverage*pigmentAlpha+128.0;return floor((n+floor(n/256.0))/256.0);}
${kernel}
void main(){
  highp vec2 local=gl_FragCoord.xy-clipRect.xy;
  highp vec2 pixel=floor(vec2(sourceGeometry.x+local.x,sourceGeometry.y+clipRect.w-local.y));
  if(mirrorFlags.x!=0.0)pixel.x=sourceGeometry.z-1.0-pixel.x;
  if(mirrorFlags.y!=0.0)pixel.y=sourceGeometry.w-1.0-pixel.y;
  if(sourcePolicy.y!=0.0)pixel.y=sourceGeometry.w-1.0-pixel.y;
  highp vec2 sourceUV=sourceBounds.xy+(pixel+0.5)/sourceGeometry.zw*sourceBounds.zw;
  highp vec4 sampled=floor(texture2D(sourceTexture,sourceUV)*255.0+0.5);
  if(sourceAlphaChannel<0.5)sampled.r=brushAlphaThreshold(sampled.r/255.0,sharpness)*255.0;
  else sampled.a=brushAlphaThreshold(sampled.a/255.0,sharpness)*255.0;
  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sourcePigmentCoverage(sampled.r)):sampled;
  if(pigmentAlpha==0.0)source.a=0.0;
  highp vec4 destination=floor(texture2D(destinationTexture,local/scratchSize)*255.0+0.5);
  gl_FragColor=${apply}/255.0;
}`;
}
/** Explicit material variant shares the sampling/coverage pipeline and the
 * existing composition kernel; bitmap RGB is not replaced by foreground RGB. */
function imageMaterialFragmentFor(kind:CanonicalCompositeOperationKind):string {
 return fragmentFor(kind).replace('void main(){',`uniform highp vec3 lightnessMaterial;
${BRUSH_LIGHTNESS_GLSL}
void main(){`)
  .replace('highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sourcePigmentCoverage(sampled.r)):sampled;',
    'highp vec4 source=vec4(lightnessMaterial.x<1.5?brushMaterialColor(pigment/255.0,sampled.r/255.0,lightnessMaterial.y)*255.0:sampled.rgb,lightnessMaterial.x<1.5?min(sampled.a,lightnessMaterial.z*255.0):sampled.a*lightnessMaterial.z);');
}
function texturedFragmentFor(kind:CanonicalCompositeOperationKind):string {
    const reduce=[2048,1024,512,256,128,64,32,16,8,4,2,1].map(n=>`if(value>=period*${n}.0)value-=period*${n}.0;`).join('\n');
    const base=fragmentFor(kind);
    for(const required of ['uniform highp vec4 clipRect;','void main(){','  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sourcePigmentCoverage(sampled.r)):sampled;'])if(!base.includes(required))throw new Error('Composite texture template changed');
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
        .replace('  highp vec4 source=sourcePolicy.x==0.0?vec4(pigment,sourcePigmentCoverage(sampled.r)):sampled;',`  highp vec2 patternPixel=patternPhase+floor(vec2(local.x,clipRect.w-local.y));
  highp vec2 cell=vec2(patternCell(patternPixel.x,patternPeriod.x),patternCell(patternPixel.y,patternPeriod.y));
  highp float grain=floor(texture2D(patternTexture,(cell+0.5)/patternSide).r*255.0+0.5);
  highp float coverage=max(0.0,sourcePigmentCoverage(sampled.r)-grain-(255.0-patternStrength));
  highp vec4 source=vec4(pigment,coverage);`);
}
function multiplyFragmentFor():string {
    const base=texturedFragmentFor('over32FusedScalar');
    const old='highp float coverage=max(0.0,sourcePigmentCoverage(sampled.r)-grain-(255.0-patternStrength));';
    if(!base.includes(old))throw new Error('Multiply texture template changed');
    // max triple255^3 + bias + floor(biased/128) <2^24, exact highp integers.
    return base.replace(old,`highp float biased=sourcePigmentCoverage(sampled.r)*grain*patternStrength+32603.0;
  highp float coverage=floor((biased+floor(biased/128.0))/65536.0);`);
}
/** One common sampled-alpha program for all closed Pixel texture modes. */
function pixelTextureFragmentFor(kind:CanonicalCompositeOperationKind):string {
 return texturedFragmentFor(kind)
  .replace('void main(){',`uniform highp vec2 patternLaw;
uniform highp vec3 lightnessMaterial;
${BRUSH_LIGHTNESS_GLSL}
${CANONICAL_MASKING_BLEND_GLSL}
void main(){`)
  .replace('highp float coverage=max(0.0,sourcePigmentCoverage(sampled.r)-grain-(255.0-patternStrength));',`highp float baseAlpha=lightnessMaterial.x<0.5?sourcePigmentCoverage(sampled.r):lightnessMaterial.x<1.5?min(sampled.a,lightnessMaterial.z*255.0):sampled.a*lightnessMaterial.z;
  highp float coverage=canonicalMaskingBlend(patternLaw.x,grain,floor(clamp(baseAlpha,0.0,255.0)+0.5),patternStrength,patternLaw.y);`)
  .replace('highp vec4 source=vec4(pigment,coverage);','highp vec3 materialRgb=lightnessMaterial.x<0.5?pigment:lightnessMaterial.x<1.5?brushMaterialColor(pigment/255.0,sampled.r/255.0,lightnessMaterial.y)*255.0:sampled.rgb;highp vec4 source=vec4(materialRgb,coverage);');
}
/** Color textures preserve the paired pattern alpha and use an explicitly
 * captured LUT. The source material stage precedes this SAME composition pass. */
function colorTextureFragmentFor(kind:CanonicalCompositeOperationKind):string {
 return pixelTextureFragmentFor(kind)
  .replace(BRUSH_LIGHTNESS_GLSL,CANONICAL_TEXTURE_COLOR_MATERIAL_GLSL)
  .replace('uniform highp vec2 patternLaw;','uniform highp float textureColorMode;\nuniform highp float textureColorStrength;\nuniform highp sampler2D gradientTexture;')
  .replace('highp float grain=floor(texture2D(patternTexture,(cell+0.5)/patternSide).r*255.0+0.5);','highp vec4 patternSample=floor(texture2D(patternTexture,(cell+0.5)/patternSide)*255.0+0.5);highp float grain=patternSample.r;')
  .replace('highp float coverage=canonicalMaskingBlend(patternLaw.x,grain,floor(clamp(baseAlpha,0.0,255.0)+0.5),patternStrength,patternLaw.y);','highp float coverage=floor(clamp(baseAlpha,0.0,255.0)+0.5);')
  .replace('highp vec4 source=vec4(materialRgb,coverage);','highp float row=floor(grain/16.0);highp vec2 gradientUV=(vec2(grain-row*16.0,row)+0.5)/16.0;highp vec4 source=textureColorMode<1.5?canonicalTextureLightness(vec4(materialRgb,coverage),patternSample.ra,textureColorStrength):canonicalTextureGradient(vec4(materialRgb,coverage),patternSample.ra,floor(texture2D(gradientTexture,gradientUV)*255.0+0.5),textureColorStrength);');
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
const NO_PRIMARY_GRAIN_PROGRAMS:readonly CanonicalPrimaryGrainProgram[]=Object.freeze([]);
export type CanonicalScalarAtlasStyle='plain'|'image'|'grain'|'color-grain';
const scalarParticipantOwners=new WeakMap<BrushGlBatchParticipant,{readonly pass:CanonicalRgba8CompositePass;readonly modes:readonly SourceScalarPowerMode[]}>();
export class CanonicalRgba8CompositePass {
    readonly key: string;
    private readonly gl: WebGLRenderingContext;
    private readonly cache: BrushTextureCache;
    private readonly cpu: BrushMipCache;
    private readonly scalarAtlas:CanonicalScalarAtlas;
    private readonly scalarParticipants=new Map<SourceScalarPowerMode,BrushGlBatchParticipant>();
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
        this.scalarAtlas=new CanonicalScalarAtlas(gl,cache,cpu,prefix);
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
    /** Add only requested native programs to the SAME scratch owner. Nothing is
     * visible until checked publication; companions and GL turns share the
     * existing update mutex. No program is compiled from a draw call. */
    preparedOperations():readonly CanonicalCompositeOperationKind[]{
        if(!this.workspace||!this.limits)throw new Error('Composite operation inventory unavailable');
        return Object.freeze([...operationsFor(this.limits)]);
    }
    /** Add only explicitly selected browser HSY. Existing operations are DATA;
     * no arbitrary operation compiler or permission flag is exposed. */
    prepareOperationProgramUpdate(requested:readonly CanonicalCompositeOperationKind[]):CanonicalPreparedResourceUpdate {
        return this.prepareProgramUpdate({kind:'operations',requested});
    }
    preparePrimaryGrainProgramUpdate(requested:readonly CanonicalPrimaryGrainProgram[]):CanonicalPreparedResourceUpdate {
        return this.prepareProgramUpdate({kind:'grain',requested});
    }
    prepareImageMaterialProgramUpdate(requested:readonly CanonicalCompositeOperationKind[]):CanonicalPreparedResourceUpdate {
        return this.prepareProgramUpdate({kind:'image',requested});
    }
    scalarAtlasResources(mode:SourceScalarPowerMode):readonly Resource[]{const page=this.scalarAtlas.resource(mode);return [{key:page.key,bytes:page.bytes}]}
    retainScalarAtlas(mode:SourceScalarPowerMode):()=>void{return this.cache.leaseRequired(this.scalarAtlasResources(mode))}
    /** Issued immutable view of exactly this Work/presentation's actual modes. */
    scalarParticipantForModes(modes:readonly SourceScalarPowerMode[]):BrushGlBatchParticipant{
        if(!Array.isArray(modes)||modes.length>5||modes.some(mode=>!isSourceScalarPowerMode(mode)))throw new TypeError('Invalid scalar participant modes');
        const selected=Object.freeze([...new Set(modes)]);if(!selected.length)return this;
        for(const mode of selected)this.scalarAtlas.resource(mode);
        if(selected.length===1){const existing=this.scalarParticipants.get(selected[0]);if(existing)return existing}
        const pass=this;
        const participant:BrushGlBatchParticipant=Object.freeze({
            brushGlBatchInfo(){if(this!==participant)throw new Error('Foreign scalar participant');return pass.batchInfoFor(selected)},
            enterBrushGlBatch(frame:BrushGlBatchFrame){if(this!==participant)throw new Error('Foreign scalar participant');return pass.enterBatch(frame,participant)},
        });
        scalarParticipantOwners.set(participant,{pass:this,modes:selected});if(selected.length===1)this.scalarParticipants.set(selected[0],participant);return participant;
    }
    scalarParticipant(mode:SourceScalarPowerMode):BrushGlBatchParticipant{return this.scalarParticipantForModes([mode])}
    drawSourceIn(participant:BrushGlBatchParticipant,request:CanonicalCompositeRequest,frame?:BrushGlBatchFrame):'painted'|'empty'{
        if(participant===this)return this.drawSource(request,frame);
        const owned=scalarParticipantOwners.get(participant);if(owned?.pass!==this)throw new Error('Foreign scalar composite participant');
        return this.drawSourceCore(request,frame,participant,owned.modes);
    }
    drawSourceFor(mode:SourceScalarPowerMode,request:CanonicalCompositeRequest,frame?:BrushGlBatchFrame):'painted'|'empty'{return this.drawSourceIn(this.scalarParticipant(mode),request,frame)}
    private scalarProgramBases(styles:readonly CanonicalScalarAtlasStyle[]):readonly CompositeProgramKey[]{
        if(!Array.isArray(styles)||!styles.length||styles.length>4)throw new TypeError('Invalid scalar source styles');
        const keys:CompositeProgramKey[]=[];
        for(const style of new Set(styles)){
            const key=style==='plain'?'genericSCU8':style==='image'?imageMaterialProgram('genericSCU8'):style==='grain'?primaryGrainProgram('pixel-texture-u8-v1','genericSCU8'):style==='color-grain'?primaryGrainProgram('pixel-color-texture-v1','genericSCU8'):undefined;
            if(key===undefined||!this.workspace!.programs.has(key))throw new Error('GenericSC source style must already be prepared');keys.push(key);
        }
        return keys;
    }
    /** Cold candidate's bounded temporary ownership until real Entries/Works admit. */
    async prepareScalarAtlasInventory(requests:readonly Readonly<{mode:SourceScalarPowerMode;styles:readonly CanonicalScalarAtlasStyle[]}>[],current:()=>void,signal?:AbortSignal):Promise<()=>void>{
        if(!Array.isArray(requests)||requests.length>5||new Set(requests.map(request=>request.mode)).size!==requests.length)throw new TypeError('Invalid scalar inventory');
        const releaseMetadata=this.cpu.reserve(512+requests.length*128),leases:(()=>void)[]=[];let held=true;
        const release=()=>{if(!held)return;held=false;let failed=false,primary:unknown;for(const done of [...leases.splice(0).reverse(),releaseMetadata])try{done()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary};
        try{
            for(const request of requests){current();if(signal?.aborted)throw new DOMException('Scalar inventory cancelled','AbortError');await this.prepareScalarAtlas(request.mode,signal,current,request.styles);current();if(signal?.aborted)throw new DOMException('Scalar inventory cancelled','AbortError');leases.push(this.retainScalarAtlas(request.mode));current()}
            return release;
        }catch(primary){try{release()}catch{}throw primary}
    }
    /** Selected-mode variants share the same charged workspace and transaction.
     * Existing generic programs remain valid independent numerical controls. */
    async prepareCapturedComposite(mode:SourceCapturedCompositeMode,signal?:AbortSignal,current?:()=>void,styles:readonly CanonicalScalarAtlasStyle[]=['plain']):Promise<void>{
        if(!isSourceCapturedCompositeMode(mode))throw new TypeError('Unknown captured composite mode');
        if(isSourceScalarPowerMode(mode))return this.prepareScalarAtlas(mode,signal,current,styles);
        current?.();if(signal?.aborted)throw new DOMException('Captured composite cancelled','AbortError');
        this.assertMutationIdle();if(!this.workspace||!this.limits)throw new Error('Composite captured owner unavailable');
        const bases=this.scalarProgramBases(styles);if(!bases.length)throw new Error('GenericSC operation must be prepared before captured composite');
        if(isSourceTableCompositeMode(mode)){if(!bases.every(base=>this.workspace!.programs.has(`table-composite:${mode}:${base}`)))throw new Error('Table composite style unavailable');return;}
        if(bases.every(base=>this.workspace!.programs.has(capturedProgram(mode,base))))return;
        let update:CanonicalPreparedResourceUpdate|undefined;
        try{
            update=this.prepareProgramUpdate({kind:'captured',mode,styles});current?.();
            if(signal?.aborted)throw new DOMException('Captured composite cancelled','AbortError');
            update.assertCurrent();update.publish();update.finalizeCleanup();
        }catch(primary){try{if(update?.status==='published')update.finalizeCleanup();else update?.cancel()}catch{}throw primary;}
    }
    async prepareCapturedCompositeInventory(requests:readonly Readonly<{mode:SourceCapturedCompositeMode;styles:readonly CanonicalScalarAtlasStyle[]}>[],current:()=>void,signal?:AbortSignal):Promise<()=>void>{
        if(!Array.isArray(requests)||requests.length>SOURCE_RGBA8_GENERIC_SC_MODES.length||new Set(requests.map(request=>request.mode)).size!==requests.length||requests.some(request=>!isSourceCapturedCompositeMode(request.mode)))throw new TypeError('Invalid captured composite inventory');
        const releaseMetadata=this.cpu.reserve(512+requests.length*128),leases:(()=>void)[]=[];let held=true;
        const release=()=>{if(!held)return;held=false;let failed=false,primary:unknown;for(const done of [...leases.splice(0).reverse(),releaseMetadata])try{done()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary};
        try{
            for(const request of requests){current();if(signal?.aborted)throw new DOMException('Captured inventory cancelled','AbortError');await this.prepareCapturedComposite(request.mode,signal,current,request.styles);current();if(signal?.aborted)throw new DOMException('Captured inventory cancelled','AbortError');if(isSourceScalarPowerMode(request.mode))leases.push(this.retainScalarAtlas(request.mode));current();}
            return release;
        }catch(primary){try{release()}catch{}throw primary}
    }
    /** Actual selected finite-byte law, prepared outside input/GL turns. */
    async prepareScalarAtlas(mode:SourceScalarPowerMode,signal?:AbortSignal,current?:()=>void,styles:readonly CanonicalScalarAtlasStyle[]=['plain']):Promise<void>{
        this.assertMutationIdle();if(!this.workspace||!this.limits)throw new Error('Composite scalar owner unavailable');
        const epoch=this.workspace,bases=this.scalarProgramBases(styles);
        if(!bases.length)throw new Error('GenericSC operation must be prepared before scalar Atlas');
        if(this.scalarAtlas.has(mode)&&bases.every(base=>epoch.programs.has(`scalar-power:${mode}:${base}`)))return;
        await this.scalarAtlas.prepare(mode,[...this.preparedResources(),...this.companions],()=>{current?.();this.assertMutationIdle(epoch)},signal);
        this.assertMutationIdle(epoch);
        const releasePage=this.retainScalarAtlas(mode);let update:CanonicalPreparedResourceUpdate|undefined,failed=false,primary:unknown;
        try{update=this.prepareProgramUpdate({kind:'atlas',mode,styles});update.assertCurrent();update.publish();update.finalizeCleanup()}
        catch(error){failed=true;primary=error;try{if(update?.status==='published')update.finalizeCleanup();else update?.cancel()}catch{}}
        finally{try{releasePage()}catch(error){if(!failed){failed=true;primary=error}}}
        if(failed)throw primary;
    }
    private prepareProgramUpdate(request:{readonly kind:'captured';readonly mode:SourceCapturedCompositeMode;readonly styles:readonly CanonicalScalarAtlasStyle[]}|{readonly kind:'atlas';readonly mode:SourceScalarPowerMode;readonly styles:readonly CanonicalScalarAtlasStyle[]}|{readonly kind:'grain';readonly requested:readonly CanonicalPrimaryGrainProgram[]}|{readonly kind:'operations'|'image';readonly requested:readonly CanonicalCompositeOperationKind[]}):CanonicalPreparedResourceUpdate {
        this.assertMutationIdle();
        if(!this.workspace||!this.limits)throw new Error('Composite program owner unavailable');
        const owner=this,epoch=this.workspace,limits=this.limits,oldPrograms=epoch.programs;
        let releaseStage:()=>void=noMetadataRelease,releasePrograms:()=>void=noMetadataRelease,releaseLease:()=>void=noMetadataRelease;
        let state:'pending'|'published'|'cancelled'='pending',checking=false,checked=false,cleaned=false,update:CanonicalPreparedResourceUpdate|undefined;
        let nextPrograms:Map<CompositeProgramKey,ProgramInfo>|undefined,nextLimits:CanonicalCompositeLimits|undefined;
        const created:ProgramInfo[]=[];
        let transferred=false,vertex:WebGLShader|null=null,restore:()=>void=noMetadataRelease,failed=false,primary:unknown;
        const attempt=(f:()=>void)=>{try{f()}catch(error){if(!failed){failed=true;primary=error}}};
        const owned=()=>{if(owner.workspace!==epoch||owner.limits!==limits||epoch.programs!==oldPrograms||owner.batch||!owner.busy||owner.companionUpdate!==update)throw new Error('Composite program preparation changed')};
        const pure=()=>{if(state!=='pending'||owner.companionUpdate!==update||owner.workspace!==epoch||owner.limits!==limits||epoch.programs!==oldPrograms||owner.batch||owner.busy)throw new Error('Composite program update changed')};
        this.busy=true;
        try{
            releaseStage=this.cpu.reserve(4096);owned();
            let additions:readonly Readonly<{key:CompositeProgramKey;operation:CanonicalCompositeOperationKind;law?:CanonicalPrimaryGrainProgram['law'];imageMaterial?:true;atlasMode?:SourceScalarPowerMode;tableMode?:SourceTableCompositeMode;capturedMode?:SourceCapturedCompositeMode}>[];
            let updatedLimits:CanonicalCompositeLimits;
            if(request.kind==='captured'){
                if(!isSourceCapturedCompositeMode(request.mode))throw new TypeError('Unknown captured composite mode');
                additions=this.scalarProgramBases(request.styles).map(base=>({key:capturedProgram(request.mode,base),operation:'genericSCU8' as const,capturedMode:request.mode,imageMaterial:base===imageMaterialProgram('genericSCU8')?true:undefined,law:base===primaryGrainProgram('pixel-texture-u8-v1','genericSCU8')?'pixel-texture-u8-v1' as const:base===primaryGrainProgram('pixel-color-texture-v1','genericSCU8')?'pixel-color-texture-v1' as const:undefined}));updatedLimits=limits;
            }else if(request.kind==='atlas'){
                this.scalarAtlas.resource(request.mode);
                additions=this.scalarProgramBases(request.styles).map(base=>({key:`scalar-power:${request.mode}:${base}` as CompositeProgramKey,operation:'genericSCU8' as const,atlasMode:request.mode,imageMaterial:base===imageMaterialProgram('genericSCU8')?true:undefined,law:base===primaryGrainProgram('pixel-texture-u8-v1','genericSCU8')?'pixel-texture-u8-v1' as const:base===primaryGrainProgram('pixel-color-texture-v1','genericSCU8')?'pixel-color-texture-v1' as const:undefined}));
                updatedLimits=limits;
            }else if(request.kind==='grain'){
                const wanted=primaryGrainProgramsFor({...limits,primaryGrainPrograms:request.requested}),inventory=new Map(primaryGrainProgramsFor(limits).map(p=>[primaryGrainProgram(p.law,p.operation),p]));
                for(const item of wanted)inventory.set(primaryGrainProgram(item.law,item.operation),item);
                const all=primaryGrainProgramsFor({...limits,primaryGrainPrograms:[...inventory.values()]});
                additions=all.map(p=>({key:primaryGrainProgram(p.law,p.operation),operation:p.operation,law:p.law}));updatedLimits={...limits,primaryGrainPrograms:all};
            }else if(request.kind==='image'){
                const wanted=imageMaterialOperationsFor({...limits,imageMaterialOperations:request.requested});
                const all=imageMaterialOperationsFor({...limits,imageMaterialOperations:[...new Set([...imageMaterialOperationsFor(limits),...wanted])]});
                additions=all.map(operation=>({key:imageMaterialProgram(operation),operation,imageMaterial:true}));
                updatedLimits={...limits,imageMaterialOperations:all};
            }else{
                if(!Array.isArray(request.requested)||request.requested.length>12||request.requested.some(k=>k!=='colorHsyBrowser'&&!operationsFor(limits).includes(k)))throw new RangeError('Unsupported operation addition');
                const operations=operationsFor({...limits,operations:[...new Set([...operationsFor(limits),...request.requested])]});
                additions=operations.map(operation=>({key:operation,operation}));updatedLimits={...limits,operations};
            }
            additions=additions.flatMap(item=>item.operation==='genericSCU8'&&!item.atlasMode&&!item.capturedMode?[item,...SOURCE_TABLE_COMPOSITE_MODES.map(tableMode=>({...item,key:`table-composite:${tableMode}:${item.key}` as CompositeProgramKey,tableMode}))]:[item]);
            const missing=additions.filter(p=>!oldPrograms.has(p.key));
            releaseLease=this.cache.leaseRequired([...this.preparedResources(),...this.companions]);owned();
            if(missing.length)releasePrograms=this.cpu.reserve(missing.length*PROGRAM_CPU_BYTES);owned();
            nextPrograms=new Map(oldPrograms);nextLimits=Object.freeze(updatedLimits);
            if(missing.length){
                restore=saveBrushGlState(this.gl,[],this.instancing,this.vertexArrays,3);
                vertex=this.gl.createShader(this.gl.VERTEX_SHADER);if(!vertex)throw new Error('Composite update vertex allocation failed');
                this.gl.shaderSource(vertex,VERTEX);this.gl.compileShader(vertex);if(!this.gl.getShaderParameter(vertex,this.gl.COMPILE_STATUS))throw new Error('Composite update vertex compile failed: '+this.gl.getShaderInfoLog(vertex));owned();
                for(const item of missing){const info=this.compile(item.operation,vertex,item.imageMaterial?'lightness':item.law===undefined?undefined:item.law==='pixel-color-texture-v1'?'color':item.law==='pixel-texture-u8-v1'?'pixel':'multiply',item.atlasMode,item.tableMode,item.capturedMode);created.push(info);owned();nextPrograms.set(item.key,info)}
            }
            owned();
        }catch(error){failed=true;primary=error}
        finally{
            if(vertex){const shader=vertex;vertex=null;attempt(()=>this.gl.deleteShader(shader))}
            attempt(restore);attempt(releaseLease);this.busy=false;
        }
        const disposeUnpublished=()=>{if(transferred)return;transferred=true;let bad=false,error:unknown;for(const info of created)try{if(!this.gl.isContextLost())this.gl.deleteProgram(info.program)}catch(e){if(!bad){bad=true;error=e}}const release=releasePrograms;releasePrograms=noMetadataRelease;try{release()}catch(e){if(!bad){bad=true;error=e}}if(bad)throw error};
        if(failed){attempt(disposeUnpublished);attempt(releaseStage);throw primary}
        const ticket:CanonicalPreparedResourceUpdate=Object.freeze({
            get status(){return state},
            assertCurrent(){if(this!==ticket||checking)throw new Error('Composite program assertion reentry');pure();checking=true;checked=false;try{if(!owner.isReady())throw new Error('Composite workspace retired');for(const r of [...owner.preparedResources(),...owner.companions])if(owner.cache.resourceBytes(r.key)!==r.bytes||!owner.cache.get(r.key))throw new Error('Composite source group retired');pure();checked=true}finally{checking=false}},
            publish(){if(this!==ticket||checking||!checked||!nextPrograms||!nextLimits)throw new Error('Composite program publication not checked');pure();if(created.length){const releaseOld=owner.releaseCpu,releaseNew=releasePrograms;releasePrograms=noMetadataRelease;owner.releaseCpu=()=>{let bad=false,error:unknown;try{releaseOld?.()}catch(e){bad=true;error=e}try{releaseNew()}catch(e){if(!bad){bad=true;error=e}}if(bad)throw error};owner.reservedCpuBytes+=created.length*PROGRAM_CPU_BYTES;}epoch.programs=nextPrograms;owner.limits=nextLimits;nextPrograms=undefined;nextLimits=undefined;transferred=true;state='published';return undefined},
            finalizeCleanup(){if(this!==ticket||checking||state==='pending')throw new Error('Composite program cleanup unavailable');if(cleaned)return undefined;cleaned=true;if(owner.companionUpdate===ticket)owner.companionUpdate=undefined;const release=releaseStage;releaseStage=noMetadataRelease;release();return undefined},
            cancel(){if(this!==ticket||checking||owner.busy)throw new Error('Composite program cancel unavailable');if(state!=='pending')return undefined;state='cancelled';if(owner.companionUpdate===ticket)owner.companionUpdate=undefined;nextPrograms=undefined;nextLimits=undefined;let bad=false,error:unknown;try{disposeUnpublished()}catch(e){bad=true;error=e}const release=releaseStage;releaseStage=noMetadataRelease;try{release()}catch(e){if(!bad){bad=true;error=e}}if(bad)throw error;return undefined},
        });
        update=ticket;
        try{if(this.companionUpdate||this.workspace!==epoch||this.limits!==limits||epoch.programs!==oldPrograms||this.batch||this.busy)throw new Error('Composite program owner changed');this.companionUpdate=ticket;ticket.assertCurrent();return ticket}catch(primary){try{ticket.cancel()}catch{}throw primary}
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
            if((texturedOperationsFor(limits).length||primaryGrainProgramsFor(limits).length)&&(!whole(precision.rangeMax,24)||!whole(precision.rangeMin,14)))throw new RangeError('Unverified textured composite precision range')
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
        const operations = operationsFor(limits),texturedOperations=texturedOperationsFor(limits),primaryGrainPrograms=primaryGrainProgramsFor(limits),imageMaterialOperations=imageMaterialOperationsFor(limits);
        if(this.limits){
            if(this.limits.width!==limits.width||this.limits.height!==limits.height||operations.join(',')!==operationsFor(this.limits).join(',')||texturedOperations.join(',')!==texturedOperationsFor(this.limits).join(',')||primaryGrainPrograms.map(p=>primaryGrainProgram(p.law,p.operation)).join()!==primaryGrainProgramsFor(this.limits).map(p=>primaryGrainProgram(p.law,p.operation)).join()||imageMaterialOperations.join(',')!==imageMaterialOperationsFor(this.limits).join(',')||!this.isReady())throw new Error('Reset composite pass before changing capacity/residency')
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
        if((texturedOperations.length||primaryGrainPrograms.length)&&(!whole(precision.rangeMax,24)||!whole(precision.rangeMin,14)))throw new RangeError('Unverified textured composite precision range');
        if (this.cache.resourceBytes(this.key) !== undefined)
            throw new Error('Canonical composite resource scope is already owned');
        const textureStorage=reserveContextStorage(this.gl,limits.width*limits.height*4,'brush-texture-rgba-equivalent');
        let bufferStorage:StorageReservation;
        try{bufferStorage=reserveContextStorage(this.gl,VBO_BYTES,'brush-buffer')}catch(error){releaseStorageReservation(textureStorage);throw error}
        let releaseCpu=()=>{},restore=()=>{},retainedCpu=false,failed=false,failure:unknown,cancelled=false;
        const loose:(OwnedBrushResource|OwnedBrushBuffer)[]=[],programs=new Map<CompositeProgramKey,ProgramInfo>();
        let vao:WebGLVertexArrayObjectOES|null=null,auxTransferred=false,vertex:WebGLShader|null=null;
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
            // One unpublished shader belongs to this exact cold transaction.
            // Every program still links/checks its own fragment and interface.
            vertex=gl.createShader(gl.VERTEX_SHADER);
            if(!vertex)throw new Error('Composite vertex shader allocation failed');
            gl.shaderSource(vertex,VERTEX);gl.compileShader(vertex);
            if(!gl.getShaderParameter(vertex,gl.COMPILE_STATUS))throw new Error('Composite shader compile failed: '+gl.getShaderInfoLog(vertex));
            const addPrograms=(key:CompositeProgramKey,kind:CanonicalCompositeOperationKind,style:boolean|'multiply'|'pixel'|'color'|'lightness'=false)=>{
                programs.set(key,this.compile(kind,vertex!,style));
                if(kind==='genericSCU8')for(const tableMode of SOURCE_TABLE_COMPOSITE_MODES)programs.set(`table-composite:${tableMode}:${key}`,this.compile(kind,vertex!,style,undefined,tableMode));
            };
            for(const kind of operations)addPrograms(kind,kind);
            for(const kind of texturedOperations)addPrograms(texturedProgram(kind),kind,true);
            for(const p of primaryGrainPrograms)addPrograms(primaryGrainProgram(p.law,p.operation),p.operation,p.law==='pixel-color-texture-v1'?'color':p.law==='pixel-texture-u8-v1'?'pixel':'multiply');
            for(const kind of imageMaterialOperations)addPrograms(imageMaterialProgram(kind),kind,'lightness');
            // Cleanup failure is fatal BEFORE workspace/program publication.
            const completedVertex=vertex;vertex=null;gl.deleteShader(completedVertex);
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
            this.limits={...limits,operations,texturedOperations,primaryGrainPrograms,imageMaterialOperations};this.companions=[...group].map(([key,bytes])=>({key,bytes}));
            this.releaseCpu=releaseCpu;this.reservedCpuBytes=budget.cpuBytes;retainedCpu=true;cancelled=!!signal?.aborted;
        }catch(error){failed=true;failure=error}
        finally{
            if(vertex){const unpublishedVertex=vertex;vertex=null;attempt(()=>this.gl.deleteShader(unpublishedVertex))}
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
    /** Pure prepared-program evidence, never implicit shader compilation. */
    supportsImageMaterialOperations(operations:readonly CanonicalCompositeOperationKind[]):boolean {
        try{return this.isReady()&&operations.every(kind=>this.workspace!.programs.has(imageMaterialProgram(kind)))}catch{return false}
    }
    /** Captured inventory DATA only; residency/authority must still be checked. */
    preparedPrimaryGrainPrograms():readonly CanonicalPrimaryGrainProgram[]{
        if(!this.workspace||!this.limits)throw new Error('Composite program inventory unavailable');
        return this.limits.primaryGrainPrograms??NO_PRIMARY_GRAIN_PROGRAMS;
    }
    /** Captured published inventory; pending transactions never alter this DATA. */
    preparedImageMaterialOperations():readonly CanonicalCompositeOperationKind[]{
        if(!this.workspace||!this.limits)throw new Error('Composite image material inventory unavailable');
        return Object.freeze([...imageMaterialOperationsFor(this.limits)]);
    }
    supportsPrimaryGrainPrograms(programs:readonly CanonicalPrimaryGrainProgram[]):boolean {
        try{return this.isReady()&&primaryGrainProgramsFor({width:1,height:1,operations:this.limits!.operations,primaryGrainPrograms:programs}).every(p=>this.workspace!.programs.has(primaryGrainProgram(p.law,p.operation)))}
        catch{return false}
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
    /** Internal pure metadata barrier; no GL state query or dummy batch. */
    assertMutationIdle(expectedEpoch?:object):void {
        if(this.batch||this.busy||this.companionUpdate)throw new Error('Composite mutation scope is active');
        if(expectedEpoch!==undefined&&(!this.workspace||this.workspace!==expectedEpoch||!this.limits||this.cache.get(this.key)!==this.workspace.texture))throw new Error('Composite preparation changed');
        assertBrushGlMutationIdle(this.gl);
    }
    brushGlBatchInfo(): BrushGlBatchInfo {return this.batchInfoFor()}
    private batchInfoFor(modes:readonly SourceScalarPowerMode[]=[]):BrushGlBatchInfo {
        if (!this.isReady() || !this.workspace) throw new Error('Composite pass is not prepared');
        return { gl: this.gl, cache: this.cache, cpu: this.cpu, contextOwner:this.contextOwner, epoch: this.workspace,
            // Programs share physical attribute slots. Batch bounds apply to
            // those slots, not the number of prepared blend/style variants.
            attributes: [...new Set([...this.workspace.programs.values()].map(info => info.attribute))], instancing: this.instancing, vertexArrays: this.vertexArrays,
            ownedPointSamplers:modes.map(mode=>({...this.scalarAtlas.sampler(mode),epoch:this.workspace!})),
            textureUnits:modes.length?5:[...this.workspace.programs.keys()].some(k=>k.includes('pixel-color-texture-v1'))?4:3,
            resources: [...this.companions, ...this.preparedResources(),...modes.flatMap(mode=>this.scalarAtlasResources(mode))] };
    }
    enterBrushGlBatch(frame: BrushGlBatchFrame): () => void {return this.enterBatch(frame,this)}
    private enterBatch(frame:BrushGlBatchFrame,participant:BrushGlBatchParticipant):()=>void {
        frame.acceptParticipant(participant);
        if (this.batch || this.busy) throw new Error('Composite pass already has an active batch/draw');
        this.batch = frame;
        return () => { if (this.batch === frame) this.batch = undefined; };
    }
    drawSource(request: CanonicalCompositeRequest, frame?: BrushGlBatchFrame): 'painted' | 'empty' {return this.drawSourceCore(request,frame,this)}
    private drawSourceCore(request:CanonicalCompositeRequest,frame:BrushGlBatchFrame|undefined,participant:BrushGlBatchParticipant,modes:readonly SourceScalarPowerMode[]=[]):'painted'|'empty'{
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
        const pattern=source.kind==='texturedMaskRgb'||source.kind==='primaryGrainMaskRgb'?this.validatePattern(source):undefined;
        const sampled = this.validateSource(source);
        this.validateTarget(target);
        if (base !== target) this.validateTarget(base);
        this.validateOperation(operation);
        if (base.width !== target.width || base.height !== target.height || base.originX !== target.originX || base.originY !== target.originY)
            throw new RangeError('Immutable destination geometry must match the output target');
        if (!this.isReady() || !this.workspace || !this.limits)
            throw new Error('Composite pass is not prepared');
        if(source.kind==='primaryGrainMaskRgb'&&source.pin.law==='hard-multiply-u8-native-v1'&&operation.kind!=='over32FusedScalar')throw new RangeError('Unsupported multiply operation');
        const baseProgram=source.kind==='imageMaterialRgba'?imageMaterialProgram(operation.kind):source.kind==='primaryGrainMaskRgb'?primaryGrainProgram(source.pin.law,operation.kind):pattern?texturedProgram(operation.kind):operation.kind;
        const atlasMode=operation.kind==='genericSCU8'&&isSourceScalarPowerMode(operation.control.mode)?operation.control.mode:undefined;
        const atlas=atlasMode?this.scalarAtlas.resource(atlasMode):undefined;
        if(frame&&atlasMode!==undefined&&!modes.includes(atlasMode))throw new Error('Scalar composite operation scope differs');
        const tableMode=operation.kind==='genericSCU8'&&isSourceTableCompositeMode(operation.control.mode)?operation.control.mode:undefined;
        const captured=operation.kind==='genericSCU8'&&!atlasMode?this.workspace.programs.get(capturedProgram(operation.control.mode,baseProgram)):undefined;
        const info=captured??this.workspace.programs.get(atlasMode?`scalar-power:${atlasMode}:${baseProgram}`:tableMode?`table-composite:${tableMode}:${baseProgram}`:baseProgram);
        if(pattern&&!isTexturedOperation(operation.kind)&&!(source.kind==='primaryGrainMaskRgb'&&(source.pin.law==='pixel-texture-u8-v1'||source.pin.law==='pixel-color-texture-v1')&&(operation.kind==='erase32FusedScalar'||operation.kind==='genericSCU8'||operation.kind==='colorHsyBrowser')))throw new RangeError('Unsupported textured composite operation');
        if (!info)
            throw new Error('Composite operation was not prepared');
        if (target.texture === sampled.texture || target.texture === this.workspace.texture || sampled.texture === this.workspace.texture || base.texture === this.workspace.texture)
            throw new RangeError('Composite framebuffer feedback alias');
        if(pattern&&(pattern.view.texture===target.texture||pattern.view.texture===base.texture||pattern.view.texture===this.workspace.texture||pattern.view.texture===sampled.texture))throw new RangeError('Composite pattern feedback alias');
        const gradient=source.kind==='primaryGrainMaskRgb'?source.gradient:undefined;
        if(gradient&&(gradient.texture===target.texture||gradient.texture===base.texture||gradient.texture===sampled.texture||gradient.texture===this.workspace.texture))throw new RangeError('Composite gradient feedback alias');
        const resources = [...atlas?[{key:atlas.key,bytes:atlas.bytes}]:[],...gradient?[{key:gradient.key,bytes:1024}]:[],...this.companions, ...this.preparedResources(),...pattern?[{key:pattern.view.key,bytes:pattern.view.width*pattern.view.height*4}]:[]];
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
        const declaredOwners = [...frame&&gradient?[canonicalPatternResourceLifetime(gradient,{gl:this.gl,cache:this.cache,cpu:this.cpu})]:[],target.lifetime, ...base === target ? [] : [base.lifetime], ...sampled.residency.kind === 'external' ? [sampled.residency] : [], ...frame&&pattern ? [canonicalPatternResourceLifetime(pattern.view,{gl:this.gl,cache:this.cache,cpu:this.cpu})] : []];
        const clip = this.clip(sampled.rect, target, bounds);
        if (!clip) {
            frame?.assert(participant, resources, declaredOwners);
            frame?.beginDraw();
            return 'empty';
        }
        if (clip.width > this.limits.width || clip.height > this.limits.height)
            throw new RangeError('Composite clip exceeds prepared capacity');
        frame?.assert(participant, resources, declaredOwners);
        frame?.beginDraw();
        this.cache.protect([...unique.keys()]);
        const release = frame ? () => {} : this.cache.lease([...unique].map(([key, bytes]) => ({ key, bytes })));
        const gl = this.gl, work = this.workspace, restore = frame ? () => {} : saveBrushGlState(gl, [info.attribute], this.instancing, this.vertexArrays, atlas?5:source.kind==='primaryGrainMaskRgb'&&source.gradient?4:pattern?3:2), releases: (() => void)[] = [];
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
            setGlColorMask(gl,true, true, true, true);
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
            if(source.kind==='primaryGrainMaskRgb'&&source.gradient){gl.activeTexture(gl.TEXTURE0+3);gl.bindTexture(gl.TEXTURE_2D,source.gradient.texture);restoreSamplings.push(frame?frame.pointSampling(source.gradient.texture):this.pointSampling(source.gradient.texture,gl.TEXTURE0+3));}
            if(atlas){gl.activeTexture(gl.TEXTURE0+4);gl.bindTexture(gl.TEXTURE_2D,atlas.texture);restoreSamplings.push(frame?frame.pointSampling(atlas.texture):this.pointSampling(atlas.texture,gl.TEXTURE0+4));}
            const u = info.uniforms;
            if(atlas)gl.uniform1i(u.scalarPowerTexture,4);
            const materialRGBA=source.kind!=='straightRgba8'&&source.view.materialRGBA;
            const spatialRGBA=source.kind!=='straightRgba8'&&source.view.spatialRGBA;
            const bitmapColor=spatialRGBA||materialRGBA||source.kind==='imageMaterialRgba'&&source.material==='color-stamp-v1'||source.kind==='primaryGrainMaskRgb'&&source.imageMaterial?.kind==='color-stamp-v1';
            gl.uniform1f(u.pigmentAlpha,source.kind==='straightRgba8'||bitmapColor?255:source.pigmentAlphaU8??255);
            gl.uniform1f(u.sourceAlphaChannel,spatialRGBA||materialRGBA||source.kind==='straightRgba8'||source.kind==='imageMaterialRgba'||source.kind==='primaryGrainMaskRgb'&&source.imageMaterial?1:0);
            const parameters=source.kind==='straightRgba8'?undefined:source.view.materialParams;gl.uniform3f(u.sharpness,parameters?.sharpnessThreshold??0,(parameters?.sharpnessSoftness??0)/100,parameters?.sharpnessChecked?1:0);
            if(source.kind==='primaryGrainMaskRgb'&&(source.pin.law==='pixel-texture-u8-v1'||source.pin.law==='pixel-color-texture-v1')){const m=source.imageMaterial;gl.uniform3f(u.lightnessMaterial,spatialRGBA||materialRGBA?2:m?(m.kind==='lightness-map-v1'?1:2):0,m?.strength??0,m?.foregroundAlpha??1);}
            if(source.kind==='imageMaterialRgba')gl.uniform3f(u.lightnessMaterial,source.material==='lightness-map-v1'?1:2,source.strength,source.foregroundAlpha);
            gl.uniform1i(u.sourceTexture, 0);
            gl.uniform1i(u.destinationTexture, 1);
            if(pattern){
                const phaseX=canonicalPrimaryTextureCell(sampled.rect.x+clip.maskX,pattern.pin.periodX,pattern.phaseX);
                const phaseY=canonicalPrimaryTextureCell(sampled.rect.y+clip.maskY,pattern.pin.periodY,pattern.phaseY);
                gl.uniform1i(u.patternTexture,2);gl.uniform2f(u.patternPhase,phaseX,phaseY);
                gl.uniform2f(u.patternPeriod,pattern.pin.periodX,pattern.pin.periodY);
                gl.uniform1f(u.patternSide,pattern.view.width);gl.uniform1f(u.patternStrength,pattern.strengthU8);
                if(pattern.pin.law==='pixel-color-texture-v1'&&source.kind==='primaryGrainMaskRgb'){gl.uniform1f(u.textureColorMode,pattern.pin.mode==='lightness'?1:2);gl.uniform1f(u.textureColorStrength,source.textureColorStrength!);gl.uniform1i(u.gradientTexture,3);}
                if(pattern.pin.law==='pixel-texture-u8-v1')gl.uniform2f(u.patternLaw,canonicalMaskingBlendModes.indexOf(pattern.pin.mode),pattern.pin.soft?1:0);
            }
            gl.uniform4f(u.clipRect, clip.x, clip.y, clip.width, clip.height);
            gl.uniform4f(u.sourceGeometry, clip.maskX, clip.maskY, sampled.rect.width, sampled.rect.height);
            gl.uniform4f(u.sourceBounds, sampled.bounds.x, sampled.bounds.y, sampled.bounds.width, sampled.bounds.height);
            gl.uniform2f(u.mirrorFlags, +sampled.mirror.horizontal, +sampled.mirror.vertical);
            gl.uniform2f(u.sourcePolicy, source.kind === 'straightRgba8'||spatialRGBA||materialRGBA ? 1 : 0, sampled.rowOrder === 'bottomAtV0' ? 1 : 0);
            gl.uniform2f(u.scratchSize, this.limits.width, this.limits.height);
            gl.uniform3f(u.pigment, ...source.kind !== 'straightRgba8' ? source.rgb : [0, 0, 0] as [
                number,
                number,
                number
            ]);
            const c = operation.kind==='maskingAlpha'?{opacity:1,mask:undefined}:operation.control;
            if(operation.kind==='maskingAlpha'){gl.uniform4f(u.controls,CANONICAL_DUAL_MASKING_MODES.indexOf(operation.control.mode),0,0,0);}
            else if(operation.kind==='colorHsyBrowser'){
                const prepared=canonicalizeSourceBrowserHsyControl(operation.control);
                gl.uniform4f(u.controls,prepared.opacity,prepared.average,prepared.flow,prepared.mask);gl.uniform2f(u.policy,prepared.mode,+prepared.hasMask);
            } else if (operation.kind === 'colorHsyInstalled') {
                const prepared = canonicalizeSourceInstalledHsyControl(operation.control);
                gl.uniform4f(u.controls, prepared.opacity, prepared.average, prepared.flow, prepared.mask);
                gl.uniform2f(u.policy, prepared.mode, +prepared.hasMask);
                gl.uniform1i(u.sourceHsyStageLimit, prepared.stageLimit);
            } else if (operation.kind === 'genericSCU8') {
                const prepared = canonicalizeSourceRgba8Control(operation.control);
                gl.uniform4f(u.controls, prepared.opacity, prepared.average, prepared.flow, prepared.mask);
                gl.uniform4f(u.policy,prepared.mode,+prepared.hasMask,+prepared.flowIsOne,+(prepared.rawAlphaDarkenHard===true));
                if(operation.control.mode==='dissolve'){
                  gl.uniform4f(u.sourceDissolveSeed,...sourceDissolveUint32Bytes(operation.control.seed!));
                  gl.uniform4f(u.sourceDissolveOriginX,...sourceDissolveUint32Bytes(target.originX>>>0));
                  gl.uniform4f(u.sourceDissolveOriginY,...sourceDissolveUint32Bytes(target.originY>>>0));
                  gl.uniform1f(u.sourceDissolveTargetHeight,target.height);
                }
            } else if (operation.kind === 'alphaDarken32FusedScalar') {
                const prepared = prepareSourceFusedAlphaDarken32ScalarControls(operation.control.variant, operation.control, c.mask);
                gl.uniform4f(u.controls, ...prepared.values);
                gl.uniform2f(u.policy, ...prepared.selection);
                gl.uniform3f(u.opacityParts, ...prepared.opacityParts);
                gl.uniform3f(u.flowParts, ...prepared.flowParts);
            } else if (operation.kind === 'over32FusedScalar'||operation.kind==='erase32FusedScalar') {
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
        try{this.scalarAtlas.reset(lost)}catch(error){if(!failed){failed=true;primary=error}}
        try{this.cache.discard(this.key,lost)}catch(error){if(!failed){failed=true;primary=error}}
        this.workspace=undefined;this.limits=undefined;this.companions=[];this.scalarParticipants.clear();
        const releaseMetadata=this.releaseCompanionMetadata;this.releaseCompanionMetadata=undefined
        try{releaseMetadata?.()}catch(error){if(!failed){failed=true;primary=error}}
        try{this.releaseCpu?.()}catch(error){if(!failed){failed=true;primary=error}}
        this.releaseCpu=undefined;this.reservedCpuBytes=0;this.instancing=null;this.vertexArrays=null;
        if(failed)throw primary;
    }

    private validatePattern(source:Extract<CanonicalCompositeSource,{kind:'texturedMaskRgb'|'primaryGrainMaskRgb'}>):{view:CanonicalPatternResource;pin:CanonicalPrimaryTexturePin|CanonicalFixedPrimaryTexturePin|CanonicalPressureCurvePrimaryTexturePin|CanonicalRecordedPrimaryTexturePin|CanonicalMultiplyPrimaryTexturePin|CanonicalPixelPrimaryTexturePin|CanonicalPixelColorTexturePin;strengthU8:number;phaseX:number;phaseY:number} {
        const view=source.pattern;
        assertCanonicalPatternResourceCurrent(view,{gl:this.gl,cache:this.cache,cpu:this.cpu});
        const strength=Object.getOwnPropertyDescriptor(source.pin,'strength');
        if(!strength||!Object.hasOwn(strength,'value'))throw new TypeError('Invalid textured strength pin');
        const law=Object.getOwnPropertyDescriptor(source.pin,'law');
        const pin=source.kind==='primaryGrainMaskRgb'?(law&&Object.hasOwn(law,'value')&&law.value==='pixel-color-texture-v1'?(view.alphaAsset?canonicalPixelColorTexturePin(source.pin,view.asset,view.alphaAsset):(()=>{throw new TypeError('Color pattern alpha missing')})()):law&&Object.hasOwn(law,'value')&&law.value==='pixel-texture-u8-v1'?canonicalPixelPrimaryTexturePin(source.pin,view.asset):canonicalMultiplyPrimaryTexturePin(source.pin,view.asset)):strength.value==='recorded-grain-v1'?canonicalRecordedPrimaryTexturePin(source.pin,view.asset):strength.value==='source-pressure-curve-v1'?canonicalPressureCurvePrimaryTexturePin(source.pin,[view.asset]):strength.value==='fixed-one-v1'?canonicalFixedPrimaryTexturePin(source.pin,view.asset):canonicalPrimaryTexturePin(source.pin,view.asset),side=view.width,strengthU8=source.strengthU8??0;
        if(pin.law==='pixel-color-texture-v1'){if(source.kind!=='primaryGrainMaskRgb'||source.strengthU8!==undefined||!Number.isFinite(source.textureColorStrength)||source.textureColorStrength!<0||(pin.mode==='lightness'?source.textureColorStrength!>1:!whole(source.textureColorStrength!)||source.textureColorStrength!>255))throw new TypeError('Invalid recorded color texture strength');if(pin.mode==='gradient'){if(!source.gradient||!pin.gradient)throw new TypeError('Captured gradient resource required');assertCanonicalPatternResourceCurrent(source.gradient,{gl:this.gl,cache:this.cache,cpu:this.cpu});if(JSON.stringify(source.gradient.gradient)!==JSON.stringify(pin.gradient))throw new TypeError('Gradient original resource changed')}else if(source.gradient)throw new TypeError('Unexpected gradient resource')}else if(source.kind==='primaryGrainMaskRgb'&&(!whole(source.strengthU8!)||source.strengthU8!<0||source.strengthU8!>255||source.textureColorStrength!==undefined||source.gradient))throw new TypeError('Unexpected color texture controls');
        if(pin.strength==='fixed-one-v1'&&strengthU8!==255)throw new RangeError('Fixed texture requires S255');
        if(!whole(side,1)||side>4096||(side&(side-1))!==0||view.height!==side||!whole(strengthU8)||Object.is(strengthU8,-0)||strengthU8>255)throw new RangeError('Invalid textured composite source');
        return {view,pin,strengthU8,phaseX:pin.strength==='recorded-grain-v1'?pin.phase.x:pin.offsetX,phaseY:pin.strength==='recorded-grain-v1'?pin.phase.y:pin.offsetY};
    }
    private validateSource(source: CanonicalCompositeSource): {
        texture: WebGLTexture;
        rect: TransformedMaskView['rect'];
        bounds: CanonicalUvBounds;
        mirror: TransformedMaskView['mirror'];
        rowOrder: 'topAtV0' | 'bottomAtV0';
        residency: CanonicalSourceResidency;
    } {
        if(source.pigmentAlphaU8!==undefined&&(!whole(source.pigmentAlphaU8)||Object.is(source.pigmentAlphaU8,-0)||source.pigmentAlphaU8>255||source.kind==='straightRgba8'))throw new RangeError('Invalid source pigment alpha');
        const view = source.view;
        if (!view || !rectValid(view.rect) || view.rect.width > 4096 || view.rect.height > 4096 || !view.texture
            || !view.bounds || ![view.bounds.x, view.bounds.y, view.bounds.width, view.bounds.height].every(Number.isFinite)
            || view.bounds.x < 0 || view.bounds.y < 0 || view.bounds.width <= 0 || view.bounds.height <= 0 || view.bounds.x + view.bounds.width > 1 || view.bounds.y + view.bounds.height > 1
            || !view.mirror || typeof view.mirror.horizontal !== 'boolean' || typeof view.mirror.vertical !== 'boolean')
            throw new RangeError('Invalid composite source view');
        if (source.kind === 'maskRgb'||source.kind==='texturedMaskRgb'||source.kind==='primaryGrainMaskRgb'||source.kind==='imageMaterialRgba') {
            const mask = source.view;
            if(source.kind==='primaryGrainMaskRgb'&&source.imageMaterial?.kind==='gradient-map-v1'&&!mask.materialRGBA&&!mask.spatialRGBA||source.kind==='imageMaterialRgba'&&source.material==='gradient-map-v1'&&!mask.materialRGBA)throw new RangeError('Gradient material must be resolved by its prepared pass');
            if(source.kind==='primaryGrainMaskRgb'&&source.imageMaterial){const m=source.imageMaterial;if((source.pin.law!=='pixel-texture-u8-v1'&&source.pin.law!=='pixel-color-texture-v1')||!mask.spatialRGBA&&!mask.materialRGBA&&mask.imageMaterial!==m.kind||!Number.isFinite(m.strength)||m.strength<0||m.strength>1||!Number.isFinite(m.foregroundAlpha)||m.foregroundAlpha<0||m.foregroundAlpha>1)throw new RangeError('Invalid grain image material');}
            if(source.kind==='imageMaterialRgba'&&(mask.imageMaterial!==source.material||!Number.isFinite(source.strength)||source.strength<0||source.strength>1||!Number.isFinite(source.foregroundAlpha)||source.foregroundAlpha<0||source.foregroundAlpha>1))throw new RangeError('Invalid lightness material source');
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
        if(operation.kind==='maskingAlpha'){if(!CANONICAL_DUAL_MASKING_MODES.includes(operation.control.mode))throw new RangeError('Unsupported masking blend');return;}
        const c = operation.control;
        if (!c || !Number.isFinite(c.opacity) || c.opacity < 0 || c.opacity > 1 || c.mask !== undefined && (!whole(c.mask) || c.mask > 255))
            throw new RangeError('Invalid composite controls');
        if(operation.kind==='colorHsyBrowser'){canonicalizeSourceBrowserHsyControl(operation.control);}
        else if (operation.kind === 'colorHsyInstalled') {
            canonicalizeSourceInstalledHsyControl(operation.control);
        } else if (operation.kind === 'genericSCU8') {
            if (operation.control.profile !== SOURCE_RGBA8_GENERIC_SC_PROFILE
                || !SOURCE_RGBA8_GENERIC_SC_MODES.includes(operation.control.mode))
                throw new RangeError('Invalid GenericSC U8 profile or mode');
            validateRgba8CompositeControl(operation.control);
        } else if (operation.kind === 'alphaDarken32' || operation.kind === 'alphaDarken32FusedScalar'||operation.kind==='alphaDarkenBrowserFloat') {
            const a = operation.control;
            if (a.profile !== (operation.kind==='alphaDarkenBrowserFloat'?CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE:operation.kind === 'alphaDarken32' ? 'optimized32-scalar-f32-rne-v1' : 'installed-arm64-scalar-fused-fpcr0-v1') || !['creamy', 'hard'].includes(a.variant)
                || ![a.averageOpacity, a.flow].every(v => Number.isFinite(v) && v >= 0 && v <= 1))
                throw new RangeError('Invalid local alphaDarken32 controls');
        }
        else if (operation.kind==='overBrowserFloat'?operation.control.profile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE:(operation.kind === 'over32FusedScalar'||operation.kind==='erase32FusedScalar') ? operation.control.profile !== 'installed-arm64-scalar-fused-fpcr0-v1' : operation.kind !== 'over32' || !['portable-f32-division-rne-v1', 'optimized32-neon64-scalar-frecpe-rne-v1'].includes(operation.control.profile))
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
    private compile(kind: CanonicalCompositeOperationKind,vertex:WebGLShader,textured:boolean|'multiply'|'pixel'|'color'|'lightness'=false,atlasMode?:SourceScalarPowerMode,tableMode?:SourceTableCompositeMode,capturedMode?:SourceCapturedCompositeMode): ProgramInfo {
        const gl=this.gl;
        let fragment:WebGLShader|null=null,program:WebGLProgram|null=null,info:ProgramInfo|undefined;
        let failed=false,failure:unknown;
        const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;failure=error}}};
        try {
            fragment=gl.createShader(gl.FRAGMENT_SHADER);
            if(!fragment)throw new Error('Composite shader allocation failed');
            const fragmentSource=textured==='color'?colorTextureFragmentFor(kind):textured==='pixel'?pixelTextureFragmentFor(kind):textured==='multiply'?multiplyFragmentFor():textured==='lightness'?imageMaterialFragmentFor(kind):textured?texturedFragmentFor(kind):fragmentFor(kind);
            gl.shaderSource(fragment,atlasMode?scalarPowerFragmentVariant(fragmentSource,atlasMode):capturedMode?capturedCompositeFragmentVariant(fragmentSource,capturedMode):kind==='genericSCU8'?tableCompositeFragmentVariant(fragmentSource,tableMode):fragmentSource);
            gl.compileShader(fragment);
            if(!gl.getShaderParameter(fragment,gl.COMPILE_STATUS))throw new Error('Composite shader compile failed: '+gl.getShaderInfoLog(fragment));
            program=gl.createProgram();
            if(!program)throw new Error('Composite program allocation failed');
            gl.attachShader(program,vertex);gl.attachShader(program,fragment);
            gl.linkProgram(program);
            if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Composite link failed: '+gl.getProgramInfoLog(program));
            const attribute=gl.getAttribLocation(program,'position');
            if(attribute<0)throw new Error('Composite attribute unavailable');
            const uniforms:Record<string,WebGLUniformLocation|null>={};
            for (const name of [...atlasMode?['scalarPowerTexture']:[],'sourceTexture', 'destinationTexture', 'clipRect', 'sourceGeometry', 'sourceBounds', 'mirrorFlags', 'sourcePolicy', 'scratchSize', 'pigment','pigmentAlpha','sourceAlphaChannel', 'controls', 'policy', 'opacityParts', 'flowParts','sharpness',...kind==='genericSCU8'?['sourceDissolveSeed','sourceDissolveOriginX','sourceDissolveOriginY','sourceDissolveTargetHeight']:[], ...kind === 'colorHsyInstalled' ? ['sourceHsyStageLimit'] : [],...textured==='lightness'?['lightnessMaterial']:textured?['patternTexture','patternPhase','patternPeriod','patternSide','patternStrength',...textured==='pixel'?['patternLaw','lightnessMaterial']:textured==='color'?['lightnessMaterial','textureColorMode','textureColorStrength','gradientTexture']:[]]:[]])
                uniforms[name]=gl.getUniformLocation(program,name);
            info={program,attribute,uniforms};
        }catch(error){failed=true;failure=error}
        finally{
            // A fragment-delete exception must not discard a linked program
            // through a throwing finally after it was returned to its owner.
            if(fragment){const ownedFragment=fragment;fragment=null;attempt(()=>gl.deleteShader(ownedFragment))}
            if(failed&&program){const unpublishedProgram=program;program=null;attempt(()=>gl.deleteProgram(unpublishedProgram))}
        }
        if(failed)throw failure;
        return info!;
    }
}
