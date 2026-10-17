import type {AlgorithmInput} from '../protocol'
export function coarseInput(input:AlgorithmInput,f:number){
 if(input.size!==1024||input.rgba.length!==1024**2*4||input.water.length!==1024**2||input.paper.length!==1024**2)throw Error('hydraulic input1024')
 const n=128,initial0=new Uint8Array(n*n*4),initial1=new Uint8Array(n*n*4),water=new Uint8Array(n*n*4),aux=new Uint8Array(n*n*4),minimum=new Uint8Array(n*n*4),maximum=new Uint8Array(n*n*4),margin=new Uint8Array(n*n*4)
 const put=(a:Uint8Array,i:number,x:number,y:number)=>{a[i]=x>>>8;a[i+1]=x&255;a[i+2]=y>>>8;a[i+3]=y&255}
 let blockedCells=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const j=(y*n+x)*4,sum=[0,0,0,0],lo=[255,255,255,255],hi=[0,0,0,0],gaps=[255,255,255];let waterSum=0,paperSum=0,minWater=255
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const i=(y*8+dy)*1024+x*8+dx;for(let c=0;c<4;c++){const v=input.rgba[i*4+c];sum[c]+=v;lo[c]=Math.min(lo[c],v);hi[c]=Math.max(hi[c],v)}for(let c=0;c<3;c++)gaps[c]=Math.min(gaps[c],input.rgba[i*4+3]-input.rgba[i*4+c]);waterSum+=input.water[i];paperSum+=input.paper[i];minWater=Math.min(minWater,input.water[i])}
  const code=sum.map(s=>Math.round(s/(64*255)*f*65535));put(initial0,j,code[0],code[1]);put(initial1,j,code[2],code[3]);put(water,j,Math.round(waterSum/(64*255)*65535/4),0)
  for(let c=0;c<4;c++){minimum[j+c]=lo[c];maximum[j+c]=hi[c]}for(let c=0;c<3;c++)margin[j+c]=gaps[c];margin[j+3]=minWater>0?255:0;aux[j]=minWater;aux[j+1]=Math.round(paperSum/64);aux[j+3]=255;if(!minWater)blockedCells++
 }
 return{initial0,initial1,water,aux,minimum,maximum,margin,blockedCells}
}
