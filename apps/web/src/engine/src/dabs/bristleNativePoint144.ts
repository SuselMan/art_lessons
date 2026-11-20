/** Revision144 changes mesh support only. The native142 point shader stays
 * unchanged. Four pixels cover truncation-to-zero's forward splat plus the
 * stepped major-axis endpoint overshoot, in both local axes. */
export function bristleNativePoint144Quad(start:readonly[number,number],end:readonly[number,number]){
 const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy)
 return{cx:(start[0]+end[0])/2,cy:(start[1]+end[1])/2,ux:length?dx/length:1,uy:length?dy/length:0,halfLength:length/2+4,halfWidth:4}
}
