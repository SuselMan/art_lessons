import {describe,it,expect} from 'vitest'
import {isBrushLibrary,type BrushLibrary,type BrushDescriptor} from './brushes'
const genuine:BrushLibrary={"schemaVersion":1,"assets":[{"id":"asset:5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b","size":4,"file":"5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b.bin"},{"id":"asset:45c7f1880ae6dc9039d44a25e58b62420a12731d4925857e62d037660e5cf0df","size":64,"file":"45c7f1880ae6dc9039d44a25e58b62420a12731d4925857e62d037660e5cf0df.bin"}],"brushes":[{"name":"compiled93","source":"qa","warnings":[],"descriptor":{"id":"imported-91d91c5b89810ce7fea2231c","version":93,"model":"stamp","category":"paint","tip":{"kind":"round","hardness":1,"aspect":1,"rotation":"fixed","angle":0},"paperInteraction":0,"spacing":0.1,"flow":1,"flowPer":"stamp","sizeByPressure":[[0,1],[1,1]],"flowByPressure":[[0,1],[1,1]],"opacityByPressure":[[0,1],[1,1]],"pressureSmoothingPx":0,"opacity":1,"behavior":{"version":2,"speedInput":{"version":1,"space":"view","maximum":30,"estimator":"grafettoEMA30ms"},"rendering":{"mode":"buildUp","blendMode":"normal","accumulation":"directOver","wetEdges":0,"burntEdges":0,"burntEdgesMode":"multiply"}},"bristle":{"version":2,"hairs":[[-0.5,-0.5,1.0],[-0.25,-0.5,1.0],[0.0,-0.5,1.0],[0.25,-0.5,1.0],[-0.5,-0.25,1.0],[-0.25,-0.25,1.0],[0.0,-0.25,1.0],[0.25,-0.25,1.0],[-0.5,0.0,1.0],[-0.25,0.0,1.0],[0.0,0.0,1.0],[0.25,0.0,1.0],[-0.5,0.25,1.0],[-0.25,0.25,1.0],[0.0,0.25,1.0],[0.25,0.25,1.0]],"scale":2,"shear":0,"random":2,"mousePressure":false,"threshold":false,"connected":false,"antialias":false,"compositing":false,"ink":{"depletion":[0.0,0.1428571492433548,0.2857142984867096,0.4285714328289032,0.5714285969734192,0.7142857313156128,0.8571428656578064,1.0],"useOpacity":true,"useSaturation":true,"useWeights":false,"pressureWeight":0.5,"bristleLengthWeight":0.5,"bristleInkAmountWeight":0.5,"inkDepletionWeight":50},"saturationLookup":{"version":1,"encoding":"bristle-saturation-functional-v1-le","asset":"asset:45c7f1880ae6dc9039d44a25e58b62420a12731d4925857e62d037660e5cf0df","profileSha256":"da13775358cc5b6fbc4d0fe7ebbb7d0df62ae393fa6395e5c1369295e64c9194","byteLength":3760}}}}],"skipped":[]}
const copy=()=>structuredClone(genuine)
describe('Bristle93 root-only saturation admission',()=>{
 it('positive genuine root includes complete CAS metadata',()=>{expect(isBrushLibrary(copy())).toBe(true)})
 for(const model of ['stamp','mixer']as const)for(const independent of [false,true])it(model+' rejects saturation child '+(independent?'independent':'inline'),()=>{
  const lib=copy(),child=structuredClone(lib.brushes[0].descriptor)
  const parent:BrushDescriptor=structuredClone(child);delete parent.bristle;parent.id='imported-aaaaaaaaaaaaaaaaaaaaaaaa';parent.model=model
  if(model==='mixer')parent.mixer={load:0,pickup:.5,strength:1,initialLoad:0,source:'previousCanvas'}
  lib.brushes[0].descriptor=parent
  // A malformed parent must not make the child rejection vacuously pass.
  expect(isBrushLibrary(lib)).toBe(true)
  if(!parent.behavior)throw Error('Expected valid parent behavior')
  parent.behavior.dual={brush:child,blendMode:'normal',...(independent?{sampling:'independent'}:{})}
  expect(isBrushLibrary(lib)).toBe(false)
 })
})
