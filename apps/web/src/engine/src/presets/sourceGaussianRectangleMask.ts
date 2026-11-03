import {sourceGaussianBrowserErf as erf} from './sourceGaussianBionicErf'
import {sourceAutoSector} from './sourceAutoSector'
import {sourceAutoRectTransparency,sourceAutoSampleGrid} from './sourceAutoAntialias'
import {sourceCoverageEvaluator} from './sourceCoverageEvaluator'
/** Browser-number rectangular Gaussian law from pinned native generator. The
 * existing circle/installed arithmetic profiles are not reinterpreted. */
export function prepareSourceGaussianRectangleMask(r:{width:number;height:number;effectiveWidth:number;effectiveHeight:number;horizontalFade:number;verticalFade:number;centerX:number;centerY:number;cos:number;sin:number;spikes:number;antialias:boolean;maxPixels:number;maxWorkSamples:number}){
 r={...r}
 if(![r.width,r.height,r.maxPixels,r.maxWorkSamples].every(n=>Number.isSafeInteger(n)&&n>0)||r.width>4096||r.height>4096||![r.effectiveWidth,r.effectiveHeight,r.horizontalFade,r.verticalFade,r.centerX,r.centerY,r.cos,r.sin].every(Number.isFinite)||r.effectiveWidth<=0||r.effectiveHeight<=0||r.horizontalFade<0||r.horizontalFade>1||r.verticalFade<0||r.verticalFade>1)throw new RangeError('Invalid Gaussian rectangle request')
 const wx=(1-r.horizontalFade/2)*r.effectiveWidth*.1,wy=(1-r.verticalFade/2)*r.effectiveHeight*.1,xf=1/(Math.SQRT2*wx),yf=1/(Math.SQRT2*wy),hw=r.effectiveWidth*.5-2.5*wx,hh=r.effectiveHeight*.5-2.5*wy,alpha=255/(4*erf(hw*xf)*erf(hh*yf))
 if(![wx,wy,xf,yf,hw,hh,alpha].every(Number.isFinite)||wx<=0||wy<=0)throw new RangeError('Gaussian rectangle coefficient overflow')
 const n=sourceAutoSampleGrid(r.antialias,r.effectiveWidth,r.effectiveHeight),samplesPerPixel=n*n as 1|9|36,pixels=r.width*r.height
 if(pixels>r.maxPixels||pixels*samplesPerPixel>r.maxWorkSamples)throw new RangeError('Gaussian rectangle exceeds reserved work')
 const base=(x:number,y:number)=>255-(Math.trunc(alpha*(erf((hw+x)*xf)+erf((hw-x)*xf))*(erf((hh+y)*yf)+erf((hh-y)*yf)))&255)
 function* evaluate():Generator<number|null,void>{for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){let sum=0;for(let sy=0;sy<n;sy++)for(let sx=0;sx<n;sx++){const px=x+sx/n-r.centerX,py=y+sy/n-r.centerY,folded=sourceAutoSector(r.cos*px-r.sin*py,r.sin*px+r.cos*py,r.spikes);sum+=sourceAutoRectTransparency(folded[0],folded[1],r.effectiveWidth*.5,r.effectiveHeight*.5,r.antialias,base);yield sx===n-1&&sy===n-1?255-Math.trunc(sum/samplesPerPixel):null}}}
 return {coefficients:Object.freeze({xf,yf,hw,hh,alpha}),evaluator:sourceCoverageEvaluator({pixels,route:'browser-number',samplesPerPixel,stream:evaluate()})}
}
