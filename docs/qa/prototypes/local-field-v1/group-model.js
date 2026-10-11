import { PencilEngine } from '/src/engine/index.ts';
import { AccumulationBuffer } from '/src/engine/src/buffers/AccumulationBuffer.ts';
import { RibbonStrokeScratch } from '/src/engine/src/buffers/RibbonStrokeScratch.ts';
import { ribbonProfileFor } from '/src/engine/src/dabs/ribbonProfile.ts';
import { watercolorPresetString } from '/src/engine/src/presets/watercolorPresets.ts';
import { PaperWetness, quantizeWet } from '/src/engine/src/paper/paperWetness.ts';
class Layer {
  constructor(buffer){this.tile={buffer,originX:0,originY:0,contentRect:null}}
  resolveForPaint(r){return r.maxX>0&&r.maxY>0&&r.minX<this.tile.buffer.width&&r.minY<this.tile.buffer.height?[this.tile]:[]}
  resolveVisible(r){return this.resolveForPaint(r)} resolveExistingForPaint(r){return this.resolveForPaint(r)}
  resolveCoarse(){return null} coarseWorldSize(){return {w:this.tile.buffer.width,h:this.tile.buffer.height}}
  allResident(){return [this.tile]} getContentBoundsWorld(){return this.tile.contentRect}
  markContentPainted(r){const a=this.tile.contentRect;this.tile.contentRect=a?{minX:Math.min(a.minX,r.minX),minY:Math.min(a.minY,r.minY),maxX:Math.max(a.maxX,r.maxX),maxY:Math.max(a.maxY,r.maxY)}:{...r}}
  tightenContentRects(){} clearContentAt(){this.tile.contentRect=null} restoreTileContent(r){this.tile.contentRect={...r}}
  clear(){this.tile.buffer.clear();this.tile.contentRect=null} destroy(){this.tile.buffer.destroy()}
}
const union=(a,b)=>a?{minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)}:{...b};
export async function createGroupWatercolor(canvas,{size=768,auto=true,fieldSize=1536}={}){
 canvas.width=canvas.height=size;
 const engine=new PencilEngine(canvas,{userId:'group-probe',pageWidth:size,pageHeight:size,paper:'fine',watercolorReview:true,bandBatch:true});
 engine._pointer.destroy();const display=engine._display.bind(engine);engine._scheduleDisplay=()=>{};engine._display=()=>{};await engine.paperReady();
 engine.appendOperation({id:'group-layer',type:'layer_add',layerId:'local',name:'Группа',userId:'group-probe',timestamp:1});engine.setActiveLayer('local');engine.setCompositeOrder([{id:'local',opacity:1}]);
 const gl=engine.gl,pool=engine._ribbonScratchPool;
 // Small QA domain only: a fixed field size is part of the model parameters.
 // Normal sheet retains the existing 1536 field; never resize by prior history.
 if(fieldSize!==1536)engine._diffuseFieldFor=(w,h)=>{
  if(w>fieldSize||h>fieldSize)throw new Error('QA field too small');
  let f=engine._fieldCache[0];if(!f){f={w:fieldSize,h:fieldSize};for(const k of ['a','b','c','coverage','ca','cb','cc','mask','pressure','band'])f[k]=new AccumulationBuffer(gl,fieldSize,fieldSize,'nearest');engine._fieldCache=[f]}
  for(const k of ['a','b','c','coverage','ca','cb','cc','mask','pressure','band'])f[k].clear();return f;
 };

 const base=new AccumulationBuffer(gl,size,size),raw=new AccumulationBuffer(gl,size,size),out=new AccumulationBuffer(gl,size,size);[base,raw,out].forEach(b=>b.clear());
 const rawLayer=new Layer(raw),workLayer=new Layer(out),wet=new PaperWetness(),queue=[],tape=[];
 let scratch=new RibbonStrokeScratch(pool,true,true),job=null,working=null,workMeta=null,workScalars=null,frame=0,disposed=false,active=null,last=null,gesture=0,paintGesture=null,prev=null,dirty=false,barrier=false,dryPending=false,generation=0,parts=[],bounds=null,paintAt=0,redoTape=null,solvedGeneration=null;
 const stats={paintBatches:0,starts:0,cancels:0,completed:0,solverOps:0,publications:0,stalePublications:0,sourceSize:size,fieldSize};
 const visible=()=>engine._layers.get('local').resolveForPaint({minX:0,minY:0,maxX:size,maxY:size})[0];
 const show=buffer=>{const tile=visible();if(tile.buffer.width===size&&tile.buffer.height===size)buffer.copyTo(tile.buffer);else engine._drawTileComposite({wx:size/2,wy:size/2,centerX:size/2,centerY:size/2,scale:1,angle:0,view:{minX:0,minY:0,maxX:size,maxY:size}},buffer.texture,0,0,size,size,1,tile.buffer.fbo,tile.buffer.width,tile.buffer.height);tile.contentRect={minX:0,minY:0,maxX:size,maxY:size};engine._invalidateSplitCache();display()};
 const cancel=()=>{if(job){job.dispose();job=null;working.destroy();working=null;stats.cancels++}generation++};
 const composite=(dep,col,cov)=>{const e=working.peek(out),f=workMeta.finish,c=workScalars;engine._drawRibbonCompositeRect(workLayer.tile,job.compositeDomain,f.preset,f.profile,e.original,cov,dep,col,f.color,f.opacity,f.fieldSeed,c.spreadPx,c.water,c.migratePx,0,workScalars.direction,c.bristleRadiusPx);show(out);stats.publications++};
 const start=()=>{
  if(!bounds||job)return;raw.copyTo(out);working=new RibbonStrokeScratch(pool,true,true);
  const from=scratch.peek(raw),to=working.getOrCreate(out);
  for(const name of ['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad'])if(from[name]){if(!to[name])to[name]=pool.acquire(size,size);from[name].copyTo(to[name])}
  const latest=scratch.captureFinishMetadata(),f={...latest.finish,target:workLayer,bounds:{...bounds},radiusPx:Math.max(...parts.map(p=>p.finish.radiusPx)),wetPeak:Math.max(...parts.map(p=>p.finish.wetPeak)),landedWet:Math.max(...parts.map(p=>p.finish.landedWet))};
  working.noteFinish(f);for(const p of latest.paints)working.paints.add(p);
  workMeta={...latest,finish:f,brushTravel:parts.flatMap(p=>p.brushTravel),wetContacts:parts.flatMap(p=>p.wetContacts),foreignSources:null,dryCtx:null};
  workScalars={...scratch.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[.37,.61],bristleRadiusPx:0})),direction:[1,0]};
  const ownGeneration=generation;
  job=engine._diffuseWashOps(working,[workLayer.tile],bounds,0,f.radiusPx,f.profile.waterLevel,f.landedWet,f.profile.waterLevel,f.wetPeak,f.dwellMs,(_tile,p,c,v)=>{if(ownGeneration!==generation){stats.stalePublications++;return}composite(p,c,v)},workMeta,false);
  if(job){job.next=0;stats.starts++}else{working.destroy();working=null;dirty=false}
 };
 const paint=c=>{
  cancel();if(paintGesture!==c.id){if(paintGesture!==null)scratch.releaseFilm();scratch.beginStroke();prev=undefined;paintGesture=c.id;wet.commitPending(c.now)}
  const name=watercolorPresetString('normal',{water:c.s.water,pigment:c.s.pigment},c.s.code),preset=engine._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name),color=[1,3,5].map(i=>parseInt(c.s.color.slice(i,i+2),16)/255);
  const wetProfile=c.dabs.map(d=>quantizeWet(wet.sample('local',d.x,d.y,c.now))).join('');
  const work=engine._ribbonPainter.paint(rawLayer,c.dabs,preset,name,profile,color,scratch,prev,wetProfile,[.37,.61],false,0,{waterOnly:false,segmented:false});while(!work.next().done){}
  prev=scratch.lastKept??c.dabs[c.dabs.length-1];for(const d of c.dabs)wet.deposit('local',d.x,d.y,d.size*.5,c.s.water,c.now,true);
  const meta=scratch.captureFinishMetadata();bounds=union(bounds,meta.finish.bounds);parts=parts.filter(p=>p.id!==c.id);parts.push({...meta,id:c.id});dirty=true;paintAt=performance.now();stats.paintBatches++;show(raw);
 };
 const commitDry=()=>{out.copyTo(base);base.copyTo(raw);scratch.destroy();scratch=new RibbonStrokeScratch(pool,true,true);rawLayer.tile.contentRect=null;parts=[];bounds=null;paintGesture=null;prev=undefined;wet.clear();barrier=false;dryPending=false;dirty=false;show(base)};
 const applyNext=()=>{const c=queue.shift();if(c.type==='dry'){barrier=true;dirty=!!bounds&&solvedGeneration!==generation}else {while(queue[0]?.type==='paint'&&queue[0].id===c.id&&c.dabs.length+queue[0].dabs.length<=96){const next=queue.shift();c.dabs=[...c.dabs,...next.dabs]}paint(c)}};
 const tick=()=>{
  frame=0;if(disposed||gl.isContextLost())return;
  if(!barrier&&queue.length)applyNext();
  if(!job&&dirty&&(barrier||!active&&queue.length===0&&performance.now()-paintAt>=40))start();
  if(job){const at=performance.now();let count=0;while(job&&job.next<job.ops.length&&count++<4){job.ops[job.next++]();stats.solverOps++;if(performance.now()-at>4)break}if(job.next===job.ops.length){job.finish();const e=working.peek(out);composite(e.inkDry??e.inkLoad,e.colorDry??e.inkColor,e.coverage);job.dispose();job=null;working.destroy();working=null;dirty=false;solvedGeneration=generation;stats.completed++;if(barrier)commitDry()}}
  if(barrier&&!job&&!dirty)commitDry();
  if(queue.length||job||dirty)schedule();
 };
 const schedule=()=>{if(auto&&!frame&&!disposed)frame=requestAnimationFrame(tick)};
 const dab=(p,s)=>({x:p.x,y:p.y,pressure:p.pressure,tiltX:0,tiltY:0,size:s.size,aspectRatio:1,angle:0,opacity:1,t:Math.max(0,(p.time??performance.now())-active.at)});
 const enqueue=(dabs,s)=>{const c={type:'paint',id:String(gesture),dabs,s:{...s},now:performance.now()};queue.push(c);tape.push(structuredClone(c));schedule()};
 show(base);
 return {version:'group-recompute-v1',engine,gl,stats,tape,
 begin(p,s){redoTape=null;gesture++;active={...s,at:p.time??performance.now()};last={...p};if(!barrier&&!dryPending)cancel();enqueue([dab(p,s)],s)},
 move(p){if(!active)return;const n=Math.max(1,Math.ceil(Math.hypot(p.x-last.x,p.y-last.y)/(active.size*.12))),d=[];for(let i=1;i<=n;i++){const t=i/n;d.push(dab({x:last.x+(p.x-last.x)*t,y:last.y+(p.y-last.y)*t,pressure:last.pressure+(p.pressure-last.pressure)*t,time:(last.time??active.at)+((p.time??performance.now())-(last.time??active.at))*t},active))}enqueue(d,active);last={...p}},
 end(){active=null;last=null;schedule()},
 dry(){if(dryPending)return;dryPending=true;queue.push({type:'dry'});tape.push({type:'dry'});schedule()},
 flushInput(){while(!barrier&&queue[0]?.type==='paint')applyNext()},
 step(){tick()},
 get pending(){return !!(queue.length||job||dirty||dryPending)},get drying(){return dryPending},get solving(){return !!job},get generation(){return generation},
 rawRead(){return raw.readPixels()},read(){return out.readPixels()},
 clear(){cancel();queue.length=0;active=null;barrier=dryPending=dirty=false;scratch.destroy();scratch=new RibbonStrokeScratch(pool,true,true);[base,raw,out].forEach(b=>b.clear());wet.clear();parts=[];bounds=null;paintGesture=null;prev=undefined;solvedGeneration=null;tape.length=0;redoTape=null;show(base)},
 replay(entries){this.clear();const saved=structuredClone(entries);tape.push(...saved);queue.push(...structuredClone(saved));gesture=Math.max(0,...saved.filter(c=>c.type==='paint').map(c=>Number(c.id)));schedule()},
 undo(){if(active||this.pending)return;const saved=structuredClone(tape),lastPaint=[...saved].reverse().find(c=>c.type==='paint');if(!lastPaint)return;const cut=saved.findIndex(c=>c.type==='paint'&&c.id===lastPaint.id);this.replay(saved.slice(0,cut));redoTape=saved},
 redo(){if(active||this.pending||!redoTape)return;const saved=redoTape;this.replay(saved)},
 async exportPNG(){return new Promise(resolve=>canvas.toBlob(resolve))},
 destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);cancel();scratch.destroy();[base,raw,out].forEach(b=>b.destroy());engine.destroy()}
 };
}
