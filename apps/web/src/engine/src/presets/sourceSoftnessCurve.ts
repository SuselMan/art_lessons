import type {SourceCurvePolynomial} from './sourceCurve'
/** Functional native softness principle: retain endpoints, scale interior Y;
 * two-point curves acquire an actual midpoint. Natural pieces split at corners.
 * The bounded browser solver is not a native Eigen coefficient attestation. */
export function sourceSoftnessCurve(input:readonly {x:number;y:number;corner?:boolean}[],softness:number):SourceCurvePolynomial {
 if(!Number.isFinite(softness)||softness<0||softness>1||input.length<2||input.length>9)throw new RangeError('Invalid Soft curve transformation')
 const points=input.map(p=>({...p}))
 if(points.length===2)points.splice(1,0,{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,corner:false})
 for(let i=1;i<points.length-1;i++)points[i].y=Math.max(0,Math.min(1,points[i].y*softness))
 const coefficients:[number,number,number,number][]=[]
 let start=0
 while(start<points.length-1){
  let end=start+1;while(end<points.length-1&&!points[end].corner)end++
  const n=end-start+1,h=Array.from({length:n-1},(_,i)=>points[start+i+1].x-points[start+i].x)
  if(h.some(v=>!Number.isFinite(v)||v<=0))throw new RangeError('Invalid Soft curve knots')
  const diagonal=new Array<number>(n).fill(0),rhs=new Array<number>(n).fill(0),second=new Array<number>(n).fill(0)
  for(let i=1;i<n-1;i++){
   const left=h[i-1],right=h[i],lower=i===1?0:left/diagonal[i-1]
   diagonal[i]=2*(left+right)-lower*left
   rhs[i]=6*((points[start+i+1].y-points[start+i].y)/right-(points[start+i].y-points[start+i-1].y)/left)-lower*rhs[i-1]
  }
  for(let i=n-2;i>=1;i--)second[i]=(rhs[i]-h[i]*second[i+1])/diagonal[i]
  for(let i=0;i<n-1;i++){
   const x=points[start+i].x,y=points[start+i].y,a=(second[i+1]-second[i])/(6*h[i]),b=second[i]/2,c=(points[start+i+1].y-y)/h[i]-h[i]*(2*second[i]+second[i+1])/6
   coefficients.push([a,b-3*a*x,c-2*b*x+3*a*x*x,y-c*x+b*x*x-a*x*x*x])
  }
  start=end
 }
 return {points,coefficients}
}
