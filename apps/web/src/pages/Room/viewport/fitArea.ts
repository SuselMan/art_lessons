import {fitZoom} from './cameraMath'
import type {Viewport} from '../../../stores/slices/viewportSlice'
export interface FitRect {left:number;top:number;right:number;bottom:number}
export interface FitOverlay {edge:'left'|'right'|'top'|'bottom';rect:FitRect}
/** Docked chrome removes an edge strip; overlapping bars share that strip. */
export function visibleFitArea(view:FitRect,overlays:readonly FitOverlay[]):FitRect {
 let {left,top,right,bottom}=view
 for(const {edge,rect}of overlays){
  if(rect.right<=view.left||rect.left>=view.right||rect.bottom<=view.top||rect.top>=view.bottom)continue
  if(edge==='left')left=Math.max(left,Math.min(view.right,rect.right))
  else if(edge==='right')right=Math.min(right,Math.max(view.left,rect.left))
  else if(edge==='top')top=Math.max(top,Math.min(view.bottom,rect.bottom))
  else bottom=Math.min(bottom,Math.max(view.top,rect.top))
 }
 // There is no usable fit when chrome covers the entire viewport. Keep the
 // previous full-viewport reset rather than inventing zero/negative zoom.
 return left<right&&top<bottom?{left,top,right,bottom}:{...view}
}
export function fittedViewport(area:FitRect,canvas:{width:number;height:number},angle:number):Viewport {
 return {cx:(area.left+area.right)/2,cy:(area.top+area.bottom)/2,angle,
  zoom:fitZoom(area.right-area.left,area.bottom-area.top,canvas,angle)}
}
/** Bounds are measured at the action, so resized panels and minimal UI agree
 * with what is on screen; no camera movement merely because a panel toggled. */
export function readFitArea(viewport:HTMLElement):FitRect {
 const view=viewport.getBoundingClientRect(),overlays:FitOverlay[]=[]
 const root=viewport.closest<HTMLElement>('[data-canvas-fit-root]')??viewport.parentElement
 for(const node of root?.querySelectorAll<HTMLElement>('[data-canvas-fit-edge]')??[]){
  if(node.dataset.canvasFitHidden==='true')continue
  const edge=node.dataset.canvasFitEdge
  if(edge!=='left'&&edge!=='right'&&edge!=='top'&&edge!=='bottom')continue
  const rect=node.getBoundingClientRect()
  if(rect.width<=0||rect.height<=0)continue
  overlays.push({edge,rect})
 }
 const area=visibleFitArea(view,overlays)
 return {left:area.left-view.left,top:area.top-view.top,right:area.right-view.left,bottom:area.bottom-view.top}
}
