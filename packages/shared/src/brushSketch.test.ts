import{expect,it}from'vitest'
import{isBrushSketch}from'./brushSketch.js'
import{brushRequiresSourceTime,brushRequiresRandomContext,type BrushDescriptor}from'./brushes.js'
const sketch={version:1,mode:'simple',width:1,offset:.2,probability:1,connect:true,magnetify:true,randomRGB:false,randomOpacity:false,distanceDensity:false,distanceOpacity:false,antialias:false}
it('accepts bounded simple Sketch and rejects unknown modes/options',()=>{expect(isBrushSketch(sketch)).toBe(true);for(const v of [{...sketch,mode:'mask'},{...sketch,width:Infinity},{...sketch,unknown:1},{...sketch,dynamics:{width:[{control:'bad'}]}}])expect(isBrushSketch(v)).toBe(false)})
it('includes Sketch control slots in the author input requirements',()=>{const b={sketch:{...sketch,dynamics:{width:[{control:'time',period:100,periodic:false,minimum:0,jitter:0}]}}}as BrushDescriptor;expect(brushRequiresSourceTime(b)).toBe(true);b.sketch!.dynamics={offset:[{control:'strokeRandom',randomSource:{kind:'qt5Taus88',key:'Offset scale'},minimum:0,jitter:0}]};expect(brushRequiresRandomContext(b)).toBe(true)})
