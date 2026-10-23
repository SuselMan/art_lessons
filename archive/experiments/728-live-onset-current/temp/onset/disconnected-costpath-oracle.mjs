import{readFileSync,writeFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import assert from'node:assert/strict';
const report=JSON.parse(readFileSync('temp/onset/sheet3-stage-final-report.json')),arm=report.arms.find(a=>a.phase),pre=arm.planes.find(p=>p.label==='pre-carry'),w=354,h=266,N=w*h;
const load=name=>gunzipSync(readFileSync('temp/onset/sheet3-cpu-fields/ON-pre-carry-'+name+'.rgba.gz'));
const Praw=load('P'),Craw=load('C'),Vraw=load('V'),costraw=load('cost'),band=pre.band[0],budget=(1.5+4*band)/(1-band),costMax=budget+4;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const cost=Float64Array.from({length:N},(_,i)=>costraw[4*i]/255),V=Float64Array.from({length:N},(_,i)=>4*Vraw[4*i+3]/255),cap=Float64Array.from(cost,c=>1-.85*smooth(0,band,c));
const dirs=[[1,0],[-1,0],[0,1],[0,-1]],back=[1,0,3,2];const rate=.5,trav=.35,W=64;
const top=Math.floor(budget),up=[];for(let s=1;s<=top;s*=2)up.push(s);const strides=[...up,...up.slice().reverse()];assert.equal(strides.length,14);
function topology(s){const ws=new Float64Array(N*4),p=new Float64Array(N*4),phase=new Float64Array(N*4),neigh=new Int32Array(N*4).fill(-1);
 for(let i=0;i<N;i++){const x=i%w,y=(i/w)|0;let sum=0;for(let k=0;k<4;k++){const[dx,dy]=dirs[k],xx=x+dx*s,yy=y+dy*s;if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=yy*w+xx,z=4*i+k;neigh[z]=j;const ci=cost[i],cj=cost[j];if(cj>band)continue;const d=(cj-ci)*costMax;let v=0,phi=1;if(d<=1e-3){if(ci>1e-5||cj>1e-5||s>8)continue;let min=Math.min(V[i],V[j]);if(min<=0)continue;for(let n=1;n<s;n++){const l=(y+dy*n)*w+x+dx*n;if(cost[l]>1e-5||V[l]<=0){min=0;break}min=Math.min(min,V[l])}phi=smooth(.45,.7,min);v=W*phi;}else v=Math.min(s/d,4)**3*(1-smooth(0,band,cj))**1.6;ws[z]=v;phase[z]=phi;sum+=v;}if(sum)for(let k=0;k<4;k++)p[4*i+k]=ws[4*i+k]/sum;}
 const sharedPhase=new Float64Array(N*4);
 if(s<=8)for(let i=0;i<N;i++)for(let k=0;k<4;k++){const j=neigh[4*i+k];if(j<0)continue;const x=i%w,y=(i/w)|0,[dx,dy]=dirs[k];let min=Math.min(V[i],V[j]);for(let n=1;n<s;n++){const l=(y+dy*n)*w+x+dx*n;if(cost[l]>band){min=0;break}min=Math.min(min,V[l])}sharedPhase[4*i+k]=smooth(.45,.7,min);}
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const z=4*i+k,j=neigh[z];if(j<0||(cost[j]-cost[i])*costMax<=1e-3)continue;const x=i%w,y=(i/w)|0,[dx,dy]=dirs[k];for(let n=1;n<s;n++)if(cost[(y+dy*n)*w+x+dx*n]>band){ws[z]=0;break;}}
 const posP=new Float64Array(N*4),zeroPhi=new Float64Array(N*4);
 for(let i=0;i<N;i++){let ps=0;for(let k=0;k<4;k++){const j=neigh[4*i+k];if(j>=0&&(cost[j]-cost[i])*costMax>1e-3){posP[4*i+k]=ws[4*i+k];ps+=ws[4*i+k];}}
 if(ps)for(let k=0;k<4;k++)posP[4*i+k]/=ps;
 const x=i%w,y=(i/w)|0;for(let k=0;k<4;k++){const j=neigh[4*i+k];if(j<0||cost[i]>1e-5||cost[j]>1e-5)continue;const[dx,dy]=dirs[k];let min=Math.min(V[i],V[j]);for(let n=1;n<s;n++){const l=(y+dy*n)*w+x+dx*n;if(cost[l]>1e-5||V[l]<=0){min=0;break}min=Math.min(min,V[l]);}zeroPhi[4*i+k]=smooth(.45,.7,min);}}
 return{ws,p,phase,neigh,sharedPhase,posP,zeroPhi};}
function step(src,t,mode,integer=false){const out=src.map(a=>Float64Array.from(a));let rowBound=0,flux=0;
 for(let i=0;i<N;i++){let row=0;for(let k=0;k<4;k++){const j=t.neigh[4*i+k];if(j<0||cost[i]>band||cost[j]>band)continue;const g=mode==='mirroredPositive'?Math.max(t.posP[4*i+k],t.posP[4*j+back[k]])+t.zeroPhi[4*i+k]/4:mode==='positiveOnly'?t.posP[4*i+k]:mode==='independent'?t.posP[4*i+k]+t.zeroPhi[4*i+k]/4:mode==='shared'?(t.p[4*i+k]+t.p[4*j+back[k]])/2:mode==='sharedFinePhase'?t.p[4*i+k]+t.sharedPhase[4*i+k]*((t.p[4*i+k]+t.p[4*j+back[k]])/2-t.p[4*i+k]):t.p[4*i+k];let hh=2*cap[i]*cap[j]/(cap[i]+cap[j]);if(!['independent','positiveOnly','mirroredPositive'].includes(mode)&&cost[i]<=1e-5&&cost[j]<=1e-5)hh*=t.ws[4*i+k]/W;row+=rate*trav*g*hh/cap[i];}rowBound=Math.max(rowBound,row);
 for(const k of[0,2]){const j=t.neigh[4*i+k];if(j<0||cost[i]>band||cost[j]>band)continue;const Ti=trav*src[0][i]/cap[i],Tj=trav*src[0][j]/cap[j];if(Ti===Tj)continue;const donor=Ti>Tj?i:j,recv=Ti>Tj?j:i,dk=Ti>Tj?k:back[k],pi=t.p[4*i+k],pj=t.p[4*j+back[k]],pd=t.p[4*donor+dk],g=mode==='mirroredPositive'?Math.max(t.posP[4*i+k],t.posP[4*j+back[k]])+t.zeroPhi[4*i+k]/4:mode==='positiveOnly'?t.posP[4*donor+dk]:mode==='independent'?t.posP[4*donor+dk]+t.zeroPhi[4*i+k]/4:mode==='shared'?(pi+pj)/2:mode==='sharedFinePhase'?pd+t.sharedPhase[4*i+k]*((pi+pj)/2-pd):pd;if(!g)continue;let hh=2*cap[i]*cap[j]/(cap[i]+cap[j]);if(!['independent','positiveOnly','mirroredPositive'].includes(mode)&&cost[i]<=1e-5&&cost[j]<=1e-5)hh*=t.ws[4*i+k]/W;const q=rate*g*Math.min(Math.abs(Ti-Tj)*hh,trav*src[0][donor]);if(q<=0)continue;const qa=integer?Math.floor(q+1e-10):q;for(let c=0;c<src.length;c++){const qc=c===0?qa:integer?Math.floor(qa*src[c][donor]/Math.max(src[0][donor],1e-20)+1e-10):q*src[c][donor]/Math.max(src[0][donor],1e-20);out[c][donor]-=qc;out[c][recv]+=qc;}flux+=qa;}
 }
 for(const a of out)for(let i=0;i<N;i++)if(mode==='old'||mode==='sharedFinePhase'||mode==='positiveOnly'||mode==='independent'||mode==='mirroredPositive')a[i]=Math.round(Math.max(0,Math.min(255,a[i])));
 return{out,rowBound,flux};}

const sum=a=>a.reduce((x,y)=>x+y,0), gap=177, tests=[];
for(const mixed of [false,true]){
 for(let i=0;i<N;i++){const x=i%w;cost[i]=x===gap?1:mixed&&x>gap?.1:0;V[i]=x===gap?0:1;cap[i]=1-.85*smooth(0,band,cost[i]);}
 const source=Float64Array.from({length:N},(_,i)=>i%w<gap?100:0),t=topology(64);
 for(const mode of ['positiveOnly','independent','mirroredPositive']){
  const z=step([source],t,mode),right=z.out[0].reduce((s,v,i)=>s+(i%w>gap?v:0),0),dry=z.out[0].reduce((s,v,i)=>s+(i%w===gap?v:0),0);
  tests.push({mixedPositiveCost:mixed,mode,rightPigment:right,dryPixelPigment:dry,mass:sum(z.out[0]),initialMass:sum(source),rowBound:z.rowBound});
  if(!mixed)assert.equal(right,0);
 }
}
writeFileSync('temp/onset/disconnected-costpath-report.json',JSON.stringify({scope:'CPU single stride64, continuous face then UNORM per-cell rounding; no GPU claim',tests},null,2));console.log(JSON.stringify(tests,null,2));
