import{expect,it}from'vitest'
import{bristleNativePoint144Quad}from'./bristleNativePoint144'
import{bristleNativeAA142Alpha}from'./bristleNativeAA142'
it('144 oriented pad contains every literal native splat, including zero-fold, overshoot and tile edges',()=>{
 let seed=144;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const lines:([number,number][])[]=[[[0,0],[0,0]],[[-.9,-.9],[-.8,-.8]],[[-.2,.25],[2.8,.25]],[[511.75,511.25],[520.1,520.9]],[[-512.2,-511.9],[-499.1,-530.7]]]
 for(let i=0;i<1000;i++){const s:[number,number]=[(rnd()-.5)*1100,(rnd()-.5)*1100];lines.push([s,[s[0]+(rnd()-.5)*100,s[1]+(rnd()-.5)*100]])}
 for(const[start,end]of lines){const q=bristleNativePoint144Quad(start as[number,number],end as[number,number]),dx=end[0]-start[0],dy=end[1]-start[1],major=Math.abs(dy)>Math.abs(dx)?1:0,den=Math.abs(major?dy:dx),steps=Math.abs(Math.trunc(end[major])-Math.trunc(start[major]));
  // Independently enumerate trajectory candidates and all four addressed pixels.
  for(let k=0;k<=steps;k++){const x=start[0]+(den?dx/den:0)*k,y=start[1]+(den?dy/den:0)*k;for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){const px=Math.trunc(x)+ox,py=Math.trunc(y)+oy;if(!bristleNativeAA142Alpha(start as[number,number],end as[number,number],[px,py],255))continue;const rx=px+.5-q.cx,ry=py+.5-q.cy;expect(Math.abs(rx*q.ux+ry*q.uy)).toBeLessThan(q.halfLength);expect(Math.abs(-rx*q.uy+ry*q.ux)).toBeLessThan(q.halfWidth)}}
 }
})
it('144 has linear mesh area and deterministic zero-length axis; 142 shader remains separate',()=>{const q=bristleNativePoint144Quad([0,0],[1000,1000]);expect(4*q.halfLength*q.halfWidth).toBeLessThan(12000);expect(bristleNativePoint144Quad([3,4],[3,4])).toEqual({cx:3,cy:4,ux:1,uy:0,halfLength:4,halfWidth:4})})
