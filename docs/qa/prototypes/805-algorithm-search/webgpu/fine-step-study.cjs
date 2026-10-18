'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{createHash}=require('node:crypto'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild'),{diagnose}=require('./carrier-grain-diagnostic.cjs');
const moduleCore={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/macro11-fine-paper-core.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module:moduleCore,exports:moduleCore.exports,Math,Object,Error});const{finePair}=moduleCore.exports;
const sha=b=>createHash('sha256').update(b).digest('hex');
function simulate(paper,n,base,steps){
 if(paper.length!==n*n||![32,64,128].includes(base)||![0,4,8,12].includes(steps))throw Error('Invalid bounded study');
 const initialVector=[24000,12000,4000,30000],cells=Array.from(paper,p=>({m:initialVector.slice(),freeAlpha:65535,affinity:base+Math.floor((255-p)/4),wet:true}));
 for(let phase=0;phase<steps;phase++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const h=phase%4<2,axis=h?x:y;if((axis&1)!==(phase&1)||axis+1>=n)continue;const i=y*n+x,j=i+(h?1:n),r=finePair(cells[i],cells[j]);cells[i].m=r.a;cells[j].m=r.b;}
 const totals=[0,0,0,0],rgba=new Uint8Array(n*n*4);for(let i=0;i<cells.length;i++){const c=cells[i];if(c.m.some(v=>v<0||v>c.m[3])||c.m[3]>c.freeAlpha)throw Error('Premul/capacity');for(let k=0;k<4;k++){totals[k]+=c.m[k];rgba[i*4+k]=Math.floor((c.m[k]+128)/257);}}
 if(totals.some((v,k)=>v!==initialVector[k]*n*n))throw Error('Mass mismatch');
 return{affinityBase:base,paperGain:1,fineSteps:steps,maximumAffinity:base+63,totals,guardPassed:true,descriptor:diagnose(rgba,paper,n,n,{maskThreshold:8}),rgbaSHA:sha(rgba)};
}
function run(file){const b=fs.readFileSync(file),N=1024**2;if(b.length!==N*6)throw Error('Expected common6MiB');const paper=new Uint8Array(64**2);for(let y=0;y<64;y++)for(let x=0;x<64;x++)paper[y*64+x]=b[N*5+(480+y)*1024+480+x];return{qualification:'CPU actual64paperpatch, uniform carrier, bounded fine pair study; no coarse solve, native fit, timing or artistic score.',patch:{rect:[480,480,64,64],inputSHA:sha(b),paperSHA:sha(paper)},reference:simulate(paper,64,64,0),rows:[32,64,128].flatMap(base=>[4,8,12].map(steps=>simulate(paper,64,base,steps)))};}
function plan(){return['mini-wave','gallery-sheet-3-slot-1','gallery-sheet-12-slot-1'].flatMap(fixture=>[32,64,128].flatMap(affinityBase=>[4,8,12].map(fineSteps=>({algorithm:'wgsl-macro-true-coherent-fine',fixture,encoding:'optical-density',repeats:3,measureTransport:true,exportRaw:true,config:{steps:256,mobilityGain:3,eddyCells:16,curlStrength:128,dither:1,paperGain:1,affinityBase,fineSteps,compactAux:true,compactCarrier:true}}))));}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2]),null,2));module.exports={simulate,run,plan};
