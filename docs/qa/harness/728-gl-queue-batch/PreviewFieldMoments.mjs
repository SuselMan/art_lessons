/** Pure bounded RGBA8 analysis. GL rows remain bottom-up; moment units are texels.
 * Each channel is reported separately: alpha is not silently interpreted as mass.
 */
export function previewFieldMoments(bytes,width,height){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||bytes.length!==width*height*4)throw Error('RGBA8 dimensions');
 return Array.from({length:4},(_,channel)=>{
  let sum=0,max=0,nonzero=0,sx=0,sy=0,sxx=0,syy=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=bytes[(y*width+x)*4+channel];if(!v)continue;sum+=v;max=Math.max(max,v);nonzero++;sx+=v*x;sy+=v*y;sxx+=v*x*x;syy+=v*y*y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  const centroid=sum?[sx/sum,sy/sum]:null;
  return{channel,sum,max,nonzero,bbox:sum?[minX,minY,maxX,maxY]:null,centroid,radialSecondMoment:sum?Math.max(0,(sxx+syy)/sum-centroid[0]**2-centroid[1]**2):0};
 });
}
