const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],pairs=[[0,1],[2,3],[4,7],[5,6]];
/** Continuous common fractions; step count is EXPLICIT calibration, never hiddenstride.
 * speed8:8 substeps, f unchanged => drift matched, local secondmoment /8.
 * moments64:64 substeps, oppositepair imbalance /8 => drift & local rawQ matched.
 * Multi-step accumulated covariance differs by63*muOuter; not exact8-hopoperator.
 */
export function unitHopFractions({coarse,origin,side=256,calibration='speed8'}){
 if(coarse?.length!==16384*8||![128,256].includes(side)||origin?.length!==2||!['speed8','moments64'].includes(calibration))throw Error('Unit-hop explicitdriver/calibration');const f=new Float64Array(side*side*8);const sample=(x,y,d)=>coarse[(Math.max(0,Math.min(127,y))*128+Math.max(0,Math.min(127,x)))*8+d];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const px=(origin[0]+x+.5)/8-.5,py=(origin[1]+y+.5)/8-.5,ix=Math.floor(px),iy=Math.floor(py),tx=px-ix,ty=py-iy,i=(y*side+x)*8;for(let d=0;d<8;d++)f[i+d]=sample(ix,iy,d)*(1-tx)*(1-ty)+sample(ix+1,iy,d)*tx*(1-ty)+sample(ix,iy+1,d)*(1-tx)*ty+sample(ix+1,iy+1,d)*tx*ty;if(calibration==='moments64')for(const[a,b]of pairs){const sum=f[i+a]+f[i+b],diff=(f[i+a]-f[i+b])/8;f[i+a]=(sum+diff)/2;f[i+b]=(sum-diff)/2;}let sum=0;for(let d=0;d<8;d++){if(!Number.isFinite(f[i+d])||f[i+d]<0)throw Error('Continuouspositivefractions');sum+=f[i+d];}if(sum>1)throw Error('CFL donoroverdraw');}
 return{fractions:f,substeps:calibration==='speed8'?8:64,calibration};
}
export function unitHopAdvance({source,side=256,driver,highWet,steps=driver.substeps}){
 if(source?.length!==side*side*8||driver?.fractions?.length!==source.length||highWet?.length!==side*side||![8,64].includes(steps))throw Error('Unit-hop paired dimensions');let state=source.slice(),next=new Float64Array(state.length);for(let sub=0;sub<steps;sub++){next.fill(0);for(let i=0;i<side*side;i++){if(!state.subarray(i*8,i*8+8).some(v=>v>0))continue;const x=i%side,y=Math.floor(i/side),edges=[];let sum=0;for(let d=0;d<8;d++){const f=driver.fractions[i*8+d];if(!f)continue;const[dx,dy]=dirs[d],xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=side||yy>=side)return{admitted:false,reason:'Outward unit-hop donor',substep:sub};const j=yy*side+xx;if(!highWet[i]||!highWet[j]||(d>=4&&(!highWet[(y+dy)*side+x]||!highWet[y*side+x+dx])))continue;edges.push([j,f]);sum+=f;}if(sum>1)throw Error('Unit-hop CFL');for(let c=0;c<8;c++)next[i*8+c]+=state[i*8+c]*(1-sum);for(const[j,f]of edges)for(let c=0;c<8;c++)next[j*8+c]+=state[i*8+c]*f;}[state,next]=[next,state];}return{admitted:true,moments:state};
}
