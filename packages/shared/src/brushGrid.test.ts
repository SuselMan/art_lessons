import{expect,it}from'vitest'
import{isBrushGrid,type BrushGrid}from'./brushGrid.js'
const grid=():BrushGrid=>({version:1,width:96,height:64,scale:1,offset:[0,0],division:2,pressureDivision:false,border:[0,0],randomBorder:false,shape:1,sampleInput:false,colorPerCell:true,randomOpacity:false,fillBackground:true,mixBackground:true,hsv:{hue:0,saturation:0,value:0}})
it('keeps zero HSV enabled and bounds each signed channel',()=>{
 const g=grid();expect(isBrushGrid(g)).toBe(true)
 for(const key of ['hue','saturation','value']as const){for(const v of [-1,1]){g.hsv![key]=v;expect(isBrushGrid(g)).toBe(true)}for(const v of [-1.01,1.01,NaN]){g.hsv![key]=v;expect(isBrushGrid(g)).toBe(false)}g.hsv![key]=0}
 Object.assign(g.hsv!,{unknown:0});expect(isBrushGrid(g)).toBe(false)
})
it('admits flags only as true or absent',()=>{const g=grid();Object.assign(g,{fillBackground:false});expect(isBrushGrid(g)).toBe(false);delete g.fillBackground;expect(isBrushGrid(g)).toBe(true)})
