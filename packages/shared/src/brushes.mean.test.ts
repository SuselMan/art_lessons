import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes.js'
function library():BrushLibrary {
 return {schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored mean',source:'qa',warnings:[],descriptor:{id:'imported-aaaaaaaaaaaaaaaa',version:13,model:'mixer',category:'wet',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas',sampling:{mode:'uniformMean',radius:.0041}}}}]}
}
it('bounds uniform mean and restricts it to pure previous-canvas sources',()=>{
 const data=library(),m=data.brushes[0].descriptor.mixer!
 expect(isBrushLibrary(data)).toBe(true)
 for(const radius of [0,3]){m.sampling!.radius=radius;expect(isBrushLibrary(data)).toBe(true)}
 for(const radius of [-1,3.01,Infinity,NaN]){m.sampling!.radius=radius;expect(isBrushLibrary(data)).toBe(false)}
 m.sampling!.radius=.0041;delete m.source;expect(isBrushLibrary(data)).toBe(false)
 m.source='previousCanvas';m.load=.1;expect(isBrushLibrary(data)).toBe(false)
 m.load=0;m.initialLoad=.1;expect(isBrushLibrary(data)).toBe(false)
})
