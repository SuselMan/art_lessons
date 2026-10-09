/** CPU audit of actual HIGH-resolution raw virtual P/C ROI (not low128 samples).
 * Literal wcInkAvg radius/weights, local-depth prior and ratio; interpolated ROI oracle. No physics mutation.
 * Require world-pixel footprint: low whole-world angular captures are invalid.
 */
export function auditResidualMaterialRatio({p,c,width=128,height=128,worldPixelSize,spacingPx=88}){
 if(worldPixelSize!==1||width!==128||height!==128||p?.length!==65536||c?.length!==65536)throw Error('Actual high128 paired ROI required; low-domain data invalid');
 const planes={};for(const [name,a]of [['p',p],['c',c]])planes[name]=[0,1,2,3].map(channel=>{const v=Array.from({length:width*height},(_,i)=>a[i*4+channel]),finite=v.filter(Number.isFinite);return {finite:finite.length,nonfinite:v.length-finite.length,min:Math.min(...finite),max:Math.max(...finite),rawSum:finite.reduce((a,b)=>a+b,0),negative:finite.filter(x=>x<0).length,clipAdded:finite.reduce((s,v)=>s+Math.max(0,-v),0),aboveOne:finite.filter(x=>x>1).length}});
 const sample=(a,x,y,k)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;const get=(xx,yy)=>Math.max(0,Math.min(1,a[(yy*width+xx)*4+k]));return (1-fy)*((1-fx)*get(x0,y0)+fx*get(x0+1,y0))+fy*((1-fx)*get(x0,y0+1)+fx*get(x0+1,y0+1))};
 const r=spacingPx*.5,dirs=[[1,0],[-1,0],[0,1],[0,-1],[.8660254,.5],[-.8660254,.5],[.8660254,-.5],[-.8660254,-.5],[.5,.8660254],[-.5,.8660254],[.5,-.8660254],[-.5,-.8660254]].map(([x,y])=>[r*x,r*y]);const margin=Math.ceil(r)+2;let nonfinite=0,denominatorMin=Infinity,tauMin=Infinity,tauMax=-Infinity,paintAboveOne=0,averagedMass=0,localMass=0;
 for(let y=margin;y<height-margin;y++)for(let x=margin;x<width-margin;x++){
  let ink=2*sample(p,x,y,3);for(const [dx,dy]of dirs)ink+=sample(p,x+dx,y+dy,3);ink*=.0714286*2;averagedMass+=ink;
  const depth=Array.from({length:4},(_,k)=>2*sample(c,x,y,k));localMass+=depth[3];const z=Math.max(0,Math.min(1,depth[3]/.12)),prior=.12*(1-z*z*(3-2*z)),local=depth.slice();for(const [dx,dy]of [[2,0],[-2,0],[0,2],[0,-2]])for(let k=0;k<4;k++)local[k]+=2*sample(c,x+dx,y+dy,k);
  const denom=depth[3]+prior;denominatorMin=Math.min(denominatorMin,denom);for(let k=0;k<3;k++){const tauPrior=prior>0?local[k]*4/Math.max(local[3],5e-5):0,tau=(depth[k]*4+tauPrior*prior)/denom,paint=Math.exp(-tau);if(!Number.isFinite(tau)||!Number.isFinite(paint))nonfinite++;tauMin=Math.min(tauMin,tau);tauMax=Math.max(tauMax,tau);paintAboveOne+=paint>1?1:0;}
 }
 return{planes,localCentreAudit:{margin,radiusWorld:r,denominatorMin,tauMin,tauMax,nonfinite,paintAboveOne,averagedMass,localMass},limitations:['Only exact high128 interior ROI; production paper/granulation/density/reveal omitted','P is ring-averaged, C/prior local exactly as production; ratios do not establish final quality','CPU JS is algebra oracle, not GLSL NaN behaviour proof','Off-centre interpolation of captured virtual samples need not commute with source sampler filtering or channel clamps; ring audit is approximate, centre raw finite/range exact' ]};
}
