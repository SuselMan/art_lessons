const f=Math.fround;
export function originalTexel(q,n,offset,{flip=false}={}){
 const px=flip?f(f(n-q)-.5):f(q+.5),uv=f(px/n),dir=f(offset.stride/n),sampleUv=f(uv+f(offset.tap*dir));
 const index=Math.max(0,Math.min(n-1,Math.floor(f(sampleUv*n))));return flip?n-1-index:index;
}
export function integerTexel(q,n,{tap,stride},flip=false){return Math.max(0,Math.min(n-1,q+(flip?-1:1)*tap*stride))}
export function coordinateProof(n,stride){let mismatches=0,witness=null;for(let q=0;q<n;q++)for(let tap=-1;tap<=1;tap++)for(const flip of [false,true]){const original=originalTexel(q,n,{tap,stride},{flip}),integer=integerTexel(q,n,{tap,stride},flip);if(original!==integer){mismatches++;witness??={q,tap,flip,original,integer}}}return{n,stride,mismatches,witness}}
// Same scalar f32 j/i order, product, accumulation and terminal Q8 conversion.
export function mode5Pixel(load){let s=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const wx=i===0?2:1,wy=j===0?2:1;s=f(s+f(f(wx*wy)*load(i,j)))}return Math.round(f(s/16)*255)}
export function tileLoads(width,height,bx,by,stride,source){const side=8+2*stride,tile=new Float32Array(side*side);let loads=0;for(let lane=0;lane<64;lane++)for(let t=lane;t<tile.length;t+=64){const tx=t%side,ty=Math.floor(t/side),x=Math.max(0,Math.min(width-1,bx+tx-stride)),y=Math.max(0,Math.min(height-1,by+ty-stride));tile[t]=source[y*width+x]/255;loads++}return{tile,side,loads}}
