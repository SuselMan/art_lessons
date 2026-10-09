/** Readonly actual128 donor algebra. Explicit passStride/step, whole1024 world.
 * Produces fractions per coarse cell; high ROI moves by EXACT8*passStride worldpx.
 * No time conversion, no velocity assumption, no new pressure solver.
 */
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
export function actual128DonorFractions({pressure,path,fluid,oldP,passStride,passStep,options,epoch,worldSize=1024}){
 if(worldSize!==1024||!Number.isInteger(epoch)||epoch<0||!Number.isInteger(passStep)||passStep<0||![1,2,4,8,16].includes(passStride)||pressure?.length!==65536||path?.length!==65536||fluid?.length!==16384||oldP?.length!==65536)throw Error('Exact actual128 driver dimensions/world/epoch/pass required');
 const {band,rate,travel,pow,costMax,effectiveWet,wetLo,wetHi,pathMode=1}=options??{};if(![band,rate,travel,pow,costMax,effectiveWet,wetLo,wetHi,pathMode].every(Number.isFinite)||band<=0||rate<0||rate>1||travel<0||travel>1||wetHi<=wetLo)throw Error('Actual captured uniform contract');
 for(const a of [pressure,path,fluid,oldP])if(!a.every(v=>Number.isFinite(v)&&v>=0))throw Error('Finite nonnegative actual fields required');
 const n=128,out=new Float64Array(n*n*4),cost=i=>pressure[i*4],cap=i=>1-.85*smooth(0,band,cost(i));
 const pathAllowed=(i,d)=>{let a=path[i*4+d];if(pathMode>1.5)a=Math.floor(Math.floor(a*255+.5)/passStride)%2;return a>=.5};
 const weight=(i,j,d)=>{const ci=cost(i),cj=cost(j);if(cj>band)return 0;const delta=(cj-ci)*costMax;if(delta>1e-3&&pathMode>.5&&!pathAllowed(i,d))return 0;if(delta<=1e-3){if(effectiveWet<=0||ci>1e-5||cj>1e-5||passStride>8)return 0;let minV=4*Math.min(fluid[i],fluid[j]);if(minV<=0)return 0;const step=(j-i)/passStride;for(let p=1;p<passStride;p++){const k=i+step*p;if(cost(k)>1e-5||fluid[k]<=0)return 0;minV=Math.min(minV,4*fluid[k]);}return 4**pow*smooth(wetLo,wetHi,minV)}return Math.min(passStride/delta,4)**pow*(1-smooth(0,band,cj))**1.6};
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,ci=cost(i),m=oldP[i*4+3];if(ci>band||m<=0)continue;const neighbours=[[x+passStride,y],[x-passStride,y],[x,y+passStride],[x,y-passStride]].map(([xx,yy])=>xx>=0&&yy>=0&&xx<n&&yy<n?yy*n+xx:-1),weights=neighbours.map((j,d)=>j<0?0:weight(i,j,d)),sum=weights.reduce((a,b)=>a+b,0);if(sum<=0)continue;for(let d=0;d<4;d++){const j=neighbours[d],w=weights[d];if(j<0||w<=0)continue;const capI=cap(i),capJ=cap(j);let pair=2*capI*capJ/(capI+capJ);if(ci<=1e-5&&cost(j)<=1e-5)pair*=w/4**pow;const Ti=travel*m/capI,Tj=travel*oldP[j*4+3]/capJ;out[i*4+d]=rate*w/sum*Math.min(Math.max(Ti-Tj,0)*pair,travel*m)/Math.max(m,5e-5)}}
 return{fractions:out,epoch,passStep,passStride,worldHopPx:8*passStride,options:{...options},limitations:['Exact donor algebra under provided normalized fields; capillaryRIDGE=1 actual constant','Provided fluid at coarse sample centres; GPU filtering must match capture sampling separately','No wall-time velocity conversion; one call equals one captured carry pass']};
}
export function liftActual128Fractions({driver,origin,side,highWet}){
 if(!driver||!Array.isArray(origin)||origin.length!==2||origin.some(v=>!Number.isInteger(v)||v<0||v%8)||![128,256].includes(side)||highWet?.length!==side*side||origin.some(v=>v+side>1024))throw Error('Aligned8px bounded highROI mapping required');const f=new Float64Array(side*side*4);let boundaryDemand=0,blockedDryEdges=0;const hop=driver.worldHopPx;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;if(!highWet[i])continue;const cx=Math.floor((origin[0]+x)/8),cy=Math.floor((origin[1]+y)/8);if(cx>=128||cy>=128)throw Error('ROI outsideworld');for(const[d,dx,dy]of [[0,1,0],[1,-1,0],[2,0,1],[3,0,-1]]){const value=driver.fractions[(cy*128+cx)*4+d];if(value<=0)continue;const xx=x+dx*hop,yy=y+dy*hop;if(xx<0||yy<0||xx>=side||yy>=side){boundaryDemand+=value;continue}let allowed=true;for(let t=1;t<=hop;t++)if(!highWet[(y+dy*t)*side+x+dx*t]){allowed=false;break}if(!allowed){blockedDryEdges++;continue}f[i*4+d]=value}}
 return{fractions:f,hop,epoch:driver.epoch,passStep:driver.passStep,passStride:driver.passStride,boundaryDemand,blockedDryEdges,limitations:['High wet path forbids narrow gaps missed by actual coarse sampling; this is a deliberate stricter preview safety gate','Do not execute if boundaryDemand>0; grow/admit fallback before transport','No altered worldstride/time; hop stays8*actualpassStride']};
}

/** One captured carry pass, shared fractions for all eight moments. */
export function applyLiftedPairedDriver({source,side,lift}){
 if(![128,256].includes(side)||source?.length!==side*side*8||lift?.fractions?.length!==side*side*4||!Number.isInteger(lift.hop)||lift.hop<=0)throw Error('Paired lifted dimensions required');
 if(lift.boundaryDemand!==0)throw Error('ROI boundary requires fallback');
 if(!source.every(v=>Number.isFinite(v)&&v>=0))throw Error('Positive finite source required');
 const out=new Float64Array(source.length),directions=[[1,0],[-1,0],[0,1],[0,-1]];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const i=y*side+x;let sum=0;
  for(let d=0;d<4;d++){const f=lift.fractions[i*4+d];if(!Number.isFinite(f)||f<0)throw Error('Invalid donor fraction');sum+=f;}
  if(sum>1)throw Error('Donor exceeds available mass');
  for(let c=0;c<8;c++)out[i*8+c]+=source[i*8+c]*(1-sum);
  for(let d=0;d<4;d++){const f=lift.fractions[i*4+d];if(f===0)continue;const [dx,dy]=directions[d],xx=x+dx*lift.hop,yy=y+dy*lift.hop;if(xx<0||yy<0||xx>=side||yy>=side)throw Error('Lift escaped admitted ROI');const j=yy*side+xx;for(let c=0;c<8;c++)out[j*8+c]+=source[i*8+c]*f;}
 }
 return {moments:out,epoch:lift.epoch,passStep:lift.passStep,passStride:lift.passStride,hop:lift.hop};
}
