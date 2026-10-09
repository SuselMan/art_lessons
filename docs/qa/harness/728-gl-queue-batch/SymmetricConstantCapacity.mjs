const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],opposite=[1,0,3,2,7,6,5,4];
/** One declared w=1 effectivecapacity model, NOT measuredwater.
 * G_ij=min(existinghomogeneousconductance_ij,conductance_ji).
 * Common fractions symmetric: mass, hue, stationarity and maximumprinciple.
 */
export function symmetricConstantCapacity({driver,side=256,highWet}){
 if(driver?.fractions?.length!==side*side*8||highWet?.length!==side*side)throw Error('Symmetric capacity dimensions');const f=new Float64Array(driver.fractions.length);let maxOutflow=0,maxSymmetryError=0;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=y*side+x;if(!highWet[i])continue;let sum=0;for(let d=0;d<8;d++){const[dx,dy]=dirs[d],xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=side||yy>=side){f[i*8+d]=driver.fractions[i*8+d];sum+=f[i*8+d];continue;}const j=yy*side+xx;if(!highWet[j]||(d>=4&&(!highWet[(y+dy)*side+x]||!highWet[y*side+x+dx])))continue;const v=Math.min(driver.fractions[i*8+d],driver.fractions[j*8+opposite[d]]);if(!Number.isFinite(v)||v<0)throw Error('Positive symmetricconductance');f[i*8+d]=v;sum+=v;}maxOutflow=Math.max(maxOutflow,sum);if(sum>1)throw Error('Symmetric capacity CFL');}
 for(let i=0;i<side*side;i++)for(let d=0;d<8;d++){const[dx,dy]=dirs[d],x=i%side+dx,y=Math.floor(i/side)+dy;if(x>=0&&y>=0&&x<side&&y<side)maxSymmetryError=Math.max(maxSymmetryError,Math.abs(f[i*8+d]-f[(y*side+x)*8+opposite[d]]));}
 return{...driver,fractions:f,effectiveCapacity:1,physicalWater:false,maxOutflow,maxSymmetryError};
}
