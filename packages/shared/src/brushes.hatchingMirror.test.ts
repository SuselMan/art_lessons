import {it,expect} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
it('hatching noise requires its dedicated version and a standard mask',()=>{const lib=fixture(),d=lib.brushes[0].descriptor;d.version=204;d.tip={kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:.5,verticalFade:.5,antialias:false},autoNoise:{version:1,density:.44,randomness:1}};expect(isBrushLibrary(lib)).toBe(true);d.version=94;expect(isBrushLibrary(lib)).toBe(false);d.version=204;delete d.tip.autoNoise;expect(isBrushLibrary(lib)).toBe(false)})
function fixture():BrushLibrary{return{schemaVersion:1,assets:[{id:`asset:${'a'.repeat(64)}`,size:4,file:`${'a'.repeat(64)}.bin`}],skipped:[],brushes:[{name:'Authored asymmetric Hatching mirror',source:'kpp',warnings:[],descriptor:{id:'imported-9494949494949494',version:94,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,mirror:{horizontal:true,vertical:false,value:1,dynamics:[{control:'pressure',minimum:0,jitter:0}]},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},hatching:{version:1,angle:30,separation:8,thickness:2,origin:[0,0],style:'none',intervals:4,antialias:true,subpixel:true}}}]}}
it('admits the existing Hatching mask-mirror route only at revision94 while keeping old67 closed',()=>{
 const lib=fixture(),d=lib.brushes[0].descriptor
 expect(isBrushLibrary(lib)).toBe(true)
 for(const version of [47,58,67,93]){d.version=version;expect(isBrushLibrary(lib)).toBe(false)}
 d.version=67;delete d.behavior!.mirror;expect(isBrushLibrary(lib)).toBe(true)
})
it('does not open a special-family mirror or bypass the existing Hatching strategy guard',()=>{
 const lib=fixture(),d=lib.brushes[0].descriptor
 d.behavior!.rendering!.accumulation='maxAlpha';expect(isBrushLibrary(lib)).toBe(false)
 d.behavior!.rendering!.accumulation='directOver';expect(isBrushLibrary(lib)).toBe(true)
 delete d.hatching;d.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'}
 d.bristle={version:1,hairs:[[0,0,1]],scale:1,shear:0,random:0,mousePressure:false,threshold:false,connected:true,antialias:false,compositing:false}
 expect(isBrushLibrary(lib)).toBe(false);delete d.behavior!.mirror;expect(isBrushLibrary(lib)).toBe(true)
})
