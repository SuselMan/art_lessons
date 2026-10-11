// Isolated artistic models. Fixed input, seed and step count; no wall-clock physics.
export const KINDS = ['capillary', 'particles', 'channels'];
export const TITLES = ['Капиллярный поток', 'Пигментные частицы', 'Каналы бумаги'];
const N = 112, TOTAL = 100, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function hash(x, y, seed) { let h = Math.imul(x + seed, 374761393) ^ Math.imul(y + 17, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return (h >>> 0) / 4294967295; }
function segment(x,y,a,b) { const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); }
export function createModel(kind, scene = 'cross', seed = 731) {
 const start=performance.now(), len=N*N, w=new Float64Array(len), p=[new Float64Array(len),new Float64Array(len)], settled=[new Float64Array(len),new Float64Array(len)], rough=new Float64Array(len), initial=[new Float64Array(len),new Float64Array(len)], wetMask=new Float64Array(len); let tick=0; const particles=[];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++) { const i=y*N+x,u=x/N,v=y/N; rough[i]=.55*hash(x>>1,y>>1,seed)+.45*hash(x,y,seed+4);
  if(scene==='cross') { const ds=[segment(u,v,[.18,.28],[.78,.69]),segment(u,v,[.26,.79],[.73,.23])]; for(let c=0;c<2;c++){let a=clamp((.086-ds[c])/.012);a*=.78+.22*Math.sin((u*45+v*65)*Math.PI)**2; p[c][i]=a*.78;w[i]+=a*.65; } }
  else {const d=Math.hypot(u-.5,v-.5),a=clamp((.275-d)/.025);w[i]=a*.92;p[0][i]=a*.05;p[1][i]=clamp((.047-Math.hypot(u-.49,v-.47))/.011)*1.5;}
  initial[0][i]=p[0][i];initial[1][i]=p[1][i];wetMask[i]=w[i];
 }
 const metrics={kind,scene,grid:N,steps:TOTAL,initMs:0,computeMs:0,renderMs:0,renderCount:0,lastRenderMs:0,seed};
 // B: bounded particle transport has no iterative full-field pigment solver.
 if(kind==='particles')for(let i=0;i<len;i++)for(let c=0;c<2;c++)if(p[c][i]>.015) { const count=4; for(let j=0;j<count;j++)particles.push({x:i%N+hash(i,j,seed),y:(i/N|0)+hash(i,j,seed+1),c,m:p[c][i]*.78/count,alive:true});settled[c][i]=p[c][i]*.22;p[c][i]=0; }
 // C: multi-source travel costs over a static paper channel graph.
 const distance=[new Float64Array(len).fill(1e6),new Float64Array(len).fill(1e6)], origins=[new Int32Array(len).fill(-1),new Int32Array(len).fill(-1)];
 if(kind==='channels')for(let c=0;c<2;c++)for(let i=0;i<len;i++)if(initial[c][i]>.12){distance[c][i]=0;origins[c][i]=i;}
 function neighbors(i) {const x=i%N,y=i/N|0;return [x?i-1:-1,x<N-1?i+1:-1,y?i-N:-1,y<N-1?i+N:-1];}
 // A: conservative pair flux. Separate deposition keeps deposited pigment immobile.
 function capillary() {const dw=new Float64Array(len),dp=[new Float64Array(len),new Float64Array(len)]; for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x;for(const j of [i+1,i+N]) {const conduct=.13*(.4+rough[i]+rough[j]);let flow=(w[i]-w[j])*conduct;const from=flow>0?i:j,to=flow>0?j:i;flow=Math.min(Math.abs(flow),w[from]*.12);dw[from]-=flow;dw[to]+=flow;for(let c=0;c<2;c++){let f=Math.min(p[c][from]*.2,flow*p[c][from]/Math.max(.06,w[from]));dp[c][from]-=f;dp[c][to]+=f;} if(scene==='dot'&&w[i]>.15&&w[j]>.15){const horizontal=j===i+1,mid=horizontal?x-N*.49:y-N*.47,src=mid>0?i:j,dst=mid>0?j:i;for(let c=0;c<2;c++){if(c===0)continue;const adv=p[c][src]*.13;dp[c][src]-=adv;dp[c][dst]+=adv;}}}
 }for(let i=0;i<len;i++){w[i]=Math.max(0,w[i]+dw[i]);const edge=w[i]>.02?neighbors(i).reduce((a,j)=>a+(j>=0&&w[j]<w[i]*.5?1:0),0):0;w[i]=Math.max(0,w[i]-(.0035+.0018*edge));for(let c=0;c<2;c++){p[c][i]=Math.max(0,p[c][i]+dp[c][i]);const deposit=p[c][i]*clamp(.003+.008*(1-w[i])+.004*rough[i]+edge*.025,0,.15);p[c][i]-=deposit;settled[c][i]+=deposit;}} }
 function splat(a,x,y,m){x=clamp(x,1,N-2);y=clamp(y,1,N-2);const ix=x|0,iy=y|0,fx=x-ix,fy=y-iy,i=iy*N+ix;a[i]+=m*(1-fx)*(1-fy);a[i+1]+=m*fx*(1-fy);a[i+N]+=m*(1-fx)*fy;a[i+N+1]+=m*fx*fy;}
 function particleStep(){for(const q of particles){if(!q.alive)continue;const x=clamp(q.x,1,N-2),y=clamp(q.y,1,N-2),i=(y|0)*N+(x|0),ns=neighbors(i);const gx=wetMask[ns[1]]-wetMask[ns[0]],gy=wetMask[ns[3]]-wetMask[ns[2]];
  const noiseAngle=hash(i,tick+q.c*103,seed)*Math.PI*2;let vx=-gx*.15,vy=-gy*.15;
  if(scene==='dot'&&q.c===1){const dx=x-N*.49,dy=y-N*.47,r=Math.max(.8,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx),finger=.52+.3*Math.sin(angle*7+.4)+.18*Math.sin(angle*13+1.7),speed=.12+finger*.21;vx+=dx/r*speed;vy+=dy/r*speed;}
  else {vx+=(rough[i]-.5)*.12;vy+=(rough[ns[1]]-rough[ns[0]])*.1;}
  const nx=x+vx+Math.cos(noiseAngle)*.19,ny=y+vy+Math.sin(noiseAngle)*.19,ni=(clamp(ny,1,N-2)|0)*N+(clamp(nx,1,N-2)|0);
  // Wet boundary belongs to the union, never to an individual coloured stroke.
  const boundary=wetMask[ni]<.08; if(!boundary){q.x=nx;q.y=ny;}
  const fraction=boundary?.24:clamp(.0015+Math.max(0,tick-65)*.00055+rough[ni]*.0015);const deposit=q.m*fraction;splat(settled[q.c],q.x,q.y,deposit);q.m-=deposit;if(q.m<.0001){splat(settled[q.c],q.x,q.y,q.m);q.m=0;q.alive=false;}
 }for(let c=0;c<2;c++)p[c].fill(0);for(const q of particles)if(q.alive)splat(p[q.c],q.x,q.y,q.m);}
 function relaxChannels(){// Static paper distances computed once; no fluid PDE.
 for(let c=0;c<2;c++)for(let parity=0;parity<2;parity++)for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){if((x+y)%2!==parity)continue;const i=y*N+x;for(const j of [...neighbors(i),i-N-1,i-N+1,i+N-1,i+N+1]){const diagonal=Math.abs(j-i)>1&&Math.abs(j-i)!==N;const cost=(diagonal?1.414:1)*(.55+rough[i]*1.2+(wetMask[i]>.1?0:1.8));if(distance[c][j]+cost<distance[c][i]){distance[c][i]=distance[c][j]+cost;origins[c][i]=origins[c][j];}}}
 }
 if(kind==='channels')for(let sweep=0;sweep<24;sweep++)relaxChannels();
 function channelStep(){const radius=1+tick*(scene==='dot'?.2:.1);for(let c=0;c<2;c++)for(let i=0;i<len;i++){const origin=origins[c][i],d=distance[c][i];if(origin<0)continue;const fringe=clamp(1-d/radius),edge=Math.exp(-(((d-radius*.75)/1.1)**2));p[c][i]=initial[c][i]*(.76+.08*rough[i])+initial[c][origin]*fringe*.2+initial[c][origin]*edge*.13*(wetMask[i]<.22?1:0);}
 }
 function step(count=1){const t=performance.now();for(let s=0;s<count&&tick<TOTAL;s++){if(kind==='capillary')capillary();else if(kind==='particles')particleStep();else channelStep();tick++;}metrics.computeMs+=performance.now()-t;return tick;}
 function render(canvas){const t=performance.now(),ctx=canvas.getContext('2d'),size=canvas.width,img=ctx.createImageData(size,size),data=img.data;
 function sample(a,x,y){const ix=Math.min(N-2,x|0),iy=Math.min(N-2,y|0),fx=x-ix,fy=y-iy,i=iy*N+ix;return a[i]*(1-fx)*(1-fy)+a[i+1]*fx*(1-fy)+a[i+N]*(1-fx)*fy+a[i+N+1]*fx*fy;}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const gx=x/size*(N-1),gy=y/size*(N-1),noise=hash(x,y,seed),grain=.91+.18*noise;let yellow=sample(p[0],gx,gy)+sample(settled[0],gx,gy),blue=sample(p[1],gx,gy)+sample(settled[1],gx,gy);
  // High frequency native-like brush detail is pinned; transport contributes the low frequency wash.
  const detail= .93+.07*Math.sin(x*.61+y*.37)**2;yellow*=grain*detail;blue*=grain*detail;
  // Three-band absorption: yellow absorbs blue, cyan-blue absorbs red -> green overlap.
  const absorptions=[yellow*.13+blue*2.7,yellow*.2+blue*.55,yellow*3.5+blue*.16],i=(y*size+x)*4,paper=249+(noise-.5)*7;
  for(let c=0;c<3;c++)data[i+c]=clamp(paper*Math.exp(-absorptions[c]),0,255);data[i+3]=255;
 }ctx.putImageData(img,0,0);metrics.lastRenderMs=performance.now()-t;metrics.renderMs+=metrics.lastRenderMs;metrics.renderCount++;return canvas; }
 metrics.initMs=performance.now()-start;
 return {step,render,metrics,initialMass:initial.map(a=>a.reduce((s,v)=>s+v,0)),get tick(){return tick;},get done(){return tick===TOTAL;},mass(){return p.map((a,c)=>a.reduce((s,v,i)=>s+v+settled[c][i],0));},checksum(){let s=0;for(let c=0;c<2;c++)for(let i=0;i<len;i++)s=(s+Math.round((p[c][i]+settled[c][i])*1e6)*(i+1))%2147483647;return s;}};
}
