const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
/** Two PREDECLARED causal controls. Actual pressure/wet support remains identical.
 * g fixed from original firstdriver; no currentP potential/capacity in controls.
 */
export function conductanceAblation({kind,pressure,fluid,band,g,center}){
 if(!['homogeneous','radial'].includes(kind)||pressure?.length!==65536||fluid?.length!==16384||!Number.isFinite(g)||g<0||g>1||center?.length!==2)throw Error('Two bounded predefineddrivercontrols');const f=new Float64Array(16384*8),supports=(x,y)=>x>=0&&y>=0&&x<128&&y<128&&pressure[(y*128+x)*4]<=band&&fluid[y*128+x]>0;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){if(!supports(x,y))continue;const rx=(x+.5)*8-center[0],ry=(y+.5)*8-center[1],r=Math.hypot(rx,ry);for(let d=0;d<8;d++){const[dx,dy]=dirs[d];if(!supports(x+dx,y+dy)||(d>=4&&(!supports(x+dx,y)||!supports(x,y+dy))))continue;const bias=kind==='radial'&&r>0?(rx*dx+ry*dy)/(r*Math.hypot(dx,dy)):0;f[(y*128+x)*8+d]=g*(d<4?.2:.05)*Math.max(0,1+bias);}}
 return{fractions:f,kind,g,beta:kind==='radial'?1:0,scope:'Replace direction/currentP capacity conductance only; SAME evolvingpressure/fullwet eligibility'};
}
