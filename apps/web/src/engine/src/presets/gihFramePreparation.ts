import{assertUnequalLightnessGih124}from'./gihUnequalLightness124'
import{isOriginalRgbaGih119,isUnequalGradientGih126}from'@grafetto/shared'
import type {BrushDescriptor,BrushTip} from '@grafetto/shared'
import {importedAssetPixels} from './importedBrushes'
import {gihFrameMaskBounds,captureGihFrameMetadata,gihFrameSampleTransform,type GihFrameMetadata} from '../raster/gihFrameGeometry'
export function usesVariableGih(tip:BrushTip):boolean{return tip.animation?.geometry!==undefined||tip.sourceGeometry!==undefined}
export function prepareVariableGih(brush:BrushDescriptor,mask190=false):readonly GihFrameMetadata[]{
 const staticGeometry=brush.tip.sourceGeometry
 if(staticGeometry){
  if(!mask190||brush.version!==193&&brush.version!==194&&brush.version!==195||brush.tip.animation||brush.tip.kind!=='bitmap'||!brush.tip.mask)throw Error('Static source geometry requires whole Color Smudge193')
  const side=Math.sqrt(importedAssetPixels(brush.tip.mask).length),bounds=gihFrameMaskBounds({width:staticGeometry.width,height:staticGeometry.height},side)
  if(staticGeometry.version!==1||!brush.tip.maskBounds||(['x','y','width','height']as const).some(k=>!Object.is(brush.tip.maskBounds![k],bounds[k])))throw Error('Static source geometry differs from original padding')
  return Object.freeze([Object.freeze({sourceWidth:staticGeometry.width,sourceHeight:staticGeometry.height,maskBounds:bounds})])
 }
 const unequalLightness=assertUnequalLightnessGih124(brush,mask190),unequalGradient=isUnequalGradientGih126(brush)||(mask190&&!!brush.tip.animation?.geometry&&!!brush.tip.color&&'gradient'in brush.tip.color)
 const tip=brush.tip,a=tip.animation,g=a?.geometry,b=brush.behavior
 if(!mask190&&tip.color&&a&&['angular','xtilt','ytilt','dimensions'].includes(a.mode)&&!isOriginalRgbaGih119(brush)&&!unequalGradient)throw Error('Original RGBA sensor geometry requires unequal119 scope')
 if(!mask190&&(!g||brush.version<86||brush.model!=='stamp'||tip.kind!=='bitmap'||brush.mixer||(['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']as const).some(k=>brush[k]!==undefined)||b?.dual||tip.profile||tip.autoNoise||tip.autoShape||tip.imageSampling||tip.material&&!unequalLightness||b?.colorAdjustment||b?.edgeBleed||b?.rendering?.wetEdges||b?.dynamics?.sharpness||b?.modulations?.sharpness?.length))throw Error('Unsupported variable GIH geometry combination')
 if(!mask190&&tip.color&& !('planes' in tip.color)&&!unequalGradient)throw Error('Variable GIH gradient is unsupported')
 if(!g||g.version!==1||!a||g.frames.length!==a.frames.length)throw Error('Invalid variable GIH geometry')
 const sides=a.frames.map(id=>Math.sqrt(importedAssetPixels(id).length))
 const rows=captureGihFrameMetadata(g.frames,sides)
 if(!tip.maskBounds||(['x','y','width','height']as const).some(k=>!Object.is(tip.maskBounds![k],rows[0].maskBounds[k])))throw Error('Variable GIH reference bounds differ')
 if(tip.color&&'planes' in tip.color){const color=tip.color;if(!color.frames||color.frames.length!==rows.length)throw Error('Missing variable GIH colour frames');color.frames.forEach((planes,index)=>{if(planes.length!==3||planes.some(id=>importedAssetPixels(id).length!==sides[index]*sides[index]))throw Error('Variable GIH colour dimensions differ')})}
 if(unequalGradient&&tip.color&&'gradient'in tip.color){const gray=tip.color.gradient.grayFrames!;if(sides.some((side,index)=>side>512||importedAssetPixels(gray[index]).length!==side*side))throw Error('Unequal Gradient126 paired dimensions differ')}
 return rows
}
export function variableGihStamp(brush:BrushDescriptor,frames:readonly GihFrameMetadata[],s:{x:number;y:number;radius:number;aspect:number;angle:number;flipX:number;flipY:number;frameIndex?:number;frameCoordinateFlip?:boolean},subpixel=true){
 const index=(brush.version===193||brush.version===194||brush.version===195)&&brush.tip.sourceGeometry?0:s.frameIndex
 if(index===undefined||!Number.isInteger(index)||index<0||index>=frames.length)throw Error('Missing selected GIH frame index')
 const first=frames[0],frame=frames[index],longest=Math.max(first.sourceWidth,first.sourceHeight)
 return gihFrameSampleTransform({reference:{width:first.sourceWidth,height:first.sourceHeight},selected:{width:frame.sourceWidth,height:frame.sourceHeight},cursor:[s.x,s.y],scale:2*s.radius*s.aspect/longest,ratio:1/s.aspect,rotation:s.angle-brush.tip.angle,brushAngle:brush.tip.angle,horizontalMirror:s.flipX<0,verticalMirror:s.flipY<0,coordinateSystemFlipped:!!s.frameCoordinateFlip,subpixel})
}
