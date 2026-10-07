/** Read-only QA descriptors. Coordinates match WatercolorPasses.diffuseStep. */
export function diffusionStencilCells(meta, point, radius, knight, paperResolution=2048) {
  const {x0,y0,S,w,h,paper,paperScale}=meta;
  if(![x0,y0,S,w,h,paper.w,paper.h,paperScale,radius].every(Number.isFinite)||S<=0||w<=0||h<=0)throw Error('invalid actual diffuse geometry');
  const center=[Math.floor((point[0]+.5-x0)/S),h-1-Math.floor((point[1]+.5-y0)/S)];
  const step=Math.max(1,Math.round(radius/S));
  const directions=knight?[[2,1],[-2,-1],[1,2],[-1,-2],[-1,2],[1,-2],[-2,1],[2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  return [[0,0],...directions.map(([x,y])=>[x*step,y*step])].map(offset=>{
    const cell=[center[0]+offset[0],center[1]+offset[1]];
    const uv=[(cell[0]+.5)/w,(cell[1]+.5)/h];
    const outside=cell[0]<0||cell[1]<0||cell[0]>=w||cell[1]>=h;
    const paperUV=[((cell[0]+.5+x0/S)/(paper.w/S))*paperScale,((cell[1]+.5-(y0/S+h))/(paper.h/S))*paperScale];
    const t=paperUV.map(v=>v*paperResolution-.5),base=t.map(Math.floor),fraction=t.map((v,i)=>v-base[i]);
    const wrap=v=>(v%paperResolution+paperResolution)%paperResolution;
    return {offset,cell,uv,outside,paperUV,paperCells:[[0,0],[1,0],[0,1],[1,1]].map(([dx,dy])=>[wrap(base[0]+dx),wrap(base[1]+dy)]),fraction};
  });
}
/** Exact view bytes, not the entire backing buffer; no texture read or copy. */
export function uploadViewDescriptor(view) {
  if(!ArrayBuffer.isView(view))return {kind:'external-image-or-null',exactView:false};
  return {kind:view.constructor.name,byteOffset:view.byteOffset,byteLength:view.byteLength,backingByteLength:view.buffer.byteLength,exactView:true};
}
