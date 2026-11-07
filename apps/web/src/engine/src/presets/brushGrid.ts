import{mixWeightedRgba8,type Rgba8}from'./mixWeightedRgba8'
import type{BrushGrid,Dab}from'@grafetto/shared'
import{brushDabRandom}from'./digitalBrushPresets'
export interface GridCell{x:number;y:number;width:number;height:number;sampleX:number;sampleY:number;alpha:number;hsv?:readonly[number,number,number]}
export function gridCells(g:BrushGrid,dab:Dab,seed:number):GridCell[]{
 const input={x:Math.fround(dab.x),y:Math.fround(dab.y),size:Math.fround(dab.size),pressure:Math.fround(dab.pressure)}
 const cw=g.width*g.scale,ch=g.height*g.scale,division=Math.max(1,Math.floor(g.scale*(g.pressureDivision?Math.trunc(g.division*input.pressure):g.division)+.5)),sx=cw/division,sy=ch/division,nx=Math.ceil(input.size/sx),ny=Math.ceil(input.size/sy)
 // Reject pathological requests before any allocation/read; never truncate a
 // frame-dependent prefix of cells. Normal 20px Pixelize up to1000px fits.
 if(!Number.isFinite(nx*ny)||nx*ny>4096||nx<1||ny<1)return[]
 let x=input.x-input.size/2+cw/2-g.offset[0],y=input.y-input.size/2+ch/2-g.offset[1];x=x-x%cw+g.offset[0];y=y-y%ch+g.offset[1]
 const random=(n:number)=>brushDabRandom(seed,n),factor=g.randomBorder?random(0):1,bx=g.border[0]*factor,by=g.border[1]*(g.randomBorder&&g.border[0]!==g.border[1]?random(1):factor),out:GridCell[]=[]
 for(let yy=0;yy<ny;yy++)for(let xx=0;xx<nx;xx++){const cx=x+(xx+.5)*sx,cy=y+(yy+.5)*sy,r=g.randomOpacity?random(g.colorPerCell?2+yy*nx+xx:2):1;out.push({x:cx,y:cy,width:Math.abs(sx-2*bx),height:Math.abs(sy-2*by),sampleX:g.colorPerCell?cx:x+sx/2,sampleY:g.colorPerCell?cy:y+sy/2,alpha:r*r,...(g.hsv?{hsv:gridHsv(g,seed,g.colorPerCell?yy*nx+xx:0)}:{})})}
 return out
}

/** Independent stream: enabling colour controls never shifts border/opacity draws.
 * Values are captured once per logical request, before any physical tile loop. */
export function gridHsv(g:BrushGrid,seed:number,index:number):readonly[number,number,number]{
 const h=g.hsv
 return h?[h.hue*brushDabRandom(seed,0x710000+index*3),h.saturation*brushDabRandom(seed,0x710001+index*3),h.value*brushDabRandom(seed,0x710002+index*3)]:[0,0,0]
}
/** Native background rectangle is one aligned base cell, not the brush union. */
export function gridBackgroundRect(g:BrushGrid,dab:Dab):{minX:number;minY:number;maxX:number;maxY:number}{
 const cw=g.width*g.scale,ch=g.height*g.scale,size=Math.fround(dab.size)
 let x=Math.fround(dab.x)-size/2+cw/2-g.offset[0],y=Math.fround(dab.y)-size/2+ch/2-g.offset[1]
 x=x-x%cw+g.offset[0];y=y-y%ch+g.offset[1]
 return{minX:Math.floor(x),minY:Math.floor(y),maxX:Math.ceil(x+cw),maxY:Math.ceil(y+ch)}
}

/** Native pressure weights truncate independently, deliberately totaling 254
 * for many pressures. Alpha normalization remains 255. */
export function gridBackgroundMix(color:Rgba8,background:Rgba8,pressure:number):Rgba8{
 if(!Number.isFinite(pressure))throw new RangeError('Invalid Grid pressure')
 const p=Math.max(0,Math.min(1,pressure))
 return mixWeightedRgba8([color,background],[Math.trunc(p*255),Math.trunc((1-p)*255)],255)
}
