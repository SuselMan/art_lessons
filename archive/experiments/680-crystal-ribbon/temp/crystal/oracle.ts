import {readFileSync,writeFileSync} from 'node:fs';
import {strokeDabs} from '../../packages/shared/src/dabCodec';
import {nibGeometry,nibSupport,poseSubdivisions} from '../../apps/web/src/engine/src/dabs/markerRibbon';
const ops=JSON.parse(readFileSync('/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json','utf8'));
const result=[];
for(const o of ops.filter(o=>o.seq>=45&&o.type==='stroke')){
 const ds=strokeDabs(o);const pairs=[];
 for(let i=1;i<ds.length;i++){
  const a=ds[i-1],b=ds[i],L=Math.hypot(b.x-a.x,b.y-a.y);if(L<1e-6)continue;
  const nx=-(b.y-a.y)/L,ny=(b.x-a.x)/L;
  const g0=nibGeometry(a,1),g1=nibGeometry(b,1),w0=nibSupport(g0,nx,ny).value,w1=nibSupport(g1,nx,ny).value;
  const steps=poseSubdivisions(g0,g1);
  // Independent trapezoid oracle: x is along travel, y is signed normal distance.
  // On triangles (0,0),(0,w0),(L,w1) and (0,0),(L,w1),(L,0):
  // interpolated across gradients respectively ((1-w1/w0)/L,1/w0), (0,1/w1).
  // Analytic y/(w0+(w1-w0)*x/L) is smooth throughout the same trapezoid.
  const gradientJump=Math.hypot((1-w1/w0)/L,1/w0-1/w1);
  pairs.push({i,L,w0,w1,steps,pressureJump:Math.abs(b.pressure-a.pressure),heldPressureError:Math.abs(b.pressure-a.pressure)*(steps-1)/steps,gradientJump,relativeNormalGradientJump:Math.abs(w1-w0)/Math.max(w0,w1)});
 }
 const max=(k)=>Math.max(...pairs.map(p=>p[k]));
 result.push({seq:o.seq,pairs:pairs.length,subdivided:pairs.filter(p=>p.steps>1).length,maxHeldPressureError:max('heldPressureError'),maxGradientJump:max('gradientJump'),maxRelativeNormalGradientJump:max('relativeNormalGradientJump'),worstPressure:pairs.sort((a,b)=>b.heldPressureError-a.heldPressureError).slice(0,3),worstGradient:pairs.sort((a,b)=>b.gradientJump-a.gradientJump).slice(0,3)});
}
writeFileSync('temp/crystal/oracle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
