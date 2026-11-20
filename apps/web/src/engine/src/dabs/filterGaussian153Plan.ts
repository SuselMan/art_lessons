import type{WorldRect}from'../buffers/tileMath'
/** Native neededRect uses kernelSize even for radius0; 153 convolution explicitly uses sigma.3 at radius0. */
export function planGaussian153(bounds:WorldRect,radiusX:number,radiusY:number):{bounds:WorldRect;needed:WorldRect;side:number}{
 if(![radiusX,radiusY].every(r=>Number.isFinite(r)&&r>=0&&r<=16)||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite)||bounds.maxX<=bounds.minX||bounds.maxY<=bounds.minY)throw Error('Invalid Gaussian153 geometry')
 const r={minX:Math.floor(bounds.minX),minY:Math.floor(bounds.minY),maxX:Math.ceil(bounds.maxX),maxY:Math.ceil(bounds.maxY)},hx=6*Math.ceil(.3*radiusX+.3),hy=6*Math.ceil(.3*radiusY+.3)
 const needed={minX:r.minX-hx,minY:r.minY-hy,maxX:r.maxX+hx,maxY:r.maxY+hy},side=Math.max(1,needed.maxX-needed.minX,needed.maxY-needed.minY)
 if(![r.minX,r.minY,r.maxX,r.maxY,needed.minX,needed.minY,needed.maxX,needed.maxY,side].every(Number.isSafeInteger))throw Error('Gaussian153 geometry overflow')
 return{bounds:r,needed,side}
}
