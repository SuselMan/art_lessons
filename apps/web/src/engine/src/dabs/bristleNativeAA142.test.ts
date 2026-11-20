import{expect,it}from'vitest'
import{bristleNativeAA142Alpha,bristleNativeAA142Bounds}from'./bristleNativeAA142'
/** Literal native trajectory loop, intentionally walks the entire path rather
 * than using the shader/reference's bounded inverse lookup. No GPU claim. */
function native(start:readonly[number,number],end:readonly[number,number],alpha:number){
 const out=new Map<string,number>(),path:[[number,number]]=[[...start]],dx=end[0]-start[0],dy=end[1]-start[1];let x=Math.trunc(start[0]),y=Math.trunc(start[1]),fx=start[0],fy=start[1],m=dy/dx
 if(Math.abs(m)>1){const incr=dy>0?1:-1;m=dy>0?1/m:-1/m;while(y!==Math.trunc(end[1])){fx+=m;fy+=incr;y+=incr;path.push([fx,fy])}}
 else{const incr=dx>0?1:-1;if(dx<=0)m=-m;while(x!==Math.trunc(end[0])){fy+=m;fx+=incr;x+=incr;path.push([fx,fy])}}
 path.push([...end]);path.pop() // HairyBrush removes appended end, not stepped point.
 for(const[x,y]of path){const ix=Math.trunc(x),iy=Math.trunc(y),fx=Math.abs(x-ix),fy=Math.abs(y-iy);for(const[ox,oy,w]of[[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){const key=`${ix+ox},${iy+oy}`,a=Math.floor(w*alpha+.5);out.set(key,Math.floor(a+(out.get(key)??0)*(255-a)/255+.5))}}
 return out
}
it('bounds native horizontal/vertical/diagonal and negative truncation folds with seven unique ordered candidates',()=>{
 const lines:readonly[readonly[number,number],readonly[number,number]][]=[[[.25,.5],[3.8,.5]],[[3.8,.5],[.25,.5]],[[-.2,.25],[2.8,.25]],[[-2.8,-1.3],[2.7,1.45]],[[1.5,3.25],[-.5,-4.75]],[[-.9,-.9],[-.8,-.8]],[[0,0],[0,0]],[[.1,-.2],[.1,5.7]]]
 for(const[start,end]of lines)for(const alpha of[64,128,255]){const expected=native(start,end,alpha),bounds=bristleNativeAA142Bounds({start,end});for(let y=Math.floor(bounds.minY)-1;y<=Math.ceil(bounds.maxY)+1;y++)for(let x=Math.floor(bounds.minX)-1;x<=Math.ceil(bounds.maxX)+1;x++){const a=bristleNativeAA142Alpha(start,end,[x,y],alpha);expect(a,`${start}→${end} @${x},${y}`).toBe(expected.get(`${x},${y}`)??0);if(a){expect(x+.5).toBeGreaterThan(bounds.minX);expect(x+.5).toBeLessThan(bounds.maxX);expect(y+.5).toBeGreaterThan(bounds.minY);expect(y+.5).toBeLessThan(bounds.maxY)}}}
})
it('excludes only the final appended cap and preserves native negative zero-fold contributions',()=>{
 expect(bristleNativeAA142Alpha([.25,.5],[.8,.5],[1,0],255)).toBe(32)
 expect(bristleNativeAA142Alpha([-.9,-.9],[-.8,-.8],[1,1],255)).toBe(207)
 const expected=native([-.2,.25],[2.8,.25],255);expect(bristleNativeAA142Alpha([-.2,.25],[2.8,.25],[1,0],255)).toBe(expected.get('1,0'))
})
