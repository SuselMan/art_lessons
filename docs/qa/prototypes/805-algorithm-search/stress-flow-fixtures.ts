import type {AlgorithmInput} from './protocol'

/** Diagnostic inputs, not representative paintings or artistic acceptance tests. */
export const stressFlowIds=['stress-coarse-checker','stress-low-water-1','stress-low-water-4','stress-low-water-61','stress-low-water-255','stress-stationary-phase-a1','stress-stationary-phase-a2','stress-stationary-phase-a128','stress-stationary-phase-a254','stress-stationary-phase-a255'] as const
export function createStressFlowFixture(id:string,size=1024):AlgorithmInput{
 if(!stressFlowIds.includes(id as any)||size!==1024)throw Error('Unknown stress fixture or unsupported diagnostic size')
 const rgba=new Uint8Array(size*size*4),water=new Uint8Array(size*size),paper=new Uint8Array(size*size).fill(128)
 if(id==='stress-coarse-checker'){
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=y*size+x,p=i*4,cx=x>>3,cy=y>>3,parity=(cx+cy)&1
   const alpha=((cx*3+cy*5)%4===0)?255:((cx+2*cy)%3===0)?1:128
   water[i]=parity?255:4;paper[i]=parity?255:0
   rgba[p]=cx&1?alpha:0;rgba[p+1]=cy&1?alpha:Math.floor(alpha/2);rgba[p+2]=(cx+cy)&2?alpha:Math.floor(alpha/3);rgba[p+3]=alpha
  }
 }else if(id.startsWith('stress-low-water-')){
  const wet=Number(id.slice('stress-low-water-'.length))
  for(let y=256;y<768;y++)for(let x=256;x<768;x++){
   const i=y*size+x,p=i*4;water[i]=wet
   if((x-480)**2+(y-512)**2<24**2){rgba[p]=160;rgba[p+1]=40;rgba[p+3]=180}
   if((x-544)**2+(y-512)**2<24**2){rgba[p+1]=100;rgba[p+2]=160;rgba[p+3]=180}
  }
 }else{
  const alpha=Number(id.slice('stress-stationary-phase-a'.length))
  // 64 separated patches: every possible dry-pixel position within an8x8 cell.
  // Each patch has moving material around its dry pixel; no identity claim when
  // new wet pigment can arrive at that pixel. Literal stationary is a lower bound.
  for(let py=0;py<8;py++)for(let px=0;px<8;px++){
   const cx=px*128+64,cy=py*128+64
   for(let y=cy-16;y<cy+16;y++)for(let x=cx-16;x<cx+16;x++){
    const i=y*size+x,p=i*4;water[i]=180
    rgba[p]=24;rgba[p+1]=48;rgba[p+2]=16;rgba[p+3]=64
   }
   const i=(cy+py)*size+cx+px,p=i*4;water[i]=0
   rgba[p]=Math.floor(alpha/4);rgba[p+1]=Math.floor(alpha/2);rgba[p+2]=alpha;rgba[p+3]=alpha
  }
 }
 return{size,rgba,water,paper,seed:805,encoding:'optical-density'}
}
