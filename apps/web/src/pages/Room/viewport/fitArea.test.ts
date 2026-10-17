import {expect,it} from 'vitest'
import {fittedViewport,visibleFitArea,readFitArea,type FitOverlay} from './fitArea'
const view={left:0,top:0,right:1280,bottom:800}
const rect=(left:number,top:number,right:number,bottom:number)=>({left,top,right,bottom})
it('fits a landscape page between overlapping left rails, header and right panel',()=>{
 const overlays:FitOverlay[]=[{edge:'left',rect:rect(0,52,62,800)},{edge:'left',rect:rect(62,52,124,800)},{edge:'right',rect:rect(960,52,1280,800)},{edge:'top',rect:rect(0,0,1280,52)}]
 const area=visibleFitArea(view,overlays),vp=fittedViewport(area,{width:1024,height:512},0)
 expect(area).toEqual(rect(124,52,960,800));expect(vp.cx).toBe(542);expect(vp.cy).toBe(426)
 expect(vp.zoom).toBeCloseTo((960-124)/1024*.88)
 expect(vp.cx-512*vp.zoom).toBeGreaterThan(area.left)
 expect(vp.cx+512*vp.zoom).toBeLessThan(area.right)
})
it('keeps the remaining minimal settings rail while using the newly free right area',()=>{
 const area=visibleFitArea(view,[{edge:'left',rect:rect(0,0,62,800)}])
 expect(area).toEqual(rect(62,0,1280,800));expect(fittedViewport(area,{width:512,height:768},0).cx).toBe(671)
})
it('fits a locked rotated page by its full transformed bounding box',()=>{
 const area=rect(124,52,960,800),angle=Math.PI/4,v=fittedViewport(area,{width:1024,height:512},angle)
 const half=(1024+512)*Math.SQRT1_2*v.zoom/2
 expect(v.angle).toBe(angle);expect(v.cx-half).toBeGreaterThan(area.left);expect(v.cx+half).toBeLessThan(area.right)
 expect(v.cy-half).toBeGreaterThan(area.top);expect(v.cy+half).toBeLessThan(area.bottom)
})
it('uses viewport-local coordinates even when the editor is offset',()=>{
 const area=visibleFitArea(rect(100,200,1380,1000),[{edge:'left',rect:rect(100,252,224,1000)},{edge:'right',rect:rect(1060,252,1380,1000)}])
 expect(area).toEqual(rect(224,200,1060,1000))
})
it('ignores nonintersecting chrome and avoids invalid fit when no free area remains',()=>{
 expect(visibleFitArea(view,[{edge:'left',rect:rect(-100,0,-1,800)}])).toEqual(view)
 expect(visibleFitArea(view,[{edge:'left',rect:rect(0,0,1280,800)}])).toEqual(view)
})

it('measures current docked bounds locally and skips hidden chrome before its opacity transition',()=>{
 const node=(edge:string,hidden:boolean,bounds:ReturnType<typeof rect>)=>({dataset:{canvasFitEdge:edge,canvasFitHidden:String(hidden)},getBoundingClientRect:()=>({...bounds,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top})})
 const viewport={closest:()=>null,getBoundingClientRect:()=>rect(100,200,1380,1000),parentElement:{querySelectorAll:()=>[
  node('left',true,rect(100,252,224,1000)),node('left',false,rect(100,200,162,1000)),node('right',true,rect(1060,252,1380,1000)),
 ]}} as unknown as HTMLElement
 expect(readFitArea(viewport)).toEqual(rect(62,0,1280,800))
})

it('includes the editor header outside the immediate viewport body',()=>{
 const header={dataset:{canvasFitEdge:'top'},getBoundingClientRect:()=>({...rect(0,0,1280,52),width:1280,height:52})}
 const body={querySelectorAll:()=>[]}
 const editor={querySelectorAll:()=>[header]}
 const viewport={getBoundingClientRect:()=>rect(0,0,1280,850),parentElement:body,closest:(selector:string)=>selector==='[data-canvas-fit-root]'?editor:null} as unknown as HTMLElement
 expect(readFitArea(viewport)).toEqual(rect(0,52,1280,850))
 const fitted=fittedViewport(readFitArea(viewport),{width:1024,height:768},Math.PI/2)
 expect(fitted.cy).toBe(451)
 expect(fitted.cy-1024*fitted.zoom/2).toBeGreaterThan(52)
})
