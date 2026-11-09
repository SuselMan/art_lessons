import{proceduralMaskAlpha}from'../raster/brushProcedural'
import{hasSketchImageAlpha162Scope,hasSketchProcedural173Scope}from'@grafetto/shared'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
/** Existing captured alpha CAS only; no generated mask, cache, canvas read or
 * stateful sampler. Views stay local to one paint call, never in cloned state. */
export interface SketchMaskRequest{readonly left:number;readonly top:number;readonly width:number;readonly height:number;readonly radius:number;contains(x:number,y:number):boolean}
export interface SketchMaskView{forDab(dab:Dab):SketchMaskRequest}
const qRound=(x:number)=>x<0?-Math.floor(-x+.5):Math.floor(x+.5)
export function assertSketchDistanceOpacityPolicy(brush:BrushDescriptor):void{
 const policy=brush.sketch?.distanceOpacityPolicy
 if(policy!==undefined&&(brush.version<114||brush.sketch?.mode!=='mask'||!brush.sketch.distanceOpacity||policy!=='generic-clamp-v1')||brush.sketch?.mode==='mask'&&brush.sketch.distanceOpacity&&policy!=='generic-clamp-v1')throw Error('Invalid Sketch114 distance opacity policy')
}
export function prepareSketchMask(brush:BrushDescriptor):SketchMaskView|undefined{
 assertSketchDistanceOpacityPolicy(brush)
 if(brush.sketch?.maskSignal==='procedural-standard-v1'){if(!hasSketchProcedural173Scope(brush))throw Error('Invalid Sketch173 procedural scope');return proceduralSketchMask173(brush)}
 if(brush.sketch?.maskSignal!==undefined&&!hasSketchImageAlpha162Scope(brush))throw Error('Invalid Sketch162 alpha selector scope')
 if(brush.sketch?.mode!=='mask')return undefined
 const tip=brush.tip,dimensions=brush.sketch.maskSize
 if(brush.version<101||tip.kind!=='bitmap'||!tip.mask||!dimensions||(brush.sketch.distanceOpacity?(brush.version<114||brush.sketch.distanceOpacityPolicy!=='generic-clamp-v1'):brush.sketch.distanceOpacityPolicy!==undefined)||tip.animation||tip.color||tip.profile||tip.material||tip.imageSampling||tip.autoNoise||tip.autoShape)throw Error('Unsupported Sketch101 static alpha mask')
 const pixels=importedAssetPixels(tip.mask),side=Math.sqrt(pixels.length),[w,h]=dimensions,longest=Math.max(w,h)
 if(!Number.isInteger(side)||side<2||side>256||!dimensions.every(n=>Number.isInteger(n)&&n>=1&&n<=256)||w>side||h>side)throw Error('Invalid Sketch101 mask dimensions')
 let canonicalSide=2**Math.ceil(Math.log2(Math.max(2,longest)));if(longest===canonicalSide&&((canonicalSide-w)%2||(canonicalSide-h)%2))canonicalSide*=2
 const bounds=tip.maskBounds,ox=Math.floor((side-w)/2),oy=Math.floor((side-h)/2)
 if(side!==canonicalSide||!bounds||bounds.x!==(ox+(w-longest)/2)/side||bounds.y!==(oy+(h-longest)/2)/side||bounds.width!==longest/side||bounds.height!==longest/side||tip.aspect!==1)throw Error('Sketch101 mask metadata differs from canonical captured geometry')
 // Validate zero padding without cloning the borrowed CAS. Full square has no
 // padding scan. Native image dimensions cannot reinterpret painted padding.
 for(let y=0;y<side;y++)if(y<oy||y>=oy+h){for(let x=0;x<side;x++)if(pixels[y*side+x])throw Error('Nonzero Sketch101 mask padding')}
 else{for(let x=0;x<ox;x++)if(pixels[y*side+x])throw Error('Nonzero Sketch101 mask padding');for(let x=ox+w;x<side;x++)if(pixels[y*side+x])throw Error('Nonzero Sketch101 mask padding')}
 const at=(x:number,y:number)=>x<0||y<0||x>=w||y>=h?0:pixels[(oy+y)*side+ox+x]
 return{forDab(dab){
  if(![dab.x,dab.y,dab.size,dab.angle].every(Number.isFinite)||dab.size<0)throw Error('Invalid Sketch101 input geometry')
  const x=dab.x,y=dab.y,size=dab.size,scale=size/longest,c=Math.cos(dab.angle),s=Math.sin(dab.angle),ac=Math.abs(c),as=Math.abs(s),width=Math.max(1,Math.ceil((w*ac+h*as)*scale)),height=Math.max(1,Math.ceil((w*as+h*ac)*scale)),left=Math.floor(x-width/2),top=Math.floor(y-height/2),inverseScale=size>.01?longest/size:0
  return{left,top,width,height,radius:Math.max(width,height)/2,contains(px,py){
   if(size<=.01||px<left||py<top||px>=left+width||py>=top+height)return false
   // QPointF::toPoint precedes alphaU8!=0. Trig/geometry/scale above are
   // evaluated exactly once per logical dab, never inside this candidate loop.
   const mx=qRound(px-x+width/2),my=qRound(py-y+height/2)
   if(mx<0||my<0||mx>=width||my>=height)return false
   const dx=mx-width/2,dy=my-height/2,sx=(c*dx+s*dy)*inverseScale+w/2-.5,sy=(-s*dx+c*dy)*inverseScale+h/2-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0
   const alpha=(at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy
   return Math.floor(alpha+.5)!==0
  }}
 }}
}

function proceduralSketchMask173(brush:BrushDescriptor):SketchMaskView{
 const profile=brush.tip.profile!,aspect=brush.tip.aspect
 return{forDab(dab){
  if(![dab.x,dab.y,dab.size,dab.angle].every(Number.isFinite)||dab.size<0||dab.size>400)throw Error('Invalid Sketch173 physical geometry')
  // Sketch fixes ratio to1. Only intrinsic source ratio survives: do not read
  // generic dab.aspectRatio. Allocation/bbox/hotspot mirror the bitmap path.
  const w=dab.size,h=dab.size/aspect,c=Math.cos(dab.angle),s=Math.sin(dab.angle),width=Math.max(1,Math.ceil(Math.abs(c)*w+Math.abs(s)*h)),height=Math.max(1,Math.ceil(Math.abs(s)*w+Math.abs(c)*h)),left=Math.floor(dab.x-width/2),top=Math.floor(dab.y-height/2)
  return{left,top,width,height,radius:Math.max(width,height)/2,contains(px,py){
   if(dab.size<=.01||px<left||py<top||px>=left+width||py>=top+height)return false
   const mx=qRound(px-dab.x+width/2),my=qRound(py-dab.y+height/2)
   if(mx<0||my<0||mx>=width||my>=height)return false
   // Native tests generated alpha at an allocated integer pixel, not at the
   // original floating historical point. The reused evaluator returns U8.
   return proceduralMaskAlpha(mx-width/2,my-height/2,w,h,profile,dab.angle)!==0
  }}
 }}
}
