/** Isolated CPU preview oracle, no engine/canonical imports. Conservative common donor fractions. */
export function pairedTransportStep(source,width,height,{fractions,wet=null}={}){
 if(!(source instanceof Float64Array)||source.length!==width*height*8||fractions?.length!==width*height*4)throw Error('Explicit8moments/four donor fractions');
 const result=new Float64Array(source.length);let rejectedBoundary=0,rejectedDry=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;let used=0;const edges=[];
  for(const [d,dx,dy]of [[0,1,0],[1,-1,0],[2,0,1],[3,0,-1]]){const f=fractions[i*4+d];if(!Number.isFinite(f)||f<0)throw Error('Nonnegative finite fractions');used+=f;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height){rejectedBoundary+=source[i*8+7]*f;continue}const j=yy*width+xx;if(wet&&(!wet[i]||!wet[j])){rejectedDry+=source[i*8+7]*f;continue}edges.push([j,f]);}
  if(used>1+1e-12)throw Error('CFL outgoing fractions <=1');
  const accepted=edges.reduce((n,e)=>n+e[1],0);for(let k=0;k<8;k++){const value=source[i*8+k];if(!Number.isFinite(value)||value<0)throw Error('Positive finite source moments');result[i*8+k]+=value*(1-accepted);for(const [j,f]of edges)result[j*8+k]+=value*f;}
 }
 return{field:result,rejectedBoundary,rejectedDry};
}
export function boundedPairedOracle(){const width=32,height=32,n=width*height,source=new Float64Array(n*8),fractions=new Float64Array(n*4),wet=new Uint8Array(n).fill(1),tau=[.7,1.4,.35];let startMass=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,m=Math.exp(-((x-16)**2+(y-16)**2)/12);startMass+=m;source.set([m,m,m,m,...tau.map(t=>m*t/4),m],i*8);const dx=x-16,dy=y-16,r=Math.hypot(dx,dy)||1;fractions[i*4+(dx>=0?0:1)]=Math.abs(dx)/r*.22;fractions[i*4+(dy>=0?2:3)]=Math.abs(dy)/r*.22;}
 const identity=pairedTransportStep(source,width,height,{fractions:new Float64Array(n*4)}).field;let field=source,boundaryBlocked=0;const frames=[];for(let step=0;step<24;step++){const next=pairedTransportStep(field,width,height,{fractions,wet});field=next.field;boundaryBlocked+=next.rejectedBoundary;if([0,5,11,23].includes(step)){let mass=0,secondMoment=0,hueError=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,m=field[i*8+7];mass+=m;secondMoment+=m*((x-16)**2+(y-16)**2);if(m>1e-15)for(let k=0;k<3;k++)hueError=Math.max(hueError,Math.abs(field[i*8+4+k]*4/m-tau[k]));}frames.push({step:step+1,mass,secondMoment:secondMoment/mass,hueError});}}
 return{source,field,width,height,summary:{scope:'CPU radial outward visual motion, common four-axis fractions; no hardware/artist quality',identityExact:identity.every((v,i)=>v===source[i]),startMass,frames,boundaryBlocked,minimum:Math.min(...field),endpointCanonical:'Not evaluated; canonical unchanged and outside this oracle'}};
}
if(process.argv[1]?.endsWith('BoundedPairedTransportOracle.mjs'))console.log(JSON.stringify(boundedPairedOracle().summary,null,2));
