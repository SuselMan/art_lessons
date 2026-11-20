import type{BrushDescriptor}from'@grafetto/shared'
import{gihFrameSampleTransform}from'../raster/gihFrameGeometry'
import type{BehaviorStamp}from'./brushBehavior'
import type{BrushExecutionContext}from'./brushExecutionContext'
import{importedAssetPixels}from'./importedBrushes'
import{prepareVariableGih,usesVariableGih,variableGihStamp}from'./gihFramePreparation'
import{prepareAutoMaskNoise}from'../raster/autoMaskNoise'
import{radialCurveTextureSide}from'../raster/radialCurve'
/** Whole-root admission occurs before this bounded metadata plan. It owns no
 * texture, pixels or descriptor clone; all resources remain in the stamp bank. */
export function prepareSprayMask194(brush:BrushDescriptor,execution?:BrushExecutionContext){
 const profile=brush.tip.profile,noise=brush.tip.autoNoise
 const lookup=profile&&'lookup'in profile?profile.lookup:undefined
 const lookupSide=lookup&&profile&&'resolution'in profile?radialCurveTextureSide(importedAssetPixels(lookup),profile.resolution):undefined
 const frames=usesVariableGih(brush.tip)?prepareVariableGih(brush,true):undefined
 const preparedNoise=noise&&(noise.density!==1||noise.randomness!==0)?prepareAutoMaskNoise(noise.density,noise.randomness):undefined
 if(preparedNoise&&execution?.brushRandom?.strokeSeed===undefined)throw Error('Spray194 noise requires captured seed')
 return{brush,profile,lookup,lookupSide,frames,noise:preparedNoise,gradient:execution?.brushSource?.gradient,application:brush.tip.color&&'planes'in brush.tip.color?'rgba':brush.tip.color&&'gradient'in brush.tip.color?'gradient':brush.tip.material?'lightness':'mask'}
}
export type SprayMask194=ReturnType<typeof prepareSprayMask194>

/** Shape4's authored image rectangle already carries source aspect; resource
 * Brush particles use a square native reference scale instead. */
export function spray194FrameGeometry(plan:SprayMask194,stamp:Pick<BehaviorStamp,'x'|'y'|'size'|'aspect'|'angle'|'flipX'|'flipY'|'frameIndex'|'frameCoordinateFlip'>){
 if(!plan.frames)return undefined
 if(!plan.brush.spray?.particle.image)return variableGihStamp(plan.brush,plan.frames,{...stamp,radius:stamp.size/2})
 const reference=plan.frames[0],frame=plan.frames[stamp.frameIndex??0]
 return gihFrameSampleTransform({reference:{width:reference.sourceWidth,height:reference.sourceHeight},selected:{width:frame.sourceWidth,height:frame.sourceHeight},cursor:[stamp.x,stamp.y],scale:stamp.size/reference.sourceHeight,ratio:1,rotation:stamp.angle,brushAngle:0,horizontalMirror:false,verticalMirror:false,coordinateSystemFlipped:false,subpixel:true})
}
