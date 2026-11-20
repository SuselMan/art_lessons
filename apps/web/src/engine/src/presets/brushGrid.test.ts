import{expect,it}from'vitest'
import type{BrushGrid,Dab}from'@grafetto/shared'
import{gridCells,gridBackgroundRect,gridBackgroundMix}from'./brushGrid'
import{isBrushGrid,isGridDescriptor}from'../../../../../../packages/shared/src/brushGrid'
const grid:BrushGrid={version:1,width:20,height:20,scale:1,offset:[0,0],division:0,pressureDivision:false,border:[0,0],randomBorder:false,shape:1,sampleInput:true,colorPerCell:false,randomOpacity:false}
const dab:Dab={x:23,y:24,size:20,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
it('retains the legacy one-cell default and world snapping',()=>{expect(gridCells(grid,dab,1)).toEqual([{x:30,y:30,width:20,height:20,sampleX:30,sampleY:30,alpha:1}]);expect(gridCells(grid,{...dab,x:24,y:25},1)).toEqual(gridCells(grid,dab,1))})
it('per-request colour comes from first cell, per-cell colour uses each centre',()=>{const a=gridCells(grid,{...dab,size:40},1);expect(a).toHaveLength(4);expect(new Set(a.map(x=>x.sampleX+','+x.sampleY)).size).toBe(1);const b=gridCells({...grid,colorPerCell:true},{...dab,size:40},1);expect(new Set(b.map(x=>x.sampleX+','+x.sampleY)).size).toBe(4)})
it('pressure division truncates before scaled rounding as in native',()=>{const a={...grid,division:4,pressureDivision:true};expect(gridCells(a,{...dab,pressure:.49},1)).toHaveLength(1);expect(gridCells(a,{...dab,pressure:.5},1)).toHaveLength(4)})
it('preserves C++ fmod alignment for negative coordinates and offsets',()=>{expect(gridCells(grid,{...dab,x:-23,y:-24},1)[0]).toMatchObject({x:-10,y:-10});expect(gridCells({...grid,offset:[3,7]},dab,1)[0]).toMatchObject({x:33,y:17})})
it('normalizes inverted borders and repeats deterministic request opacity',()=>{const b={...grid,border:[15,15]as[number,number],randomOpacity:true};const a=gridCells(b,{...dab,size:40},1);expect(a[0]).toMatchObject({width:10,height:10});expect(a[0].alpha).toBe(a[3].alpha);expect(a).toEqual(gridCells(b,{...dab,size:40},1))})
it('rejects unbounded work before constructing a partial grid',()=>{expect(gridCells({...grid,width:1,height:1,division:16},{...dab,size:1000},1)).toEqual([]);expect(isBrushGrid(grid)).toBe(true);expect(isBrushGrid({...grid,width:0})).toBe(false);expect(isGridDescriptor({grid,model:'stamp'})).toBe(false)})

it('quantizes before discontinuous snapping so live and recorded float32 inputs agree',()=>{expect(gridCells(grid,{...dab,x:20-1e-8},1)).toEqual(gridCells(grid,{...dab,x:20},1))})

it('captures one signed HSV colour per request or per cell without changing geometry/opacity streams',()=>{
 const base={...grid,randomOpacity:true,colorPerCell:false},enabled={...base,hsv:{hue:-1,saturation:.5,value:0}}
 const old=gridCells(base,{...dab,size:40},123),cells=gridCells(enabled,{...dab,size:40},123)
 expect(cells.map(({hsv:_hsv,...cell})=>cell)).toEqual(old)
 expect(cells.every(c=>JSON.stringify(c.hsv)===JSON.stringify(cells[0].hsv))).toBe(true)
 expect(cells[0].hsv![0]).toBeLessThanOrEqual(0);expect(cells[0].hsv![1]).toBeGreaterThanOrEqual(0);expect(cells[0].hsv![2]).toBe(0)
 const perCell=gridCells({...enabled,colorPerCell:true},{...dab,size:40},123)
 expect(new Set(perCell.map(c=>JSON.stringify(c.hsv))).size).toBe(4)
 expect(perCell).toEqual(gridCells({...enabled,colorPerCell:true},{...dab,size:40},123))
})
it('fills only the aligned base cell, including negative fmod and fractional enclosing edges',()=>{
 expect(gridBackgroundRect(grid,{...dab,size:80})).toEqual({minX:0,minY:0,maxX:20,maxY:20})
 expect(gridBackgroundRect({...grid,width:3,height:5,scale:.5,offset:[.2,.3]},dab)).toEqual({minX:13,minY:12,maxX:16,maxY:16})
})
it('mixes captured colour using independently truncated pressure weights and alpha-aware colour',()=>{
 expect(gridBackgroundMix([255,0,0,255],[0,0,255,255],.5)).toEqual([128,0,128,254])
 expect(gridBackgroundMix([255,0,0,255],[0,255,0,0],0)).toEqual([0,0,0,0])
 expect(gridBackgroundMix([255,0,0,128],[0,0,255,255],1)).toEqual([255,0,0,128])
 expect(()=>gridBackgroundMix([0,0,0,0],[0,0,0,0],NaN)).toThrow('pressure')
})
