'use strict';
function grid(width,height,size,halo=2){
 for(const n of [width,height,size,halo])if(!Number.isSafeInteger(n)||n<1)throw Error('Positive integer dimensions required');
 if(halo>size)throw Error('Halo exceeds core');
 const tiles=[];
 for(let y=0;y<height;y+=size)for(let x=0;x<width;x+=size)tiles.push({x,y,w:Math.min(size,width-x),h:Math.min(size,height-y),halo});
 return tiles;
}
// Copy ONLY new cores into neighbouring new halos. All cores are complete
// before this list is executed. Includes diagonal neighbours and clipped edges.
function exchanges(tiles){const out=[];tiles.forEach((dst,di)=>tiles.forEach((src,si)=>{
 if(di===si)return;const h=dst.halo,x=Math.max(src.x,dst.x-h),y=Math.max(src.y,dst.y-h),r=Math.min(src.x+src.w,dst.x+dst.w+h),b=Math.min(src.y+src.h,dst.y+dst.h+h);
 if(r>x&&b>y)out.push({src:si,dst:di,sx:x-src.x+src.halo,sy:y-src.y+src.halo,dx:x-dst.x+h,dy:y-dst.y+h,w:r-x,h:b-y});
 }));return out;}
module.exports={grid,exchanges};
