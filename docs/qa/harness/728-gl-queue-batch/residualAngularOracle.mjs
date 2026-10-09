import{pairedDonorOracle}from'./PreviewCostPathOracle.mjs';
/** Conditional topology ablation, NOT the literal GLSL pressure/capacity operator. */
export function residualAngularOracle(strides,{width=65,rate=.5}={}){
 const n=width*width,mid=(width-1)/2,initial=Float64Array.from({length:n},(_,i)=>Math.exp(-((i%width-mid)**2+(Math.floor(i/width)-mid)**2)/4)),water=Float64Array.from({length:n},(_,i)=>(i%width-mid)**2+(Math.floor(i/width)-mid)**2<27**2?1:0);let p=initial,c=initial;
 for(const stride of strides){const edges=[];for(let y=0;y<width;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!water[i])continue;for(const[dx,dy]of[[stride,0],[-stride,0],[0,stride],[0,-stride]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=width)continue;let wet=true;for(let s=1;s<=stride;s++)if(!water[(y+Math.sign(dy)*s)*width+x+Math.sign(dx)*s])wet=false;if(wet)edges.push([i,yy*width+xx,1]);}}({p,c}=pairedDonorOracle(p,c,edges,rate));}
 const mass=p.reduce((a,b)=>a+b,0),harmonic=k=>{let re=0,im=0,m=0;for(let i=0;i<n;i++){const x=i%width-mid,y=Math.floor(i/width)-mid;if(x*x+y*y<25)continue;const a=Math.atan2(y,x);re+=p[i]*Math.cos(k*a);im+=p[i]*Math.sin(k*a);m+=p[i];}return m?Math.hypot(re,im)/m:0;};
 return{steps:strides.length,mass,initialMass:initial.reduce((a,b)=>a+b,0),support:p.reduce((n,v)=>n+(v>1e-5),0),harmonic4:harmonic(4),harmonic8:harmonic(8),scope:'Uniform wet disc, four-axis paired donor graph with equal edges; omits actual GPU pressure/capacity/noise. Harmonics describe this conditional oracle only.'};
}
/** Subcell reconstruction clamp, isolated from paper/noise; conditional scalar oracle. */
export function residualClampOracle({width=65,scale=8}={}){
 const high=width*scale,mid=(high-1)/2,base=Float64Array.from({length:high*high},(_,i)=>Math.exp(-((i%high-mid)**2+(Math.floor(i/high)-mid)**2)/100)),initial=new Float64Array(width*width);
 for(let y=0;y<high;y++)for(let x=0;x<high;x++)initial[Math.floor(y/scale)*width+Math.floor(x/scale)]+=base[y*high+x]/(scale*scale);
 const mass=initial.reduce((a,b)=>a+b,0),transported=Float64Array.from(initial,(_,i)=>{const x=i%width-(width-1)/2,y=Math.floor(i/width)-(width-1)/2;return Math.exp(-(x*x+y*y)/50)}),normal=mass/transported.reduce((a,b)=>a+b,0);for(let i=0;i<transported.length;i++)transported[i]*=normal;
 const at=(a,x,y)=>a[Math.max(0,Math.min(width-1,y))*width+Math.max(0,Math.min(width-1,x))],interp=(a,x,y)=>{x=(x+.5)/scale-.5;y=(y+.5)/scale-.5;const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return at(a,ix,iy)*(1-fx)*(1-fy)+at(a,ix+1,iy)*fx*(1-fy)+at(a,ix,iy+1)*(1-fx)*fy+at(a,ix+1,iy+1)*fx*fy;};
 let baseline=0,unclamped=0,clamped=0,negativeAdded=0,upperRemoved=0,centerBefore=0,centerAfter=0;
 for(let y=0;y<high;y++)for(let x=0;x<high;x++){const b=base[y*high+x],r=b+interp(transported,x,y)-interp(initial,x,y),v=Math.min(1,Math.max(0,r));baseline+=b;unclamped+=r;clamped+=v;negativeAdded+=Math.max(0,-r);upperRemoved+=Math.max(0,r-1);if(x===Math.floor(mid)&&y===Math.floor(mid)){centerBefore=b;centerAfter=v;}}
 return{baselineMass:baseline,unclampedMass:unclamped,clampedMass:clamped,negativeClampAdded:negativeAdded,upperClampRemoved:upperRemoved,centerBefore,centerAfter,scope:'Mean-downsample radial Gaussian, conservative redistributed low mass, literal scalar base+bilerp(delta) clamp; not actual four-tap GPU source/pressure.'};
}
