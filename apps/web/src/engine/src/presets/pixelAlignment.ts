/** Sharpness aligns the transformed mask's top-left, not its centre. */
export function alignPixelMask(x:number,y:number,size:number,angle:number,strength:number,ratio:{width:number;height:number}):{x:number;y:number}{
 const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle)),w=size*ratio.width,h=size*ratio.height
 const hx=Math.max(1,c*w+s*h)/2,hy=Math.max(1,s*w+c*h)/2
 const round=(v:number)=>v<0?-Math.floor(-v+.5):Math.floor(v+.5)
 const left=x-hx,top=y-hy
 return{x:x+strength*(round(left)-left),y:y+strength*(round(top)-top)}
}
