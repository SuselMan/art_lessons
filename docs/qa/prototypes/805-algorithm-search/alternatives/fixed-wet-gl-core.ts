import type {Input} from './gpu'
/** CPU geometry/partition shared only by the three opt-in coarse GL families. */
export function fixedWetOption(config:Record<string,number>){const value=config.fixedInitialWet??0;if(value!==0&&value!==1)throw Error('fixedInitialWet must be0/1');return value===1}
export function partitionFixedGL(input:Input,n:number){
 const size=input.size,r=size/n,N=size*size;if(!Number.isInteger(size)||!Number.isInteger(n)||!Number.isInteger(input.seed)||!Number.isInteger(r)||r<1||r>8||input.rgba.length!==N*4||input.water.length!==N||input.paper.length!==N)throw Error('Fixed GL partition dimensions')
 const rgba=new Uint8Array(n*n*4),aux=new Uint8Array(n*n*4),rawAux=new Uint8Array(N*4),active=new Uint8Array(n*n),raw=[0,0,0,0],bulk=[0,0,0,0],partial=[0,0,0,0],literal=[0,0,0,0],coarse=[0,0,0,0];let partialPixels=0,wetPixels=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const sums=[0,0,0,0,0,0],area=r*r;let full=true
  for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++){const i=(y*r+dy)*size+x*r+dx;full&&=input.water[i]>0;for(let k=0;k<4;k++){const v=input.rgba[i*4+k];if(v>input.rgba[i*4+3])throw Error('Fixed GL bounded carrier required');sums[k]+=v} sums[4]+=input.water[i];sums[5]+=input.paper[i]}
  const j=y*n+x;active[j]=Number(full);aux[j*4]=full?Math.round(sums[4]/area):0;aux[j*4+1]=Math.round(sums[5]/area);aux[j*4+2]=full?255:0;aux[j*4+3]=255
  for(let k=0;k<4;k++)if(full){rgba[j*4+k]=Math.round(sums[k]/area);coarse[k]+=rgba[j*4+k]*area}
  for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++){const i=(y*r+dy)*size+x*r+dx,wet=input.water[i]>0,kind=wet?(full?1:2):0;wetPixels+=Number(wet);partialPixels+=Number(kind===2);rawAux[i*4]=input.water[i];rawAux[i*4+1]=input.paper[i];rawAux[i*4+2]=kind;rawAux[i*4+3]=255;for(let k=0;k<4;k++){const v=input.rgba[i*4+k];raw[k]+=v;(kind===0?literal:kind===1?bulk:partial)[k]+=v}}
 }
 return{rgba,aux,rawAux,active,summary:{raw,bulk,partial,literal,coarseQuantizedExpanded:coarse,coarseQuantizationDelta:coarse.map((v,k)=>v-bulk[k]),activeCells:active.reduce((a,b)=>a+b,0),partialPixels,wetPixels,coarseSize:n,fullSize:size}}
}
export function fixedPathCells(ax:number,ay:number,bx:number,by:number){const cells=new Set<string>(),steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));if(steps>8||![ax,ay,bx,by].every(Number.isInteger))throw Error('Fixed GL path bound');let px=ax,py=ay;cells.add(ax+','+ay);for(let k=1;k<=steps;k++){const x=Math.floor(ax+(bx-ax)*k/steps+.5),y=Math.floor(ay+(by-ay)*k/steps+.5);if(x!==px&&y!==py){cells.add(x+','+py);cells.add(px+','+y)}cells.add(x+','+y);px=x;py=y}return cells}
/** Exact byte-pair oracle: common quarter exchange, all four sums and premul preserved. */
export function fixedFinePair(a:readonly number[],b:readonly number[]){if(a.length!==4||b.length!==4||[...a,...b].some(v=>!Number.isInteger(v)||v<0||v>255)||a.some(v=>v>a[3])||b.some(v=>v>b[3]))throw Error('Pair carrier');const A=a.slice(),B=b.slice();for(let k=0;k<4;k++){const delta=b[k]-a[k],q=Math.sign(delta)*Math.floor((Math.abs(delta)*64+128)/256);A[k]+=q;B[k]-=q}if(A.some(v=>v>A[3])||B.some(v=>v>B[3]))throw Error('Pair premul');return{a:A,b:B}}
