import{it,expect}from'vitest'
import{isBrushLibrary,type BrushLibrary,type AssetId}from'./brushes'
function fixture():BrushLibrary{
 const ids=[1,2,3,4].map(n=>('asset:'+String(n).repeat(64))as AssetId)
 return{schemaVersion:1,skipped:[],assets:ids.map(id=>({id,size:4,file:id.slice(6)+'.bin'})),brushes:[{name:'Own RGB stamp',source:'qa',warnings:[],descriptor:{id:'imported-aaaaaaaaaaaaaaaa',version:84,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:ids[0],color:{planes:[ids[1],ids[2],ids[3]]},hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}]}
}
it('admits original Pixel planes only with opted-in revision and supported controls',()=>{
 const data=fixture(),d=data.brushes[0].descriptor
 expect(isBrushLibrary(data)).toBe(true)
 d.version=83;expect(isBrushLibrary(data)).toBe(false);d.version=84
 d.behavior!.colorAdjustment={hue:{control:'pressure',minimum:0,jitter:0}};expect(isBrushLibrary(data)).toBe(false);delete d.behavior!.colorAdjustment
 d.behavior!.modulations={brightness:[{control:'pressure',minimum:0,jitter:0}]};expect(isBrushLibrary(data)).toBe(false);delete d.behavior!.modulations
 data.assets[1].size=8;expect(isBrushLibrary(data)).toBe(false)
})
