import type{WorldRect}from'../buffers/tileMath'
/** Native update2r is NOT convolutionreadsupport. read includes oldT outsideupdate. */
export function planUnsharp159(bounds:WorldRect,radius:number):{bounds:WorldRect;needed:WorldRect;update:WorldRect;side:number}{
 if(!Number.isFinite(radius)||radius<0||radius>16||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite)||bounds.maxX<=bounds.minX||bounds.maxY<=bounds.minY)throw new RangeError('Unsharp159 geometry')
 const r={minX:Math.floor(bounds.minX),minY:Math.floor(bounds.minY),maxX:Math.ceil(bounds.maxX),maxY:Math.ceil(bounds.maxY)},pad=Math.trunc(2*radius),reach=3*Math.ceil(.3*radius+.3),halo=Math.max(pad,reach)
 const update={minX:r.minX-pad,minY:r.minY-pad,maxX:r.maxX+pad,maxY:r.maxY+pad},needed={minX:r.minX-halo,minY:r.minY-halo,maxX:r.maxX+halo,maxY:r.maxY+halo},side=Math.max(needed.maxX-needed.minX,needed.maxY-needed.minY)
 if(![...Object.values(r),...Object.values(update),...Object.values(needed),side,needed.minX+side,needed.minY+side].every(Number.isSafeInteger))throw new RangeError('Unsharp159 geometry overflow')
 return{bounds:r,needed,update,side}
}
