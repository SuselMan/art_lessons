/** Offline replay of existing WC_WATER_FRONT_FRAG min-plus expression.
 * Samples are ACTUAL full128 GPU-equivalent paper height/effective climb operands,
 * not synthesized from cropped fluid or a paper-name hash. No runtime integration.
 */
export function replayWaterFrontOperands({cost,seed,height,effectiveClimb,film,foreignFilm,foreignWet=0,costMax,dryCost,floor,stride,side=128}){
 const n=side*side;if(side!==128||![costMax,dryCost,floor,stride,foreignWet].every(Number.isFinite)||costMax<=0||dryCost<0||floor<0||!Number.isInteger(stride)||stride<1||stride>128)throw Error('Actual front dimensions/scalars');
 for(const a of[cost,seed,height,effectiveClimb,film,foreignFilm])if(a?.length!==n||!a.every(Number.isFinite))throw Error('Complete full128 finite operands required');
 const out=new Float64Array(n*4),dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;let best=cost[i]*costMax;let t=Math.max(0,Math.min(1,(Math.max(film[i],foreignWet*foreignFilm[i])-.02)/.13));const wet=t*t*(3-2*t);for(let k=0;k<8;k++){const [dx,dy]=dirs[k],xx=x+dx*stride,yy=y+dy*stride;if(xx<0||yy<0||xx>=side||yy>=side)continue;const j=yy*side+xx;if(cost[j]>=.999)continue;const relief=Math.max(floor*stride,stride+effectiveClimb[i]*(height[i]-height[j]));best=Math.min(best,cost[j]*costMax+(k<4?1:1.41421356)*relief*(dryCost+(1-dryCost)*wet));}out[i*4]=Math.min(best,costMax)/costMax;out[i*4+1]=height[i];out[i*4+2]=seed[i];out[i*4+3]=1;}
 return out;
}
