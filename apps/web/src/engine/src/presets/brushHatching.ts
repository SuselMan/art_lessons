import type{BrushHatching}from'@grafetto/shared'
export interface HatchingPlacement{angles:number[];separation:number;thickness:number}
/** Cross passes and dyadic separation bins follow the native option rules. */
export function hatchingPlacement(h:BrushHatching,controls:{angle:number;cross:number;separation:number;thickness:number}):HatchingPlacement{
 const angles:number[]=[],spin=(degrees:number)=>h.angle+degrees,checked=h.dynamics?.cross!==undefined,value=controls.cross
 if(h.style==='perpendicular'&&(!checked||value>.5))angles.push(spin(90))
 if(h.style==='minusPlus'||h.style==='plusMinus'){const sign=h.style==='minusPlus'?-1:1;if(!checked||value>.33)angles.push(spin(45*sign));if(!checked||value>.67)angles.push(spin(-45*sign))}
 if(h.style==='moire')angles.push(spin(checked?value*360:-10))
 if(h.dynamics?.angle)angles.push(spin(controls.angle*360+h.angle));else if(h.style!=='moire')angles.push(h.angle)
 let separation=h.separation
 if(h.dynamics?.separation){const bin=Math.max(0,Math.min(h.intervals-1,Math.ceil(controls.separation*h.intervals)-1)),base=Math.floor(h.intervals/2)-(h.intervals%2===0?1:0);separation*=2**(base-bin)}
 return{angles:angles.map(a=>a*Math.PI/180),separation,thickness:Math.max(1,Math.floor(h.thickness*controls.thickness+.5))}
}
/** Reduce world phase on CPU, preserving tile seams even far from origin. */
export function hatchingPlane(angle:number,separation:number,origin:readonly[number,number],tileX:number,tileY:number,subpixel:boolean):[number,number,number,number]{
 const nx=-Math.sin(angle),ny=Math.cos(angle),period=subpixel||Math.abs(ny)<1e-8?separation:Math.max(.1,Math.floor(separation/Math.abs(ny))*Math.abs(ny)),v=nx*(tileX-origin[0])+ny*(tileY-origin[1]);return[nx,ny,((v%period)+period)%period,period]
}
