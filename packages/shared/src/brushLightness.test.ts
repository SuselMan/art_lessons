import { describe, expect, it } from 'vitest'
import { isBrushLibrary, type BrushLibrary, type AssetId } from './brushes.js'

function fixture(): BrushLibrary {
  const alpha = `asset:${'a'.repeat(64)}` as AssetId, gray = `asset:${'b'.repeat(64)}` as AssetId
  return { schemaVersion:1,assets:[alpha,gray].map(id=>({id,size:2,file:`${id.slice(6)}.bin`})),skipped:[],brushes:[{
    name:'Authored lightness',source:'authored.kpp',warnings:[],descriptor:{
      id:'imported-1234567890abcdef',version:13,model:'stamp',category:'paint',
      tip:{kind:'bitmap',mask:alpha,material:{kind:'lightness',gray,strength:1},hardness:1,aspect:1,angle:0,rotation:'fixed'},
      paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,
      sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],
    },
  }] }
}

describe('paired lightness planes',()=>{
  it('accepts static pairs and recursively validates independent components',()=>{
    const data=fixture();expect(isBrushLibrary(data)).toBe(true)
    const child=structuredClone(data.brushes[0].descriptor)
    data.brushes[0].descriptor.behavior={version:2,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
    expect(isBrushLibrary(data)).toBe(true)
    child.tip.material!.gray=`asset:${'c'.repeat(64)}`
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('rejects absent, mismatched and unknown material data',()=>{
    for(const mutate of [
      (d:BrushLibrary)=>{d.brushes[0].descriptor.tip.material!.gray=`asset:${'c'.repeat(64)}`},
      (d:BrushLibrary)=>{d.assets[1].size=4},
      (d:BrushLibrary)=>{d.brushes[0].descriptor.tip.material!.strength=NaN},
      (d:BrushLibrary)=>{d.brushes[0].descriptor.tip.kind='round'},
      (d:BrushLibrary)=>{Object.assign(d.brushes[0].descriptor.tip.material!,{kind:'rgb'})},
      (d:BrushLibrary)=>{Object.assign(d.brushes[0].descriptor.tip.material!,{extra:1})},
      (d:BrushLibrary)=>{d.brushes[0].descriptor.model='mixer';d.brushes[0].descriptor.mixer={load:1,pickup:1,strength:1}},
    ]){const data=fixture();mutate(data);expect(isBrushLibrary(data)).toBe(false)}
  })
  it('requires matching frame counts, first planes and dimensions without banning repeated alpha IDs',()=>{
    const data=fixture(),tip=data.brushes[0].descriptor.tip,gray=tip.material!.gray
    tip.animation={mode:'random',frames:[tip.mask as AssetId,tip.mask as AssetId]}
    expect(isBrushLibrary(data)).toBe(false)
    tip.material!.grayFrames=[gray,tip.mask as AssetId]
    expect(isBrushLibrary(data)).toBe(true)
    tip.material!.grayFrames=[tip.mask as AssetId,gray]
    expect(isBrushLibrary(data)).toBe(false)
    tip.material!.grayFrames=[gray]
    expect(isBrushLibrary(data)).toBe(false)
    delete tip.animation
    expect(isBrushLibrary(data)).toBe(false)
  })
})
