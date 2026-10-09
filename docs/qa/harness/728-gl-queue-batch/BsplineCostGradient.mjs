/** Tensor cubic B-spline derivative, SAME cost samples, worldpitch8.
 * Positive partition-of-unity cost reconstruction. No sourceP smoothing.
 */
export function bsplineCostGradient({pressure,x,y}){
 if(pressure?.length!==65536||!Number.isFinite(x)||!Number.isFinite(y))throw Error('Cubic cost dimensions');const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
 const basis=t=>[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6],deriv=t=>[-((1-t)**2)/2,(9*t*t-12*t)/6,(-9*t*t+6*t+3)/6,t*t/2];
 const bx=basis(u),by=basis(v),dx=deriv(u),dy=deriv(v);let gx=0,gy=0;
 for(let j=0;j<4;j++)for(let i=0;i<4;i++){const xx=Math.max(0,Math.min(127,ix+i-1)),yy=Math.max(0,Math.min(127,iy+j-1)),c=pressure[(yy*128+xx)*4];if(!Number.isFinite(c))throw Error('Finite cubic cost');gx+=c*dx[i]*by[j]/8;gy+=c*bx[i]*dy[j]/8;}return[gx,gy];
}
