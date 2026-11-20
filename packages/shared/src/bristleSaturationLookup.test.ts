import {describe,expect,it} from 'vitest'
import {isBristleSaturationLookup,isBrushBristle,type BrushBristle} from './brushBristle.js'
import {brushAssetIds,isBrushLibrary,type BrushDescriptor} from './brushes.js'
const lookup={version:1 as const,encoding:'bristle-saturation-functional-v1-le' as const,asset:`asset:${'a'.repeat(64)}` as const,profileSha256:'b'.repeat(64),byteLength:524288}
const bristle:BrushBristle={version:2,hairs:[[0,0,1]],scale:1,shear:0,random:0,mousePressure:true,threshold:false,connected:false,antialias:true,compositing:false,ink:{depletion:[0,1],useOpacity:true,useSaturation:true,useWeights:false,pressureWeight:1,bristleLengthWeight:1,bristleInkAmountWeight:1,inkDepletionWeight:1},saturationLookup:lookup}
const brush:BrushDescriptor={id:`imported-${'a'.repeat(16)}`,version:93,model:'stamp',category:'paint',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'travel'},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,bristle,behavior:{version:2,rendering:{mode:'buildUp',accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
describe('compiled Bristle lookup contract',()=>{
 it('enumerates the explicit resource through primary and secondary brushes',()=>{
  expect(brushAssetIds(brush)).toEqual([lookup.asset])
  expect(brushAssetIds({...brush,bristle:undefined,behavior:{version:2,dual:{brush,blendMode:'multiply'}}})).toEqual([lookup.asset])
 })
 it('bounds the typed LE lookup and requires revision93 admission',()=>{
  expect(isBristleSaturationLookup(lookup)).toBe(true)
  expect(isBrushBristle(bristle)).toBe(true)
  const library={schemaVersion:1,assets:[{id:lookup.asset,size:1024,file:`${lookup.asset.slice(6)}.bin`}],brushes:[{name:'compiled',source:'authored',warnings:[],descriptor:brush}],skipped:[]}
  expect(isBrushLibrary(library)).toBe(true)
  expect(isBrushLibrary({...library,brushes:[{...library.brushes[0],descriptor:{...brush,version:92}}]})).toBe(false)
  for(const change of [{byteLength:63},{byteLength:524289},{byteLength:64.5},{profileSha256:'bad'},{asset:'asset:bad'},{encoding:'unorm32be'},{version:2},{unknown:true}])
   expect(isBristleSaturationLookup({...lookup,...change})).toBe(false)
 })
 it('keeps lookup resources out of the old opacity-only route',()=>{
  expect(isBrushBristle({...bristle,ink:{...bristle.ink,useSaturation:false}})).toBe(false)
  expect(isBrushBristle({...bristle,ink:{...bristle.ink,useSaturation:false},saturationLookup:undefined})).toBe(true)
  expect(isBrushBristle({...bristle,version:1,ink:undefined})).toBe(false)
 })
})
