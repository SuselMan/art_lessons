import {SOURCE_GREATER_WEIGHT_GLSL,SOURCE_SCALAR4_COS_GLSL} from './sourceCompositeCoefficientTables'
import {SOURCE_RGBA8_GENERIC_SC_MODES,sourceRgba8CompositeModeId,type SourceRgba8SeparableMode} from '../presets/sourceColorRgba8'
/** Large coefficient trees belong to bounded prepared variants, not every
 * ordinary scalar shader. No lookup textures or draw-time compilation. */
export const SOURCE_TABLE_COMPOSITE_MODES=['interpolation','interpolation2x','greater'] as const
export type SourceTableCompositeMode=typeof SOURCE_TABLE_COMPOSITE_MODES[number]
export function isSourceTableCompositeMode(value:unknown):value is SourceTableCompositeMode{return SOURCE_TABLE_COMPOSITE_MODES.some(mode=>mode===value)}
export function tableCompositeFragmentVariant(fragment:string,mode?:SourceTableCompositeMode):string{
 const constructor='SourceRgba8CompositeControl(policy.x,controls.x,'
 if(fragment.split(constructor).length!==2)throw new TypeError('Table composite apply provenance changed')
 if(mode!==undefined){
  if(!isSourceTableCompositeMode(mode))throw new TypeError('Unknown table composite mode')
  return fragment.replace(constructor,'SourceRgba8CompositeControl('+sourceRgba8CompositeModeId(mode)+'.0,controls.x,')
 }
 for(const table of [SOURCE_GREATER_WEIGHT_GLSL,SOURCE_SCALAR4_COS_GLSL])if(fragment.split(table).length!==2)throw new TypeError('Table composite coefficient provenance changed')
 return fragment.replace(SOURCE_GREATER_WEIGHT_GLSL,'float sourceGreaterWeight(float delta){return 0.0;}').replace(SOURCE_SCALAR4_COS_GLSL,'float sourceScalar4Cos(float v){return 0.0;}')
}

export type SourceCapturedCompositeMode=SourceRgba8SeparableMode|'add'
export function isSourceCapturedCompositeMode(value:unknown):value is SourceCapturedCompositeMode{return SOURCE_RGBA8_GENERIC_SC_MODES.some(mode=>mode===value)}
/** Capture any admitted GenericSC law before the input turn. Formula text,
 * source style, clipping and byte arithmetic are preserved exactly. */
export function capturedCompositeFragmentVariant(fragment:string,mode:SourceCapturedCompositeMode):string{
 if(!isSourceCapturedCompositeMode(mode))throw new TypeError('Unknown captured composite mode')
 const constructor='SourceRgba8CompositeControl(policy.x,controls.x,'
 if(fragment.split(constructor).length!==2)throw new TypeError('Captured composite apply provenance changed')
 return fragment.replace(constructor,'SourceRgba8CompositeControl('+sourceRgba8CompositeModeId(mode)+'.0,controls.x,')
}
