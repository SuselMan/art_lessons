/** Native fade-maker principles. Inputs/outputs are TRANSPARENCY bytes; edge
 * stages truncate independently, including the rectangular corner second fade. */
const byte=(value:number)=>Math.trunc(value)&255
export function sourceAutoRectTransparency(x:number,y:number,halfWidth:number,halfHeight:number,antialias:boolean,base:(x:number,y:number)=>number):number{
 x=Math.abs(x);y=Math.abs(y)
 if(x>halfWidth||y>halfHeight)return 255
 if(!antialias)return base(x,y)
 const xs=halfWidth-1,ys=halfHeight-1
 if(x>xs){const initial=base(x,y);let value=byte(initial+(255-initial)*(x-xs));if(y>ys&&value<255)value=byte(value+(255-value)*(y-ys));return value}
 if(y>ys){const initial=base(x,y);return byte(initial+(255-initial)*(y-ys))}
 return base(x,y)
}
export function sourceAutoCircleFade(xcoeff:number,ycoeff:number,base:(distance:number)=>number){
 const xf=Math.max(0,(1/xcoeff-1)*xcoeff),yf=Math.max(0,(1/ycoeff-1)*ycoeff),start=((xf+yf)*.5)**2,value=base(start),coefficient=Math.max(0,255-value)/(1-start)
 return (distance:number,antialias:boolean)=>distance>1?255:antialias&&distance>start?byte(value+(distance-start)*coefficient):base(distance)
}
export function sourceAutoSampleGrid(antialias:boolean,width:number,height:number):1|3|6{return antialias&&Math.min(width,height)<10?Math.min(width,height)<1?6:3:1}
