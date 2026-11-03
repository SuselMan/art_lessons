/** Post-material alpha threshold, independent of outline alignment. Native
 * Sharpness keeps the original alpha inside the soft band; it is not a ramp. */
export function canonicalSharpnessAlphaU8(alpha:number,threshold:number,softness:number):number {
  if(!Number.isInteger(alpha)||alpha<0||alpha>255||!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isInteger(softness)||softness<0||softness>100)throw new TypeError('Invalid Sharpness material parameters')
  const tolerance=Math.trunc(255-threshold*255)
  if(alpha>tolerance)return 255
  return alpha<=Math.floor((100-softness)*tolerance/100)?0:alpha
}
