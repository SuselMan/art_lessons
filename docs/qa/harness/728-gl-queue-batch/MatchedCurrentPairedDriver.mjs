/** Offline actual sampled fullfilm and exact mode0 four-centre reduction.
 * Whole-field outside ROI stays capturedoldP; no cropped outside-zero fluid.
 */
export function matchedCurrentPairedDriver({moments,origin,side=256,oldP,water,pressure,band,passStride=1}){
 if(side!==256||moments?.length!==side*side*8||oldP?.length!==65536||water?.length!==65536||pressure?.length!==65536||origin?.length!==2||origin.some(x=>!Number.isInteger(x)||x%8||x<0||x+side>1024)||!Number.isFinite(band)||![1,2,4,8,16].includes(passStride))throw Error('Matched complete128/ROI256 fields');
 for(const a of[moments,oldP,water,pressure])if(!a.every(v=>Number.isFinite(v)&&v>=0))throw Error('Matched finite positivefields');
 const current=Float64Array.from(oldP),fluid=new Float64Array(16384),path=new Float64Array(65536),highWet=new Uint8Array(side*side);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)for(let c=0;c<4;c++){let sum=0;for(const dy of[3,4])for(const dx of[3,4])sum+=moments[((y*8+dy)*side+x*8+dx)*8+c]*.25;current[((origin[1]/8+y)*128+origin[0]/8+x)*4+c]=sum;}
 for(let i=0;i<16384;i++)fluid[i]=water[i*4+3];const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)for(let d=0;d<4;d++){const[dx,dy]=dirs[d];let allowed=true;for(let t=0;t<=passStride;t++){const xx=x+dx*t,yy=y+dy*t;if(xx<0||yy<0||xx>=128||yy>=128||pressure[(yy*128+xx)*4]>band||fluid[yy*128+xx]<=0){allowed=false;break;}}path[(y*128+x)*4+d]=allowed?1:0;}
 // Actual low128 film LINEAR interpolation at world pixel centre; alpha>0
 // is eligibility only, not movement scale. Domain sampler policy recorded.
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const px=(origin[0]+x+.5)/8-.5,py=(origin[1]+y+.5)/8-.5,x0=Math.floor(px),y0=Math.floor(py),tx=px-x0,ty=py-y0,sample=(xx,yy)=>fluid[Math.max(0,Math.min(127,yy))*128+Math.max(0,Math.min(127,xx))];const a=sample(x0,y0)*(1-tx)*(1-ty)+sample(x0+1,y0)*tx*(1-ty)+sample(x0,y0+1)*(1-tx)*ty+sample(x0+1,y0+1)*tx*ty;highWet[y*side+x]=a>0?1:0;}
 return{oldP:current,fluid,path,highWet,limitations:['CPU fullfilmLINEAR policy must match actual domain texture filtering; not GPU sampled proof','Dynamicpath unit/stride direct support; packedmulti-strideMode2 is not used','Highwet interpolatedsupport conservative corner veto enforced later']};
}
