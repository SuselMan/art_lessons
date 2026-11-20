import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{sampleBrushGradient}from'@grafetto/shared'
import type{BrushExecutionContext}from'./brushExecutionContext'
import type{SketchMaskRequest,SketchMaskView}from'./sketchMask'
import{importedAssetPixels}from'./importedBrushes'
import{proceduralMaskAlpha}from'../raster/brushProcedural'
import{prepareCurveRectangle}from'../raster/autoRectangle'
import{prepareRadialSoftnessBasis}from'../raster/radialSoftness'
import{autoMaskNoiseAlpha,autoMaskNoiseKey,prepareAutoMaskNoise}from'../raster/autoMaskNoise'
import{gihFrameMaskBounds,gihFrameSampleTransform}from'../raster/gihFrameGeometry'
const qRound=(x:number)=>x<0?-Math.floor(-x+.5):Math.floor(x+.5)
/** A prepared native alpha consumer: borrowed immutable resource planes and
 * basis metadata only. No canvas reads, generated bitmap or candidate RNG. */
export function prepareSketchMask194(brush:BrushDescriptor,execution?:BrushExecutionContext):SketchMaskView{
 const tip=brush.tip,profile=tip.profile,animation=tip.animation
 const ids=animation?.frames??(tip.mask?[tip.mask]:[])
 const dimensions=animation?.geometry?.frames.map(g=>({width:g.sourceWidth,height:g.sourceHeight}))??ids.map(()=>({width:brush.sketch!.maskSize?.[0]??tip.sourceGeometry?.width??0,height:brush.sketch!.maskSize?.[1]??tip.sourceGeometry?.height??0}))
 const frames=ids.map((id,i)=>{
  const pixels=importedAssetPixels(id),side=Math.sqrt(pixels.length),size=dimensions[i],bounds=gihFrameMaskBounds(size,side)
  const expected=animation?.geometry?.frames[i].maskBounds??tip.maskBounds
  if(!expected||(['x','y','width','height']as const).some(k=>expected[k]!==bounds[k]))throw Error('Sketch194 resource geometry differs from original mask')
  const grayId=tip.color&&'gradient'in tip.color?(tip.color.gradient.grayFrames?.[i]??tip.color.gradient.gray):undefined
  const gray=grayId?importedAssetPixels(grayId):undefined
  if(gray&&gray.length!==pixels.length)throw Error('Sketch194 gradient paired dimensions differ')
  const ox=Math.floor((side-size.width)/2),oy=Math.floor((side-size.height)/2)
  return{pixels,gray,side,...size,at:(x:number,y:number)=>x<0||y<0||x>=size.width||y>=size.height?0:pixels[(oy+y)*side+ox+x],grayAt:(x:number,y:number)=>x<0||y<0||x>=size.width||y>=size.height?0:gray?.[(oy+y)*side+ox+x]??0}
 })
 if(tip.kind==='bitmap'&&!frames.length)throw Error('Sketch194 mask resources missing')
 const lookup=profile&&'lookup'in profile?importedAssetPixels(profile.lookup):undefined
 const rectangle=profile?.kind==='curveRectangle'||profile?.kind==='curveRectangleSoftness'?prepareCurveRectangle(lookup!,profile.resolution,profile.antialias,profile.kind==='curveRectangleSoftness'?profile:undefined):undefined
 const radial=profile?.kind==='radialCurveSoftness'?prepareRadialSoftnessBasis(lookup!,profile):undefined
 const noise=tip.autoNoise&&(tip.autoNoise.density!==1||tip.autoNoise.randomness!==0)?prepareAutoMaskNoise(tip.autoNoise.density,tip.autoNoise.randomness):undefined

 return{forDab(dab:Dab,index=0,nativeSizeFactor=1,ordinal=0):SketchMaskRequest{
  if(![dab.x,dab.y,dab.size,dab.angle,nativeSizeFactor].every(Number.isFinite)||dab.size<0||dab.size>100000||!Number.isSafeInteger(index)||index<0||frames.length&&index>=frames.length)throw Error('Invalid Sketch194 physical request')
  const reference=frames[0],frame=frames[index],angle=dab.angle
  const sourceWidth=reference?.width??dab.sourceSize??dab.size,sourceHeight=reference?.height??sourceWidth/tip.aspect
  const scale=reference?dab.size/Math.max(reference.width,reference.height):1
  const generated=dab.size>.01&&nativeSizeFactor*Math.min(sourceWidth,sourceHeight)>.01
  if(!generated)return{left:Math.floor(dab.x),top:Math.floor(dab.y),width:1,height:1,radius:0,generated:false,contains:()=>false}
  const transform=frame?gihFrameSampleTransform({reference,selected:frame,cursor:[dab.x,dab.y],scale,ratio:1,rotation:angle-tip.angle,brushAngle:tip.angle,horizontalMirror:false,verticalMirror:false,coordinateSystemFlipped:false,subpixel:true}):undefined
  const w=dab.size,h=dab.size/tip.aspect,c=Math.cos(angle),s=Math.sin(angle)
  const ah=(tip.autoShape?.spikes??2)>2?w:h
  const width=transform?.width??Math.max(1,Math.ceil(Math.abs(c)*w+Math.abs(s)*ah)),height=transform?.height??Math.max(1,Math.ceil(Math.abs(s)*w+Math.abs(c)*ah)),left=transform?.x??Math.floor(dab.x-width/2),top=transform?.y??Math.floor(dab.y-height/2)
  if(noise&&execution?.brushRandom?.strokeSeed===undefined)throw Error('Sketch194 noise requires captured stroke seed')
  if(tip.color&&'gradient'in tip.color&&!execution?.brushSource?.gradient)throw Error('Sketch194 gradient requires captured palette')
  const noiseKey=noise?autoMaskNoiseKey(execution!.brushRandom!.strokeSeed,ordinal,0,0):0
  const sample=(mx:number,my:number):number=>{
   if(frame&&transform){
    const u=(mx+.5)/width*2-1,v=(my+.5)/height*2-1
    const x=transform.sampleX[0]*u+transform.sampleX[1]*v+transform.sampleX[2]-.5,y=transform.sampleY[0]*u+transform.sampleY[1]*v+transform.sampleY[2]-.5
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy
    const a=(frame.at(ix,iy)*(1-fx)+frame.at(ix+1,iy)*fx)*(1-fy)+(frame.at(ix,iy+1)*(1-fx)+frame.at(ix+1,iy+1)*fx)*fy
    if(frame.gray){const gray=(frame.grayAt(ix,iy)*(1-fx)+frame.grayAt(ix+1,iy)*fx)*(1-fy)+(frame.grayAt(ix,iy+1)*(1-fx)+frame.grayAt(ix+1,iy+1)*fx)*fy;return Math.floor(a*sampleBrushGradient(execution!.brushSource!,Math.floor(gray+.5)/255).alpha+.5)}
    return Math.floor(a+.5)
   }
   const x=mx-width/2,y=my-height/2
   if(profile?.kind==='circleBand'){const q=x*x+y*y,r=w/2,band=(q-r*r)/((r+1)**2-r*r);return band>1?0:band>0?Math.floor((1-band)*255):255}
   if(!profile)throw Error('Sketch194 generated mask profile missing')
   return proceduralMaskAlpha(x,y,w,h,profile,angle,lookup,1,radial,tip.autoShape?.spikes??2,rectangle)
  }
  return{left,top,width,height,radius:Math.max(width,height)/2,generated:true,contains(px,py){
   if(px<left||py<top||px>=left+width||py>=top+height)return false
   const mx=qRound(px-dab.x+width/2),my=qRound(py-dab.y+height/2)
   if(mx<0||my<0||mx>=width||my>=height)return false
   const alpha=sample(mx,my)
   return(noise?autoMaskNoiseAlpha(alpha,noise,noiseKey,mx,my):alpha)!==0
  }}
 }}
}
