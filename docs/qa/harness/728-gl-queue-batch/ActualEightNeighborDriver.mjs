import{EIGHT_DIRECTIONS}from'./CommonEightNeighborTransport.mjs';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
/** Literal actual4 conductance + explicit diagonal extension; no canonical replacement. */
export function actual128EightDonorFractions({pressure,path,fluid,oldP,passStride,passStep,options,epoch,worldSize=1024},{axisOnly=false,rateScale=axisOnly?1:5/6}={}){
 if(worldSize!==1024||pressure?.length!==65536||path?.length!==65536||fluid?.length!==16384||oldP?.length!==65536||![1,2,4,8,16].includes(passStride)||!Number.isInteger(epoch)||epoch<0||!Number.isInteger(passStep)||passStep<0)throw Error('Actual8 dimensions/epoch/pass');
 const {band,rate,travel,pow,costMax,effectiveWet,wetLo,wetHi,pathMode=1}=options??{};if(![band,rate,travel,pow,costMax,effectiveWet,wetLo,wetHi,pathMode,rateScale].every(Number.isFinite)||band<=0||costMax<=0||rate<0||rate>1||travel<0||travel>1||wetHi<=wetLo||rateScale<0||rateScale>1)throw Error('Actual8 captured options');for(const a of [pressure,path,fluid,oldP])if(!a.every(v=>Number.isFinite(v)&&v>=0))throw Error('Actual8 positive finite inputs');
 const out=new Float64Array(16384*8),cost=i=>pressure[i*4],cap=i=>1-.85*smooth(0,band,cost(i));
 const flag=(i,d)=>{let v=path[i*4+d];if(pathMode>1.5)v=Math.floor(Math.floor(v*255+.5)/passStride)%2;return v>=.5};
 const weight=(i,j,d,dx,dy)=>{const ci=cost(i),cj=cost(j);if(cj>band)return 0;const delta=(cj-ci)*costMax;
  if(delta>1e-3&&pathMode>.5){if(d<4){if(!flag(i,d))return 0;}else if(!flag(i,dx>0?0:1)||!flag(i,dy>0?2:3))return 0;}
  if(d>=4){const x=i%128,y=Math.floor(i/128);for(let t=1;t<=passStride;t++){const xx=x+dx*t,yy=y+dy*t,a=(yy-dy)*128+xx,b=yy*128+xx-dx;if(cost(a)>band||cost(b)>band||fluid[a]<=0||fluid[b]<=0)return 0;}}
  if(delta<=1e-3){if(effectiveWet<=0||ci>1e-5||cj>1e-5||passStride>8)return 0;let v=4*Math.min(fluid[i],fluid[j]);if(v<=0)return 0;for(let t=1;t<passStride;t++){const k=i+(dy*128+dx)*t;if(cost(k)>1e-5||fluid[k]<=0)return 0;v=Math.min(v,4*fluid[k]);}return 4**pow*smooth(wetLo,wetHi,v);}
  return Math.min(passStride*(d<4?1:Math.SQRT2)/delta,4)**pow*(1-smooth(0,band,cj))**1.6;
 };
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=y*128+x,ci=cost(i),m=oldP[i*4+3];if(ci>band||m<=0)continue;const rows=[];for(let d=0;d<(axisOnly?4:8);d++){const[dx,dy]=EIGHT_DIRECTIONS[d],xx=x+dx*passStride,yy=y+dy*passStride;if(xx<0||yy<0||xx>=128||yy>=128){rows.push({j:-1,w:0,base:0});continue;}const j=yy*128+xx,base=weight(i,j,d,dx,dy);rows.push({j,base,w:base*(d<4?1:.25)});}const sum=rows.reduce((s,r)=>s+r.w,0);if(!sum)continue;rows.forEach(({j,base,w},d)=>{if(j<0||w<=0)return;const a=cap(i),b=cap(j);let pair=2*a*b/(a+b);if(ci<=1e-5&&cost(j)<=1e-5)pair*=base/4**pow;const Ti=travel*m/a,Tj=travel*oldP[j*4+3]/b;out[i*8+d]=rate*rateScale*w/sum*Math.min(Math.max(Ti-Tj,0)*pair,travel*m)/Math.max(m,5e-5);});}
 return{fractions:out,epoch,passStep,passStride,worldHopPx:8*passStride,rateScale,axisOnly,options:{...options},limitations:['Axial weights/path/capacity exactly literal actual4; diagonal conductance uses Euclidean length and quarter angular weight','Diagonal requires both source axial uphill flags plus wet/pressure support at orthogonal coarse corners','rateScale5/6 explicit flat-field second-moment calibration, no claim nonuniform pressure exactsameM2']};
}
export function liftActualEightFractions({driver,origin,side=128,highWet}){
 if(![128,256].includes(side)||driver?.fractions?.length!==16384*8||origin?.length!==2||origin.some(v=>!Number.isInteger(v)||v%8||v<0||v+side>1024)||highWet?.length!==side*side)throw Error('Actual8 aligned highROI');const fractions=new Float64Array(side*side*8),hop=driver.worldHopPx;let boundaryDemand=0,blockedDry=0;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;if(!highWet[i])continue;const ci=(Math.floor((origin[1]+y)/8)*128+Math.floor((origin[0]+x)/8));for(let d=0;d<8;d++){const f=driver.fractions[ci*8+d];if(f<=0)continue;const[dx,dy]=EIGHT_DIRECTIONS[d],xx=x+dx*hop,yy=y+dy*hop;if(xx<0||yy<0||xx>=side||yy>=side){boundaryDemand+=f;continue;}let allowed=true;for(let t=1;t<=hop;t++){const px=x+dx*t,py=y+dy*t;if(!highWet[py*side+px]||(d>=4&&(!highWet[(py-dy)*side+px]||!highWet[py*side+px-dx]))){allowed=false;break;}}if(!allowed){blockedDry++;continue;}fractions[i*8+d]=f;}}
 return{fractions,hop,boundaryDemand,blockedDry,epoch:driver.epoch,passStep:driver.passStep,passStride:driver.passStride};
}
export function applyActualEightFractions({source,side=128,lift}){
 if(source?.length!==side*side*8||lift?.fractions?.length!==side*side*8||lift.boundaryDemand!==0||!source.every(v=>Number.isFinite(v)&&v>=0))throw Error('Actual8 admitted positive input');const out=new Float64Array(source.length);
 for(let i=0;i<side*side;i++){const x=i%side,y=Math.floor(i/side);let sum=0;for(let d=0;d<8;d++){const f=lift.fractions[i*8+d];if(!Number.isFinite(f)||f<0)throw Error('Actual8 donor');sum+=f;}if(sum>1)throw Error('Actual8 overdraw');for(let c=0;c<8;c++)out[i*8+c]+=source[i*8+c]*(1-sum);for(let d=0;d<8;d++){const f=lift.fractions[i*8+d];if(!f)continue;const[dx,dy]=EIGHT_DIRECTIONS[d],xx=x+dx*lift.hop,yy=y+dy*lift.hop;if(xx<0||yy<0||xx>=side||yy>=side)throw Error('Actual8 escape');const j=yy*side+xx;for(let c=0;c<8;c++)out[j*8+c]+=source[i*8+c]*f;}}
 return out;
}
