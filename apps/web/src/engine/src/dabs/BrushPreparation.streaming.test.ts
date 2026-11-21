import{expect,it}from'vitest'
import{filter192}from'../../../../../../packages/shared/src/filterMask192.testFixture'
import{installBrushPixels}from'../presets/importedBrushes'
import{streamingSmudgeResources,type BrushPreparationResource}from'./BrushPreparation'
it('bounds native large Lightness tensor residency to one frame and static textures',()=>{
 const brush=filter192();delete brush.filter;brush.version=193;brush.mixer={load:0,initialLoad:0,pickup:.5,strength:1,smearAlpha:true,source:'previousCanvas',algorithm:'krita-mask',paintThickness:{enabled:true} as never,colorRateComposite:'normal'}
 const ids=Array.from({length:396},(_,i)=>`asset:${i.toString(16).padStart(64,'0')}` as const)
 for(const id of ids)installBrushPixels(id,new Uint8Array(4))
 brush.tip={kind:'bitmap',mask:ids[0],hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',frames:ids,dimensions:[{mode:'angular',rank:18},{mode:'incremental',rank:22}],cursorPolicy:'first-request-v1'},material:{kind:'lightness',gray:ids[0],grayFrames:ids,strength:1}}
 const frames:BrushPreparationResource[]=ids.map(id=>({painter:'wet',id,grain:false,colorPlanes:[id,id,id]})),grain:BrushPreparationResource={painter:'wet',id:ids[0],grain:true},all=[grain,...frames]
 expect(streamingSmudgeResources(brush,all,2048)).toEqual([grain,frames[0]])
 expect(()=>streamingSmudgeResources(brush,all,1)).toThrow('Invalid streaming smudge frame inventory')
 brush.tip.animation!.frames=ids.slice(0,256);expect(streamingSmudgeResources(brush,all,2048)).toEqual(all)
})
