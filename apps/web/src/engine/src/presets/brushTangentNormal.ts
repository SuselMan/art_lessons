// Equations adapted from KisTangentTiltOption, Wolthera van Hövell tot Westerflier (2015).
// SPDX-License-Identifier: LGPL-2.0-or-later
import type {BrushTangentNormal,Dab} from '@grafetto/shared'

/** Krita KisTangentTiltOption: angular interpolation (including its wrap seam),
 * integer elevation, six channel swizzles, RGB8 output. No foreground colour. */
export function tangentNormalColor(option:BrushTangentNormal,dab:Dab,canvasRotation:number):[number,number,number] {
  const x=Math.max(-1,Math.min(1,dab.tiltX/60)),y=Math.max(-1,Math.min(1,dab.tiltY/60))
  const divisor=Math.sqrt(1+Math.min(x*x,y*y))
  let elevation=Math.acos(Math.min(1,Math.hypot(x,y)/divisor))*180/Math.PI
  const tilt=(Math.PI+(dab.tiltX===0&&dab.tiltY===0?-Math.PI/2:Math.atan2(-dab.tiltX,dab.tiltY)))*180/Math.PI
  const path=270+(dab.sourceAngle??dab.angle)*180/Math.PI
  let direction=option.direction==='direction'?path:option.direction==='mix'?tilt*(1-option.mix)+path*option.mix:tilt
  if(option.direction==='direction')elevation=0
  else direction-=canvasRotation*180/Math.PI
  elevation=Math.trunc(elevation*option.elevationSensitivity+90*(1-option.elevationSensitivity))*Math.PI/180
  direction*=Math.PI/180
  const values=[.5+.5*Math.cos(elevation)*Math.sin(direction),.5+.5*Math.cos(elevation)*Math.cos(direction),Math.sin(elevation)]
  return option.channels.map(channel=>{
    const value=values[Math.floor(channel/2)]!,swizzled=channel%2?1-value:value
    return Math.round(Math.max(0,Math.min(1,swizzled))*255)/255
  }) as [number,number,number]
}
