/** CPU literal WC_COST_DOMAIN_FRAG unpacked reduction, axis path only.
 * Cost support is NOT proof of solvent topology: caller must gate dry cells. */
export function costPathOracle(cost,width,height,band,stride){
 if(cost.length!==width*height||![1,2,4,8,16].includes(stride))throw Error('Bounded dyadic path');
 const dirs=[[1,0],[-1,0],[0,1],[0,-1]],inside=(x,y)=>x>=0&&y>=0&&x<width&&y<height;
 let a=new Float32Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<4;k++){const[dx,dy]=dirs[k],xx=x+dx,yy=y+dy;a[(y*width+x)*4+k]=inside(xx,yy)&&cost[y*width+x]<=band&&cost[yy*width+xx]<=band?1:0}
 for(let distance=1;distance<stride;distance*=2){const b=new Float32Array(a.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<4;k++){const[dx,dy]=dirs[k],xx=x+dx*distance,yy=y+dy*distance;b[(y*width+x)*4+k]=inside(xx,yy)?Math.min(a[(y*width+x)*4+k],a[(yy*width+xx)*4+k]):0}a=b}
 return a;
}
/** Donor fractions proof oracle, NOT full GLSL arithmetic/rounding oracle.
 * Shared P/C fractions read OLD inputs; rate<=1 ensures nonnegative outputs. */
export function pairedDonorOracle(p,c,edges,rate){
 if(p.length!==c.length||rate<0||rate>1)throw Error('Paired donor contract');
 const sums=new Float64Array(p.length);for(const[i,j,w]of edges){if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=p.length||j>=p.length||!Number.isFinite(w)||w<0)throw Error('Invalid edge');sums[i]+=w}
 const pp=Float64Array.from(p),cc=Float64Array.from(c);
 for(const[i,j,w]of edges){const fraction=sums[i]?rate*w/sums[i]:0,pm=p[i]*fraction,cm=c[i]*fraction;pp[i]-=pm;pp[j]+=pm;cc[i]-=cm;cc[j]+=cm}
 return{p:pp,c:cc};
}
