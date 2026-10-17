type Rect={x:number;y:number;width:number;height:number}
/** Read-only crop, in window-local GL coordinates. Solver geometry is unchanged. */
export function committedReadRect(field:Rect,cores:readonly Rect[]):Rect {
 const full={x:0,y:0,width:field.width,height:field.height}
 if(!cores.length)return full
 let x0=field.width,y0=field.height,x1=0,y1=0
 for(const core of cores){
  const x=core.x-field.x,y=field.height-(core.y-field.y)-core.height
  if(![x,y,core.width,core.height].every(Number.isSafeInteger)||core.width<=0||core.height<=0||x<0||y<0||x+core.width>field.width||y+core.height>field.height)return full
  x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+core.width);y1=Math.max(y1,y+core.height)
 }
 return {x:x0,y:y0,width:x1-x0,height:y1-y0}
}
