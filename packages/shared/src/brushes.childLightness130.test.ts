import{it,expect}from'vitest'
import{isBrushLibrary,isIndependentDrawingAnglePair,type BrushDescriptor}from'./brushes.js'
import{library130,libraryCounts130}from'./childLightness130.testFixture.js'
import{library128}from'./childLightness128.testFixture.js'
it('130 admits genuine 5 Lightness /7 native-image random pair with existing root effects and Wash',()=>{const l=library130(),d=l.brushes[0].descriptor;expect(isIndependentDrawingAnglePair(d)).toBe(true);expect(isBrushLibrary(l)).toBe(true);expect(d.texture?.application?.mode).toBe('subtract');expect(d.behavior!.colorAdjustment).toBeDefined();expect(d.scatter!.radius).toBe(.51);expect(isBrushLibrary(library128())).toBe(true)})
it('130 keeps old versions, malformed frames, child effects and unsupported combinations closed',()=>{
 const edits:Array<(d:BrushDescriptor)=>void>=[d=>{d.version=129},d=>{d.behavior!.dual!.brush.version=129},d=>{delete d.tip.maskBounds},d=>{d.tip.material!.grayFrames!.pop()},d=>{d.tip.animation!.frames.pop()},d=>{Reflect.set(d.tip.animation!,'mode','incremental')},d=>{d.behavior!.dual!.brush.scatter={...d.scatter!}},d=>{d.behavior!.dual!.brush.behavior!.mirror={horizontal:true,vertical:true,value:1}},d=>{d.behavior!.dual!.brush.tip.material={...d.tip.material!}},d=>{d.behavior!.dual!.brush.tip.imageSampling!.sourceRect.width=3},d=>{d.behavior!.rendering!.accumulation='directOver'},d=>{d.behavior!.strokeInput!.fanCorners={stepDegrees:30}},d=>{Reflect.set(d.behavior!.dual!,'sampling','inline')},d=>{delete d.behavior!.strokeInput},d=>{d.texture!.application!.mode='overlay'},d=>{d.behavior!.timing={rate:20,version:1,ignoreDistanceSpacing:false}}]
 for(const edit of edits){const l=library130();edit(l.brushes[0].descriptor);expect(isBrushLibrary(l)).toBe(false);expect(isIndependentDrawingAnglePair(l.brushes[0].descriptor)).toBe(false)}
 for(const index of[1,6,11]){const l=library130();l.assets[index].size=8;expect(isBrushLibrary(l)).toBe(false)}
})

it('same130 mechanism admits coherent3/4 odd packing and tiny2/256 boundaries, not invalidcounts or mismatchedgray arrays',()=>{
 for(const[root,child]of[[3,4],[2,2],[256,256]]){const l=libraryCounts130(root,child);expect(isIndependentDrawingAnglePair(l.brushes[0].descriptor)).toBe(true);expect(isBrushLibrary(l)).toBe(true)}
 for(const[root,child]of[[0,4],[1,4],[257,4],[3,0],[3,1],[3,257]]){const l=libraryCounts130(root,child);expect(isBrushLibrary(l)).toBe(false);expect(isIndependentDrawingAnglePair(l.brushes[0].descriptor)).toBe(false)}
 const l=libraryCounts130(3,4);l.brushes[0].descriptor.tip.material!.grayFrames!.pop();expect(isBrushLibrary(l)).toBe(false)
})
