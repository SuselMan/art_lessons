export const EIGHT_DIRECTIONS=Object.freeze([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].map(d=>Object.freeze(d)));
/** Experimental positive paired prototype. Axial:diagonal4:1 gives isotropic fourth moment on flat fields. */
export function commonEightNeighborStep({enabled=false,side,source,wet,cost,capacity,hop=8,rate=.5,travel=.35,band=.8}={}){
 if(!enabled)return null;const n=side*side;if(![128,256].includes(side)||source?.length!==n*8||wet?.length!==n||cost?.length!==n||capacity?.length!==n||!Number.isInteger(hop)||hop<=0||hop>=side||![rate,travel,band].every(Number.isFinite)||rate<0||rate>1||travel<0||travel>1||band<=0)throw Error('Bounded8-neighbor contract');
 if(!source.every(v=>Number.isFinite(v)&&v>=0)||!cost.every(v=>Number.isFinite(v)&&v>=0)||!capacity.every(v=>Number.isFinite(v)&&v>0))throw Error('Positive finite8 inputs');
 const fractions=new Float64Array(n*8);if(rate===0||travel===0)return{admitted:true,moments:source.slice(),fractions,boundaryDemand:0,blockedDry:0,hop};let boundaryDemand=0,blockedDry=0;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const i=y*side+x,m=source[i*8+3];if(m<=0||!wet[i]||cost[i]>band)continue;const weights=Array(8).fill(0),neighbours=Array(8).fill(-1);
  for(let d=0;d<8;d++){const[dx,dy]=EIGHT_DIRECTIONS[d],xx=x+dx*hop,yy=y+dy*hop;if(xx<0||yy<0||xx>=side||yy>=side){boundaryDemand+=m;continue;}const j=yy*side+xx;if(cost[j]>band)continue;let allowed=true;
   // Diagonal requires both orthogonal corner cells at every high-world pixel.
   for(let t=1;t<=hop;t++){const nx=x+dx*t,ny=y+dy*t;if(!wet[ny*side+nx]||cost[ny*side+nx]>band||(dx&&dy&&(!wet[(ny-dy)*side+nx]||!wet[ny*side+nx-dx]||cost[(ny-dy)*side+nx]>band||cost[ny*side+nx-dx]>band))){allowed=false;break;}}
   if(!allowed){blockedDry++;continue;}neighbours[d]=j;weights[d]=d<4?4:1;
  }
  const total=weights.reduce((a,b)=>a+b,0);if(!total)continue;
  for(let d=0;d<8;d++){const j=neighbours[d];if(j<0)continue;const a=capacity[i],b=capacity[j],pair=2*a*b/(a+b),delta=Math.max(travel*m/a-travel*source[j*8+3]/b,0);fractions[i*8+d]=rate*(5/6)*weights[d]/total*Math.min(delta*pair,travel*m)/Math.max(m,5e-5);}
 }
 if(boundaryDemand>0)return{admitted:false,reason:'boundary-fallback',boundaryDemand,blockedDry};
 const out=new Float64Array(source.length);for(let i=0;i<n;i++){const x=i%side,y=Math.floor(i/side);let sum=0;for(let d=0;d<8;d++)sum+=fractions[i*8+d];if(sum>1)throw Error('8 donor overdraw');for(let c=0;c<8;c++)out[i*8+c]+=source[i*8+c]*(1-sum);for(let d=0;d<8;d++){const f=fractions[i*8+d];if(!f)continue;const[dx,dy]=EIGHT_DIRECTIONS[d],j=(y+dy*hop)*side+x+dx*hop;for(let c=0;c<8;c++)out[j*8+c]+=source[i*8+c]*f;}}
 return{admitted:true,moments:out,fractions,boundaryDemand,blockedDry,hop,limitations:['Experimental8-neighbor conductance, not literal actual4-axis pressure/path policy','rate5/6 matches flat-field second moment to four-axis equally-weighted total rate; nonlinear capacity/eligibility can change calibration','No cost-gradient uphill path flags here: eligibility wet/cost/corners only; actual-driver adapter is separate work','Boundary demand is conservative rejection even when missing-neighbor give would be zero']};
}
