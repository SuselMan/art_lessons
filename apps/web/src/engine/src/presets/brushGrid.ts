import type{BrushGrid,Dab}from'@grafetto/shared'
import{brushDabRandom}from'./digitalBrushPresets'
export interface GridCell{x:number;y:number;width:number;height:number;sampleX:number;sampleY:number;alpha:number}
export function gridCells(g:BrushGrid,dab:Dab,seed:number):GridCell[]{
 const input={x:Math.fround(dab.x),y:Math.fround(dab.y),size:Math.fround(dab.size),pressure:Math.fround(dab.pressure)}
 const cw=g.width*g.scale,ch=g.height*g.scale,division=Math.max(1,Math.floor(g.scale*(g.pressureDivision?Math.trunc(g.division*input.pressure):g.division)+.5)),sx=cw/division,sy=ch/division,nx=Math.ceil(input.size/sx),ny=Math.ceil(input.size/sy)
 // Reject pathological requests before any allocation/read; never truncate a
 // frame-dependent prefix of cells. Normal 20px Pixelize up to1000px fits.
 if(!Number.isFinite(nx*ny)||nx*ny>4096||nx<1||ny<1)return[]
 let x=input.x-input.size/2+cw/2-g.offset[0],y=input.y-input.size/2+ch/2-g.offset[1];x=x-x%cw+g.offset[0];y=y-y%ch+g.offset[1]
 const random=(n:number)=>brushDabRandom(seed,n),factor=g.randomBorder?random(0):1,bx=g.border[0]*factor,by=g.border[1]*(g.randomBorder&&g.border[0]!==g.border[1]?random(1):factor),out:GridCell[]=[]
 for(let yy=0;yy<ny;yy++)for(let xx=0;xx<nx;xx++){const cx=x+(xx+.5)*sx,cy=y+(yy+.5)*sy,r=g.randomOpacity?random(g.colorPerCell?2+yy*nx+xx:2):1;out.push({x:cx,y:cy,width:Math.abs(sx-2*bx),height:Math.abs(sy-2*by),sampleX:g.colorPerCell?cx:x+sx/2,sampleY:g.colorPerCell?cy:y+sy/2,alpha:r*r})}
 return out
}
