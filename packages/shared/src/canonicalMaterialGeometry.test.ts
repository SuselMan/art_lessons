import { expect, it } from 'vitest'
import { canonicalMaterialGeometryCost } from './canonicalMaterialGeometry.js'
import { buildCanonicalMaterial, type CanonicalMaterialAsset, type CanonicalMaterialContext, type CanonicalMaterialRecipe } from './canonicalMaterialCodec.js'

const asset:CanonicalMaterialAsset={id:'asset:'+'a'.repeat(64),size:8,x:2,y:3,width:3,height:5}
const recipe:CanonicalMaterialRecipe={asset:asset.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:3,height:5,mirrorH:false,mirrorV:false}
it('shares actual allocation validation and RGBA working bytes across server/client admission',()=>{
  expect(canonicalMaterialGeometryCost(recipe,asset)).toEqual({workUnits:400,outputBytes:60})
  expect(()=>canonicalMaterialGeometryCost({...recipe,width:4},asset)).toThrow(/allocation/)
  expect(()=>canonicalMaterialGeometryCost({...recipe,asset:'asset:'+'b'.repeat(64)},asset)).toThrow(/binding/)
})
it('rejects unverified sampler rows and matrix domains before any detailed row plan',()=>{
  expect(()=>canonicalMaterialGeometryCost({...recipe,ratio:.001,height:1},asset)).toThrow(/fast-matrix/)
  const wide={...asset,size:1500,x:0,y:0,width:1500,height:1}
  expect(()=>canonicalMaterialGeometryCost({...recipe,scale:1.5,width:2250,height:2},wide)).toThrow(/row capacity/)
})
it('binds the same pure preflight to closed binary operations and enforces real output bytes',()=>{
  const context:CanonicalMaterialContext={assets:[asset],primaryAsset:asset.id,preflightDefinition:canonicalMaterialGeometryCost,budget:{workUnits:400,outputBytes:60,drawPixels:15}}
  const input={masked:false,entry:{phase:'primary' as const,group:0},draws:[{recipe,role:'primary' as const,x:-2,y:3,opacity:1,flow:1}],fences:[]}
  const result=buildCanonicalMaterial(input,context)
  expect(result.frame.definitions[0]).toEqual(recipe)
  expect(result.frame.draws[0]!.x).toBe(-2)
  expect(()=>buildCanonicalMaterial(input,{...context,budget:{...context.budget,outputBytes:59}})).toThrow()
})
