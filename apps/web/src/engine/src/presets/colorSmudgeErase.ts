/** Functional PM reference for native foreground erase. Native straight RGB
 * is retained while alpha is attenuated. This is not a final-target eraser. */
export function colorSmudgeEraseReference(destination:readonly[number,number,number,number],foregroundAlpha:number):[number,number,number,number]{
 if(!Number.isFinite(foregroundAlpha)||foregroundAlpha<0||foregroundAlpha>1||destination.some(v=>!Number.isFinite(v)||v<0||v>1)||destination.slice(0,3).some(v=>v>destination[3]))throw RangeError('Invalid premultiplied erase input')
 const keep=1-foregroundAlpha
 return[destination[0]*keep,destination[1]*keep,destination[2]*keep,destination[3]*keep]
}
