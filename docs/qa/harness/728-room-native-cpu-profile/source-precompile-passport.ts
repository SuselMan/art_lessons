import {createHash} from 'node:crypto'
import {firstContactPipelineRecipes} from '../../../../apps/web/src/engine/src/webgpuCanonical/sourcePipelinePreparation'
import {exactPipelineRecipeIdentity} from '../../../../apps/web/src/engine/src/webgpuCanonical/exactPipelinePreparation'
/** Derived from the same factory/WGSL source, never an injected compilation. */
export function sourcePipelinePassport(){return firstContactPipelineRecipes().map(r=>({key:r.key,kind:r.kind,shaderSHA:createHash('sha256').update(r.code).digest('hex'),descriptorSHA:createHash('sha256').update(exactPipelineRecipeIdentity(r)).digest('hex')}))}
/** Fixed before input: short round400 water then pigment uses these constructor pathways. */
export const sourceShort400RequiredKeys=['stamp:false:false:coverage','ribbon:coverage','canonicalCompositeRecipe','canonicalRawCanvasRecipe','pairedBrush','singleBrush']
