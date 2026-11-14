import {filter147} from './filterSmudge147.testFixture.js'
import type {BrushDescriptor, BrushLibrary} from './brushes.js'
export const FILTER192_MASK: `asset:${string}` = `asset:${'192a'.repeat(16)}`
export const FILTER192_FRAME: `asset:${string}` = `asset:${'192b'.repeat(16)}`
export const FILTER192_TEXTURE: `asset:${string}` = `asset:${'192c'.repeat(16)}`
export function filter192(kind: 'invert'|'desaturate'|'posterize'|'gaussian'|'unsharp' = 'invert', smudgeMode = true): BrushDescriptor {
  const b = filter147()
  b.id = 'imported-192192192192192192192192'; b.version = 192
  const policy = {maskPolicy:'native-dab-v1', sourcePolicy:'canonical-begin-v1', smudgeMode, composite:'copy'} as const
  b.filter = kind === 'invert' ? {version:2,kind,...policy} : kind === 'desaturate' ? {version:2,kind,type:3,...policy} : kind === 'posterize' ? {version:2,kind,steps:7,...policy} : {version:1,kind,radiusX:2,radiusY:2,amount:.5,threshold:0,lightnessOnly:true,spatialPolicy:kind==='gaussian'?'gaussian-halo-v1':'unsharp-lab-halo-v1',...policy}
  b.tip = {kind:'procedural',hardness:1,aspect:1.5,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'rectangle',horizontalFade:.3,verticalFade:.6,antialias:true}}
  return b
}
export function library192(b = filter192()): BrushLibrary {
  return {schemaVersion:1,assets:[FILTER192_MASK,FILTER192_FRAME,FILTER192_TEXTURE].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),skipped:[],brushes:[{name:'Filter192',source:'own192.kpp',warnings:[],descriptor:b}]}
}
