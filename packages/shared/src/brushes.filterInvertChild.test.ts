import {it,expect} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
function fixture():BrushLibrary{return{schemaVersion:1,assets:[{id:`asset:${'a'.repeat(64)}`,size:4,file:`${'a'.repeat(64)}.bin`}],skipped:[],brushes:[{name:'Authored asymmetric Hatching mirror',source:'kpp',warnings:[],descriptor:{id:'imported-9494949494949494',version:94,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,mirror:{horizontal:true,vertical:false,value:1,dynamics:[{control:'pressure',minimum:0,jitter:0}]},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},hatching:{version:1,angle:30,separation:8,thickness:2,origin:[0,0],style:'none',intervals:4,antialias:true,subpixel:true}}}]}}
for(const model of ['stamp','mixer'] as const)for(const independent of [false,true])it(model+' invertchild admission probe '+independent,()=>{
 const lib=fixture(),child=structuredClone(lib.brushes[0].descriptor),parent=lib.brushes[0].descriptor
 delete parent.hatching;delete parent.behavior!.mirror;parent.id='imported-aaaaaaaaaaaaaaaaaaaaaaaa';parent.model=model
 if(model==='mixer')parent.mixer={load:0,pickup:.5,strength:1,initialLoad:0,source:'previousCanvas'}
 expect(isBrushLibrary(lib)).toBe(true)
 delete child.hatching;delete child.behavior!.mirror;child.version=95;child.model='mixer';child.mixer={load:0,pickup:.5,strength:1,initialLoad:0,source:'previousCanvas'};child.filter={version:2,kind:'invert'}
 const standalone=structuredClone(lib);standalone.brushes[0].descriptor=child;expect(isBrushLibrary(standalone)).toBe(true)
 parent.behavior!.dual={brush:child,blendMode:'normal',...(independent?{sampling:'independent' as const}:{})}
 expect(isBrushLibrary(lib)).toBe(false)
})
