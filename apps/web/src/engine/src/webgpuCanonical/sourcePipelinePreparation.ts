import {canonicalStampRecipe} from './stamp'
import {canonicalRibbonRecipe} from './deposit'
import {canonicalCompositeRecipe} from './render'
import {canonicalRawCanvasRecipe} from './roomTileBridge'
import {canonicalBaselineFieldRecipe} from './passes/fieldOps'
import {canonicalBrushRecipe} from './brush'
import {prepareExactPipeline,type ExactPipelineRecipe} from './exactPipelinePreparation'
/** Exact baseline first contact recipes; no fields, buffers, dispatch, or publication. */
export function firstContactPipelineRecipes():ExactPipelineRecipe[]{
 const modes=['coverage','pigmentOnlymax','pigmentOnlyadd','colorOnlymax','colorOnlyadd']
 return [...modes.map(key=>canonicalStampRecipe(key)),...modes.map(key=>canonicalRibbonRecipe(key)),canonicalCompositeRecipe(),canonicalRawCanvasRecipe(),canonicalBaselineFieldRecipe(),canonicalBrushRecipe(),canonicalBrushRecipe(true)]
}
export async function prepareFirstContactPipelines(device:GPUDevice){
 const recipes=firstContactPipelineRecipes()
 return Promise.all(recipes.map(recipe=>prepareExactPipeline(device,recipe)))
}
